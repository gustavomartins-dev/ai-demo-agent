import { describe, expect, it, vi } from "vitest";
import { GitHubPublishProviderError, publishGitHubLaunchPackage } from "../src/github/publishing.js";

const repository = {
  provider: "github" as const,
  owner: "acme",
  name: "demo",
  defaultBranch: "main",
  sourceSha: "source-sha",
  repositoryDescription: "Old",
  readme: { path: "README.md", sha: "readme-sha", content: "# Old" },
  files: [{ path: "README.md", sha: "readme-sha", content: "# Old" }],
};
const draft = {
  repositoryDescription: "New factual description",
  readmeMarkdown: "# Demo\n\nThis README contains enough factual text for the validated launch package and points to https://demo.example as the verified product.",
  releaseTag: "v0.1.0",
  releaseTitle: "Demo v0.1.0",
  releaseNotesMarkdown: "## Verified release\n\nThis release contains the recorded demonstration and its visual evidence.",
  sourcePaths: ["README.md"],
  claimIds: ["claim-2"],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("GitHub launch publishing", () => {
  it("preflights the source, updates metadata, uploads evidence, and publishes one release", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/repos/acme/demo") && init?.method === "GET") return json({ default_branch: "main", description: "Old" });
      if (url.endsWith("/commits/main")) return json({ sha: "source-sha" });
      if (url.includes("/contents/README.md?")) return json({ sha: "readme-sha" });
      if (url.endsWith("/contents/README.md") && init?.method === "PUT") return json({ commit: { sha: "published-sha" } });
      if (url.endsWith("/repos/acme/demo") && init?.method === "PATCH") return json({});
      if (url.endsWith("/releases") && init?.method === "POST") return json({ id: 42, upload_url: "https://uploads.github.com/repos/acme/demo/releases/42/assets{?name,label}" }, 201);
      if (url.startsWith("https://uploads.github.com/")) return json({ id: 7 }, 201);
      if (url.endsWith("/releases/42") && init?.method === "PATCH") return json({ html_url: "https://github.com/acme/demo/releases/tag/v0.1.0" });
      return json({}, 500);
    });

    const result = await publishGitHubLaunchPackage(repository, draft, [
      { name: "presentation.mp4", contentType: "video/mp4", data: new Uint8Array([1, 2]) },
      { name: "evidence.png", contentType: "image/png", data: new Uint8Array([3]) },
    ], "token-value", { fetcher: fetcher as typeof fetch });

    expect(result).toEqual({ commitSha: "published-sha", releaseId: "42", releaseUrl: "https://github.com/acme/demo/releases/tag/v0.1.0" });
    expect(calls.filter((call) => call.url.startsWith("https://uploads.github.com/"))).toHaveLength(2);
    const readmeWrite = calls.find((call) => call.url.endsWith("/contents/README.md") && call.init?.method === "PUT");
    expect(JSON.parse(String(readmeWrite?.init?.body))).toMatchObject({ sha: "readme-sha", branch: "main" });
  });

  it("stops before any mutation if the repository revision changed", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ default_branch: "main", description: "Old" }))
      .mockResolvedValueOnce(json({ sha: "newer-sha" }));
    await expect(publishGitHubLaunchPackage(repository, draft, [], "token-value", { fetcher }))
      .rejects.toMatchObject({ code: "source_changed", ambiguous: false } satisfies Partial<GitHubPublishProviderError>);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
