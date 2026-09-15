import { describe, expect, it, vi } from "vitest";
import { LaunchPackageGenerator } from "../src/launch/generator.js";
import { validateLaunchPackageAgainstContext } from "../src/launch/contract.js";

const context = {
  project: { name: "Demo", productUrl: "https://demo.example", repositoryUrl: "https://github.com/acme/demo" },
  objective: "Show the verified workflow",
  demoSummary: "The workflow passed.",
  repository: {
    provider: "github" as const,
    owner: "acme",
    name: "demo",
    defaultBranch: "main",
    sourceSha: "commit-1",
    repositoryDescription: null,
    readme: { path: "README.md", sha: "readme-1", content: "# Old README" },
    files: [{ path: "README.md", sha: "readme-1", content: "# Old README" }, { path: "src/app.ts", sha: "src-1", content: "export const demo = true;" }],
  },
  verifiedClaims: [{ id: "claim-2", statement: "Visible heading: Demo", stepIndex: 2, evidenceStorageKey: "run/evidence.png" }],
};

const draft = {
  repositoryDescription: "Evidence-backed demo project",
  readmeMarkdown: `# Demo\n\nA factual engineering project with verified browser evidence.\n\nProduct: https://demo.example\n\n## Architecture\n\nThe implementation is documented from repository sources.`,
  releaseTag: "v0.1.0",
  releaseTitle: "Verified demo v0.1.0",
  releaseNotesMarkdown: "## Verified\n\nThe browser demonstration confirmed the documented visible workflow.",
  sourcePaths: ["README.md", "src/app.ts"],
  claimIds: ["claim-2"],
};

describe("launch package generation", () => {
  it("uses the provider abstraction and preserves provenance", async () => {
    const provider = { name: "test", generateStructured: vi.fn().mockResolvedValue({ provider: "test", value: draft }) };
    await expect(new LaunchPackageGenerator(provider).createPackage(context)).resolves.toEqual(draft);
    expect(provider.generateStructured).toHaveBeenCalledOnce();
  });

  it("rejects invented source and claim references", () => {
    expect(() => validateLaunchPackageAgainstContext({ ...draft, sourcePaths: ["src/missing.ts"] }, context)).toThrow(/unavailable source/);
    expect(() => validateLaunchPackageAgainstContext({ ...draft, claimIds: ["claim-999"] }, context)).toThrow(/unsupported visual claim/);
  });
});
