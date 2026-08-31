import path from "node:path";
import { z } from "zod";

const required = z.string().trim().min(1);

const schema = z.object({
  NODE_ENV: z.literal("production"),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), "DATABASE_URL must use PostgreSQL"),
  AUTH_SECRET: z.string().min(32),
  AUTH_GITHUB_ID: required,
  AUTH_GITHUB_SECRET: required,
  APP_OWNER_GITHUB_LOGIN: required,
  APP_BASE_URL: z.string().url().refine((value) => value.startsWith("https://"), "APP_BASE_URL must use HTTPS in production"),
  SOCIAL_TOKEN_ENCRYPTION_KEY: required,
  SOCIAL_TOKEN_ENCRYPTION_KEY_ID: required,
  X_CLIENT_ID: required,
  LINKEDIN_CLIENT_ID: required,
  LINKEDIN_CLIENT_SECRET: required,
  LINKEDIN_API_VERSION: z.string().regex(/^\d{6}$/),
  AI_DEMO_OUTPUT_ROOT: required.refine((value) => path.isAbsolute(value), "AI_DEMO_OUTPUT_ROOT must be an absolute durable path"),
  AI_DEMO_HERMES_COMMAND: required,
});

export function validateProductionEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.parse(environment);
  const encryptionKey = Buffer.from(parsed.SOCIAL_TOKEN_ENCRYPTION_KEY, "base64");
  if (encryptionKey.length !== 32) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return parsed;
}
