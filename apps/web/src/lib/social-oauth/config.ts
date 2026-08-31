import { z } from "zod";

export type SocialOAuthPlatform = "X" | "LINKEDIN";

export function parseSocialOAuthPlatform(value: string): SocialOAuthPlatform | null {
  if (value.toLowerCase() === "x") return "X";
  if (value.toLowerCase() === "linkedin") return "LINKEDIN";
  return null;
}

const environmentSchema = z.object({
  APP_BASE_URL: z.string().url(),
  X_CLIENT_ID: z.string().trim().min(1).optional(),
  X_CLIENT_SECRET: z.string().trim().min(1).optional(),
  LINKEDIN_CLIENT_ID: z.string().trim().min(1).optional(),
  LINKEDIN_CLIENT_SECRET: z.string().trim().min(1).optional(),
});

export type SocialOAuthConfig = {
  platform: SocialOAuthPlatform;
  clientId: string;
  clientSecret?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri: string;
  scopes: string[];
  usesPkce: boolean;
};

export function loadSocialOAuthConfig(platform: SocialOAuthPlatform, environment: NodeJS.ProcessEnv = process.env): SocialOAuthConfig {
  const parsed = environmentSchema.parse(environment);
  const redirectUri = new URL(`/api/social/oauth/${platform.toLowerCase()}/callback`, parsed.APP_BASE_URL).toString();
  if (platform === "X") {
    if (!parsed.X_CLIENT_ID) throw new Error("X_CLIENT_ID is required");
    return {
      platform,
      clientId: parsed.X_CLIENT_ID,
      ...(parsed.X_CLIENT_SECRET ? { clientSecret: parsed.X_CLIENT_SECRET } : {}),
      authorizationEndpoint: "https://x.com/i/oauth2/authorize",
      tokenEndpoint: "https://api.x.com/2/oauth2/token",
      redirectUri,
      scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
      usesPkce: true,
    };
  }
  if (!parsed.LINKEDIN_CLIENT_ID || !parsed.LINKEDIN_CLIENT_SECRET) {
    throw new Error("LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are required");
  }
  return {
    platform,
    clientId: parsed.LINKEDIN_CLIENT_ID,
    clientSecret: parsed.LINKEDIN_CLIENT_SECRET,
    authorizationEndpoint: "https://www.linkedin.com/oauth/v2/authorization",
    tokenEndpoint: "https://www.linkedin.com/oauth/v2/accessToken",
    redirectUri,
    scopes: ["openid", "profile", "w_member_social"],
    usesPkce: false,
  };
}
