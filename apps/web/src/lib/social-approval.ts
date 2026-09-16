import { createHash } from "node:crypto";

export function socialContentHash(platform: "X" | "LINKEDIN", content: string, videoStorageKey?: string): string {
  const attachment = videoStorageKey ? `\nvideo:${videoStorageKey}` : "";
  return createHash("sha256").update(`${platform}\n${content}${attachment}`, "utf8").digest("hex");
}
