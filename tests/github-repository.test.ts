import { describe, expect, it, vi } from "vitest";
import { GitHubRepositoryError, parseGitHubRepositoryUrl, readGitHubRepositorySnapshot } from "../src/github/repository.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("GitHub repository snapshot", () => {
  it("accepts only exact HTTPS GitHub repository URLs", () => {
    expect(parseGitHubRepositoryUrl("https://github.com/acme/demo.git")).toEqual({ owner: "acme", name: "demo" });
    expect(() => parseGitHubRepositoryUrl("https://github.example/acme/demo")).toThrow(GitHubRepositoryError);
    expect(() => parseGitHubRepositoryUrl("https://github.com/acme/demo/issues")).toThrow(GitHubRepositoryError);
  });

  it("captures a bounded revision and excludes secrets and generated files", async () => {
    const base = "https://api.github.com/repos/acme/demo";
    const blobs: Record<string, string> = {
      [`${base}/git/blobs/readme`]: "# Demo\nVerified setup",
      [`${base}/git/blobs/source`]: 'export const feature = true; const clientSecret = "super-secret-value";',
    };
    const fetcher = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url === base) return response({ default_branch: "main", description: "Current description" });
      if (url === `${base}/commits/main`) return response({ sha: "commit-1", commit: { tree: { sha: "tree-1" } } });
      if (url === `${base}/git/trees/tree-1?recursive=1`) return response({ tree: [
        { path: "README.md", sha: "readme", type: "blob", url: `${base}/git/blobs/readme`, size: 30 },
        { path: "src/app.ts", sha: "source", type: "blob", url: `${base}/git/blobs/source`, size: 40 },
        { path: ".env", sha: "env", type: "blob", url: `${base}/git/blobs/env`, size: 20 },
        { path: "node_modules/pkg/index.js", sha: "vendor", type: "blob", url: `${base}/git/blobs/vendor`, size: 20 },
      ] });
      if (blobs[url]) return response({ encoding: "base64", content: Buffer.from(blobs[url]).toString("base64") });
      return response({}, 404);
    });

    const snapshot = await readGitHubRepositorySnapshot("https://github.com/acme/demo", { token: "never-log-me", fetcher: fetcher as typeof fetch });
    expect(snapshot).toMatchObject({ owner: "acme", name: "demo", sourceSha: "commit-1", defaultBranch: "main" });
    expect(snapshot.files.map((file) => file.path)).toEqual(["README.md", "src/app.ts"]);
    expect(snapshot.files[1]?.content).toContain('clientSecret = "[REDACTED]"');
    expect(snapshot.files[1]?.content).not.toContain("super-secret-value");
    expect(fetcher.mock.calls.every((call) => (call[1]?.headers as Record<string, string>).Authorization === "Bearer never-log-me")).toBe(true);
  });

  it("retries public repository reads without a revoked OAuth token", async () => {
    const base = "https://api.github.com/repos/acme/demo";
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (authorization) return response({ message: "Bad credentials" }, 401);
      if (url === base) return response({ default_branch: "main", description: "Public demo" });
      if (url === `${base}/commits/main`) return response({ sha: "commit-1", commit: { tree: { sha: "tree-1" } } });
      if (url === `${base}/git/trees/tree-1?recursive=1`) return response({ tree: [] });
      return response({}, 404);
    });

    const snapshot = await readGitHubRepositorySnapshot("https://github.com/acme/demo", {
      token: "revoked-token",
      fetcher: fetcher as typeof fetch,
    });

    expect(snapshot).toMatchObject({ owner: "acme", name: "demo", sourceSha: "commit-1" });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect((fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe("Bearer revoked-token");
    expect((fetcher.mock.calls[1]?.[1]?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
