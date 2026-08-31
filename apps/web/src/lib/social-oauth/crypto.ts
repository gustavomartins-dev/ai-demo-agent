import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

const keyEnvironmentSchema = z.object({
  SOCIAL_TOKEN_ENCRYPTION_KEY: z.string().min(1),
  SOCIAL_TOKEN_ENCRYPTION_KEY_ID: z.string().trim().min(1),
});

export type TokenEncryptionConfig = { key: Buffer; keyId: string };

export function loadTokenEncryptionConfig(environment: NodeJS.ProcessEnv = process.env): TokenEncryptionConfig {
  const parsed = keyEnvironmentSchema.parse(environment);
  const key = Buffer.from(parsed.SOCIAL_TOKEN_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return { key, keyId: parsed.SOCIAL_TOKEN_ENCRYPTION_KEY_ID };
}

export function encryptSecret(value: string, config: TokenEncryptionConfig): string {
  if (!value) throw new Error("Cannot encrypt an empty secret");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config.key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, config: TokenEncryptionConfig): string {
  const [version, ivValue, tagValue, ciphertextValue] = payload.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Unsupported encrypted secret format");
  const decipher = createDecipheriv("aes-256-gcm", config.key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
