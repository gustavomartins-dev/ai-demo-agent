export function effectiveSocialAccountStatus(
  status: "DISCONNECTED" | "CONNECTED" | "EXPIRED" | "REVOKED",
  authorizationExpiresAt: Date | null,
  now = new Date(),
) {
  return status === "CONNECTED" && authorizationExpiresAt && authorizationExpiresAt <= now ? "EXPIRED" as const : status;
}
