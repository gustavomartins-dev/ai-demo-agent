import { db } from "../lib/db.js";

export async function githubAccessTokenForOwner(ownerId: string): Promise<string | undefined> {
  const configured = process.env.GITHUB_LAUNCH_TOKEN?.trim();
  if (configured) return configured;
  const account = await db.account.findFirst({
    where: { userId: ownerId, provider: "github" },
    select: { access_token: true },
  });
  return account?.access_token?.trim() || undefined;
}
