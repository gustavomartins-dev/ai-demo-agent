export function isWorkspaceOwner(
  githubLogin: unknown,
  configuredLogin = process.env.APP_OWNER_GITHUB_LOGIN,
): boolean {
  if (typeof githubLogin !== "string" || !configuredLogin?.trim()) return false;
  return githubLogin.toLowerCase() === configuredLogin.trim().toLowerCase();
}
