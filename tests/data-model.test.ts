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
    for (const model of ["User", "Project", "GenerationRun", "MediaAsset", "SocialDraft", "SocialAccount"]) {
      expect(schema).toContain(`model ${model}`);
    }
    expect(schema).toContain("@@unique([generationRunId, platform])");
    expect(schema).toMatch(/language\s+String\s+@default\("en"\)/);
  });

  it("does not store plaintext OAuth credentials", async () => {
    const schema = await readFile(schemaPath, "utf8");
    expect(schema).not.toMatch(/accessToken|refreshToken|clientSecret/i);
  });

  it("commits a PostgreSQL migration for every core record", async () => {
    const migration = await readFile(migrationPath, "utf8");
    for (const table of ["User", "Project", "GenerationRun", "MediaAsset", "SocialDraft", "SocialAccount"]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
  });
});
