import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { validateOAuthOrigins, validateProductionEnvironment } from "../apps/web/src/lib/production-config.js";

const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:password@db.example:5432/ai_demo_agent",
  AUTH_SECRET: "a-production-secret-longer-than-32-characters",
  AUTH_GITHUB_ID: "github-id",
  AUTH_GITHUB_SECRET: "github-secret",
  AUTH_URL: "https://demo.example",
  APP_OWNER_GITHUB_LOGIN: "owner",
  APP_BASE_URL: "https://demo.example",
  SOCIAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  SOCIAL_TOKEN_ENCRYPTION_KEY_ID: "v1",
  X_CLIENT_ID: "x-id",
  LINKEDIN_CLIENT_ID: "linkedin-id",
  LINKEDIN_CLIENT_SECRET: "linkedin-secret",
  LINKEDIN_API_VERSION: "202608",
  AI_DEMO_OUTPUT_ROOT: "/var/lib/ai-demo-agent/output",
  AI_DEMO_HERMES_COMMAND: "/usr/local/bin/hermes",
};

describe("production readiness", () => {
  it("accepts a complete HTTPS production environment", () => {
    expect(validateProductionEnvironment(valid).APP_BASE_URL).toBe("https://demo.example");
  });

  it("fails closed on insecure domains, weak keys, relative storage, and missing provider settings", () => {
    expect(() => validateProductionEnvironment({ ...valid, APP_BASE_URL: "http://demo.example" })).toThrow();
    expect(() => validateProductionEnvironment({ ...valid, SOCIAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(/32 bytes/);
    expect(() => validateProductionEnvironment({ ...valid, AI_DEMO_OUTPUT_ROOT: "output" })).toThrow();
    expect(() => validateProductionEnvironment({ ...valid, X_CLIENT_ID: "" })).toThrow();
    expect(() => validateProductionEnvironment({ ...valid, AUTH_URL: "https://other.example" })).toThrow(/same origin/);
  });

  it("rejects mixed OAuth origins before a provider round trip", () => {
    expect(validateOAuthOrigins({ AUTH_URL: "http://127.0.0.1:3000", APP_BASE_URL: "http://127.0.0.1:3000" })).toEqual({
      authUrl: "http://127.0.0.1:3000",
      appBaseUrl: "http://127.0.0.1:3000",
    });
    expect(() => validateOAuthOrigins({ AUTH_URL: "http://localhost:3000", APP_BASE_URL: "http://127.0.0.1:3000" })).toThrow(/same origin/);
  });

  it("provides separate liveness and dependency readiness checks", async () => {
    const live = await readFile(new URL("../apps/web/src/app/api/health/live/route.ts", import.meta.url), "utf8");
    const ready = await readFile(new URL("../apps/web/src/app/api/health/ready/route.ts", import.meta.url), "utf8");
    expect(live).not.toContain("db.");
    expect(ready).toContain("SELECT 1");
    expect(ready).toContain("constants.R_OK | constants.W_OK");
    expect(ready).toContain("status: 503");
    expect(ready).toContain("validateOAuthOrigins");
  });
});
