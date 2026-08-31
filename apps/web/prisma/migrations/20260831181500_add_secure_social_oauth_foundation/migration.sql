ALTER TABLE "SocialAccount"
ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "authorizationExpiresAt" TIMESTAMP(3);

CREATE TABLE "SocialCredential" (
  "id" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "encryptedAccessToken" TEXT NOT NULL,
  "encryptedRefreshToken" TEXT,
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "encryptionKeyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialOAuthAttempt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" "SocialPlatform" NOT NULL,
  "stateHash" TEXT NOT NULL,
  "encryptedCodeVerifier" TEXT,
  "encryptionKeyId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialOAuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialCredential_socialAccountId_key" ON "SocialCredential"("socialAccountId");
CREATE UNIQUE INDEX "SocialOAuthAttempt_stateHash_key" ON "SocialOAuthAttempt"("stateHash");
CREATE INDEX "SocialOAuthAttempt_userId_platform_expiresAt_idx" ON "SocialOAuthAttempt"("userId", "platform", "expiresAt");

ALTER TABLE "SocialCredential" ADD CONSTRAINT "SocialCredential_socialAccountId_fkey"
FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialOAuthAttempt" ADD CONSTRAINT "SocialOAuthAttempt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
