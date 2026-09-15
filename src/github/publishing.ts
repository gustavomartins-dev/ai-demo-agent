import type { LaunchPackageDraft } from "../launch/contract";
import type { RepositorySnapshot } from "../repository/contract";

const API_ROOT = "https://api.github.com";
const DEFAULT_API_VERSION = "2026-03-10";

type Fetcher = typeof fetch;

export type GitHubReleaseAsset = {
  name: string;
  contentType: string;
  data: Uint8Array;
};

export type GitHubPublishResult = {
  commitSha: string;
  releaseId: string;
  releaseUrl: string;
};

export class GitHubPublishProviderError extends Error {
  constructor(readonly code: string, readonly ambiguous: boolean, options?: ErrorOptions) {
    super(`GitHub publishing failed (${code})`, options);
    this.name = "GitHubPublishProviderError";
  }
}

function requestHeaders(token: string, version: string, contentType = "application/json"): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": contentType,
    "User-Agent": "ai-demo-agent",
    "X-GitHub-Api-Version": version,
  };
}

async function githubRequest(
  fetcher: Fetcher,
  url: string,
  token: string,
  version: string,
  init: RequestInit,
  expected: number[],
  writesStarted: boolean,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      headers: { ...requestHeaders(token, version, init.headers instanceof Headers ? init.headers.get("content-type") ?? "application/json" : (init.headers as Record<string, string> | undefined)?.["Content-Type"] ?? "application/json"), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new GitHubPublishProviderError("network_or_timeout", writesStarted, { cause: error });
  }
  if (!expected.includes(response.status)) {
    throw new GitHubPublishProviderError(`http_${response.status}`, writesStarted || response.status >= 500);
  }
  return response;
}

async function json(response: Response, code: string, ambiguous: boolean): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch (error) {
    throw new GitHubPublishProviderError(code, ambiguous, { cause: error });
  }
}

function safeAssetName(value: string): string {
  const name = value.replaceAll(/[^A-Za-z0-9._-]/g, "-").replaceAll(/-+/g, "-");
  if (!name || name === "." || name === "..") throw new GitHubPublishProviderError("invalid_asset_name", false);
  return name.slice(0, 120);
}

export async function publishGitHubLaunchPackage(
  repository: RepositorySnapshot,
  draft: LaunchPackageDraft,
  assets: GitHubReleaseAsset[],
  token: string,
  options: { apiVersion?: string; fetcher?: Fetcher } = {},
): Promise<GitHubPublishResult> {
  const fetcher = options.fetcher ?? fetch;
  const version = options.apiVersion ?? DEFAULT_API_VERSION;
  const base = `${API_ROOT}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;

  const repositoryResponse = await githubRequest(fetcher, base, token, version, { method: "GET" }, [200], false);
  const currentRepository = await json(repositoryResponse, "invalid_repository_response", false);
  if (currentRepository.default_branch !== repository.defaultBranch || (currentRepository.description ?? null) !== repository.repositoryDescription) {
    throw new GitHubPublishProviderError("source_changed", false);
  }

  const commitResponse = await githubRequest(fetcher, `${base}/commits/${encodeURIComponent(repository.defaultBranch)}`, token, version, { method: "GET" }, [200], false);
  const currentCommit = await json(commitResponse, "invalid_commit_response", false);
  if (currentCommit.sha !== repository.sourceSha) throw new GitHubPublishProviderError("source_changed", false);

  const readmePath = repository.readme?.path ?? "README.md";
  const currentReadme = await githubRequest(fetcher, `${base}/contents/${readmePath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(repository.defaultBranch)}`, token, version, { method: "GET" }, repository.readme ? [200] : [404], false);
  if (repository.readme) {
    const current = await json(currentReadme, "invalid_readme_response", false);
    if (current.sha !== repository.readme.sha) throw new GitHubPublishProviderError("source_changed", false);
  }

  const readmeResponse = await githubRequest(fetcher, `${base}/contents/${readmePath.split("/").map(encodeURIComponent).join("/")}`, token, version, {
    method: "PUT",
    body: JSON.stringify({
      message: `docs: publish ${draft.releaseTag} launch package`,
      content: Buffer.from(`${draft.readmeMarkdown.trim()}\n`, "utf8").toString("base64"),
      branch: repository.defaultBranch,
      ...(repository.readme ? { sha: repository.readme.sha } : {}),
    }),
  }, [200, 201], true);
  const readmeResult = await json(readmeResponse, "invalid_readme_publish_response", true);
  const publishedCommitSha = (readmeResult.commit as { sha?: unknown } | undefined)?.sha;
  if (typeof publishedCommitSha !== "string") throw new GitHubPublishProviderError("missing_commit_sha", true);

  await githubRequest(fetcher, base, token, version, {
    method: "PATCH",
    body: JSON.stringify({ description: draft.repositoryDescription }),
  }, [200], true);

  const releaseResponse = await githubRequest(fetcher, `${base}/releases`, token, version, {
    method: "POST",
    body: JSON.stringify({
      tag_name: draft.releaseTag,
      target_commitish: publishedCommitSha,
      name: draft.releaseTitle,
      body: draft.releaseNotesMarkdown,
      draft: true,
      prerelease: false,
    }),
  }, [201], true);
  const release = await json(releaseResponse, "invalid_release_response", true);
  const releaseId = typeof release.id === "number" || typeof release.id === "string" ? String(release.id) : null;
  const uploadUrl = typeof release.upload_url === "string" ? release.upload_url.replace(/\{.*$/, "") : null;
  if (!releaseId || !uploadUrl) throw new GitHubPublishProviderError("missing_release_identity", true);

  for (const asset of assets) {
    if (asset.data.byteLength === 0 || asset.data.byteLength > 100 * 1024 * 1024) {
      throw new GitHubPublishProviderError("invalid_asset_size", true);
    }
    const name = safeAssetName(asset.name);
    await githubRequest(fetcher, `${uploadUrl}?name=${encodeURIComponent(name)}`, token, version, {
      method: "POST",
      headers: { "Content-Type": asset.contentType },
      body: Buffer.from(asset.data),
    }, [201], true);
  }

  const publishedResponse = await githubRequest(fetcher, `${base}/releases/${encodeURIComponent(releaseId)}`, token, version, {
    method: "PATCH",
    body: JSON.stringify({ draft: false }),
  }, [200], true);
  const published = await json(publishedResponse, "invalid_published_release_response", true);
  if (typeof published.html_url !== "string") throw new GitHubPublishProviderError("missing_release_url", true);
  return { commitSha: publishedCommitSha, releaseId, releaseUrl: published.html_url };
}
