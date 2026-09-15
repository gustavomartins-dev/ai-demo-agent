import { repositorySnapshotSchema, type RepositorySnapshot, type RepositorySourceFile } from "../repository/contract.js";

const API_ROOT = "https://api.github.com";
const DEFAULT_API_VERSION = "2026-03-10";
const MAX_FILES = 24;
const MAX_FILE_CHARACTERS = 16_000;
const MAX_TOTAL_CHARACTERS = 96_000;

type Fetcher = typeof fetch;

export type GitHubRepository = { owner: string; name: string };

export class GitHubRepositoryError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(`GitHub repository operation failed (${code})`, options);
    this.name = "GitHubRepositoryError";
  }
}

export function parseGitHubRepositoryUrl(value: string): GitHubRepository {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
    throw new GitHubRepositoryError("unsupported_repository_url");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) throw new GitHubRepositoryError("unsupported_repository_url");
  const owner = parts[0]!;
  const name = parts[1]!.replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new GitHubRepositoryError("unsupported_repository_url");
  }
  return { owner, name };
}

function headers(token?: string, version = DEFAULT_API_VERSION): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": version,
    "User-Agent": "ai-demo-agent",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function requestJson(fetcher: Fetcher, url: string, authentication: { token?: string }, version?: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: headers(authentication.token, version), signal });
    // OAuth tokens can be revoked independently of the user's session. Public
    // repositories must remain readable when that happens, so retry once
    // without credentials instead of failing the entire generation run.
    if (authentication.token && response.status === 401) {
      delete authentication.token;
      response = await fetcher(url, { headers: headers(undefined, version), signal });
    }
  } catch (error) {
    throw new GitHubRepositoryError("network_or_timeout", { cause: error });
  }
  if (!response.ok) throw new GitHubRepositoryError(`http_${response.status}`);
  try {
    return await response.json();
  } catch (error) {
    throw new GitHubRepositoryError("invalid_response", { cause: error });
  }
}

function isSafeTextPath(path: string): boolean {
  const normalized = path.toLowerCase();
  const segments = normalized.split("/");
  const ignored = new Set([".git", ".next", "node_modules", "dist", "build", "coverage", "vendor", "target", ".venv", "venv"]);
  if (segments.some((segment) => ignored.has(segment))) return false;
  const base = segments.at(-1) ?? "";
  if (base === ".env" || base.startsWith(".env.")) return false;
  if (/\.(pem|key|p12|pfx|jks|keystore|lock|map|min\.js)$/i.test(base)) return false;
  return /(^|\/)(readme[^/]*|package\.json|pyproject\.toml|requirements[^/]*\.txt|cargo\.toml|go\.mod|composer\.json|dockerfile|compose\.ya?ml)$/i.test(normalized)
    || /\.(md|mdx|ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|css|scss|html|vue|svelte|json|toml|ya?ml)$/i.test(base);
}

function filePriority(path: string): number {
  const normalized = path.toLowerCase();
  const base = normalized.split("/").at(-1) ?? "";
  if (/^readme/.test(base)) return 0;
  if (["package.json", "pyproject.toml", "cargo.toml", "go.mod", "composer.json"].includes(base)) return 1;
  if (!normalized.includes("/")) return 2;
  if (normalized.startsWith("src/") || normalized.includes("/src/")) return 3;
  if (normalized.startsWith("docs/")) return 4;
  return 5;
}

function decodeBlob(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (record.encoding !== "base64" || typeof record.content !== "string") return null;
  try {
    return Buffer.from(record.content.replaceAll("\n", ""), "base64").toString("utf8").slice(0, MAX_FILE_CHARACTERS);
  } catch {
    return null;
  }
}

function redactSensitiveContent(content: string): string | null {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) return null;
  return content
    .replace(/\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/g, "[REDACTED]")
    .replace(/((?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*)(["'`])[^"'`\r\n]{8,}\2/gi, "$1$2[REDACTED]$2");
}

export async function readGitHubRepositorySnapshot(
  repositoryUrl: string,
  options: { token?: string; apiVersion?: string; fetcher?: Fetcher; signal?: AbortSignal } = {},
): Promise<RepositorySnapshot> {
  const repository = parseGitHubRepositoryUrl(repositoryUrl);
  const fetcher = options.fetcher ?? fetch;
  const authentication = { ...(options.token ? { token: options.token } : {}) };
  const base = `${API_ROOT}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
  const repositoryData = await requestJson(fetcher, base, authentication, options.apiVersion, options.signal) as Record<string, unknown>;
  if (typeof repositoryData.default_branch !== "string") throw new GitHubRepositoryError("invalid_repository_response");
  const defaultBranch = repositoryData.default_branch;
  const commitData = await requestJson(fetcher, `${base}/commits/${encodeURIComponent(defaultBranch)}`, authentication, options.apiVersion, options.signal) as Record<string, unknown>;
  const sourceSha = typeof commitData.sha === "string" ? commitData.sha : null;
  const treeSha = (commitData.commit as { tree?: { sha?: unknown } } | undefined)?.tree?.sha;
  if (!sourceSha || typeof treeSha !== "string") throw new GitHubRepositoryError("invalid_commit_response");
  const treeData = await requestJson(fetcher, `${base}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`, authentication, options.apiVersion, options.signal) as Record<string, unknown>;
  const tree = Array.isArray(treeData.tree) ? treeData.tree : [];
  const candidates = tree
    .filter((entry): entry is { path: string; sha: string; type: string; url: string; size?: number } => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as Record<string, unknown>;
      return item.type === "blob" && typeof item.path === "string" && typeof item.sha === "string" && typeof item.url === "string"
        && (typeof item.size !== "number" || item.size <= 128_000) && isSafeTextPath(item.path);
    })
    .sort((a, b) => filePriority(a.path) - filePriority(b.path) || a.path.localeCompare(b.path))
    .slice(0, MAX_FILES);

  const files: RepositorySourceFile[] = [];
  let totalCharacters = 0;
  for (const candidate of candidates) {
    if (totalCharacters >= MAX_TOTAL_CHARACTERS) break;
    const expectedPrefix = `${base}/git/blobs/`;
    if (!candidate.url.startsWith(expectedPrefix)) continue;
    const blob = await requestJson(fetcher, candidate.url, authentication, options.apiVersion, options.signal);
    const decoded = decodeBlob(blob);
    if (!decoded || decoded.includes("\u0000")) continue;
    const redacted = redactSensitiveContent(decoded);
    if (!redacted) continue;
    const content = redacted.slice(0, MAX_TOTAL_CHARACTERS - totalCharacters);
    if (!content) break;
    files.push({ path: candidate.path, sha: candidate.sha, content });
    totalCharacters += content.length;
  }

  const readme = files.find((file) => /(^|\/)readme[^/]*$/i.test(file.path)) ?? null;
  return repositorySnapshotSchema.parse({
    provider: "github",
    owner: repository.owner,
    name: repository.name,
    defaultBranch,
    sourceSha,
    repositoryDescription: typeof repositoryData.description === "string" ? repositoryData.description : null,
    readme,
    files,
  });
}
