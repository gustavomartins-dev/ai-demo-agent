import { createHash } from "node:crypto";

export function socialContentHash(platform: "X" | "LINKEDIN", content: string): string {
  return createHash("sha256").update(`${platform}\n${content}`, "utf8").digest("hex");
}
