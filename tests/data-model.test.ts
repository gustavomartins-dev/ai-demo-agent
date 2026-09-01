import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const schemaPath = new URL("../apps/web/prisma/schema.prisma", import.meta.url);
const migrationPath = new URL(
  "../apps/web/prisma/migrations/20260828185400_initial_product_model/migration.sql",
  import.meta.url
);

describe("product data model", () => {
  it("models the complete launch pipeline", async () => {
    const schema = await readFile(schemaPath, "utf8");
    for (const model of ["User", "Project", "GenerationRun", "MediaAsset", "SocialDraft", "SocialAccount", "SocialCredential", "SocialOAuthAttempt", "PublishAttempt"]) {
      expect(schema).toContain(`model ${model}`);
    }
    expect(schema).toContain("@@unique([generationRunId, platform])");
    expect(schema).toMatch(/language\s+String\s+@default\("en"\)/);
    expect(schema).toMatch(/claimIds\s+Json\?/);
    expect(schema).toMatch(/evidence\s+Json\?/);
    expect(schema).toMatch(/approvedContentHash\s+String\?/);
    expect(schema).toContain('@relation("SocialDraftApprover"');
    expect(schema).toContain("@@unique([socialDraftId, approvalHash])");
    expect(schema).toContain("enum ProjectKind");
    expect(schema).toMatch(/kind\s+ProjectKind\s+@default\(WEB\)/);
  });

  it("keeps social publishing credentials out of SocialAccount", async () => {
    const schema = await readFile(schemaPath, "utf8");
    const socialAccount = schema.match(/model SocialAccount \{[\s\S]*?\n\}/)?.[0];
    expect(socialAccount).toBeDefined();
    expect(socialAccount).not.toMatch(/accessToken|refreshToken|clientSecret/i);
  });

  it("commits a PostgreSQL migration for every core record", async () => {
    const migration = await readFile(migrationPath, "utf8");
    for (const table of ["User", "Project", "GenerationRun", "MediaAsset", "SocialDraft", "SocialAccount"]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
  });
});
