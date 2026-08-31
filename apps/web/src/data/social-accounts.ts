import type { SocialPlatform } from "@prisma/client";

import type { SocialOAuthStart } from "@/lib/social-oauth/flow";
import { decryptSecret, encryptSecret, type TokenEncryptionConfig } from "@/lib/social-oauth/crypto";
import { db } from "@/lib/db";

export type ConnectedAccountInput = {
  externalAccountId: string;
  displayName: string;
  handle: string | null;
  scopes: string[];
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt?: Date | null;
};

export async function createSocialOAuthAttempt(
  userId: string,
  platform: SocialPlatform,
  start: SocialOAuthStart,
  encryption: TokenEncryptionConfig,
  now = new Date(),
): Promise<void> {
  await db.socialOAuthAttempt.create({
    data: {
      userId,
      platform,
      stateHash: start.stateHash,
      encryptedCodeVerifier: start.codeVerifier ? encryptSecret(start.codeVerifier, encryption) : null,
      encryptionKeyId: start.codeVerifier ? encryption.keyId : null,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    },
  });
}

export async function consumeSocialOAuthAttempt(
  userId: string,
  platform: SocialPlatform,
  stateHash: string,
  encryption: TokenEncryptionConfig,
  now = new Date(),
): Promise<{ codeVerifier: string | null } | null> {
  return db.$transaction(async (transaction) => {
    const attempt = await transaction.socialOAuthAttempt.findFirst({
      where: { userId, platform, stateHash, consumedAt: null, expiresAt: { gt: now } },
      select: { id: true, encryptedCodeVerifier: true, encryptionKeyId: true },
    });
    if (!attempt) return null;
    const consumed = await transaction.socialOAuthAttempt.updateMany({
      where: { id: attempt.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return null;
    if (attempt.encryptedCodeVerifier && attempt.encryptionKeyId !== encryption.keyId) {
      throw new Error("OAuth attempt uses an unavailable encryption key");
    }
    return {
      codeVerifier: attempt.encryptedCodeVerifier
        ? decryptSecret(attempt.encryptedCodeVerifier, encryption)
        : null,
    };
  });
}

export async function saveConnectedSocialAccount(
  userId: string,
  platform: SocialPlatform,
  input: ConnectedAccountInput,
  encryption: TokenEncryptionConfig,
): Promise<void> {
  await db.$transaction(async (transaction) => {
    const account = await transaction.socialAccount.upsert({
      where: { userId_platform: { userId, platform } },
      create: {
        userId,
        platform,
        status: "CONNECTED",
        externalAccountId: input.externalAccountId,
        displayName: input.displayName,
        handle: input.handle,
        scopes: input.scopes,
        authorizationExpiresAt: input.accessTokenExpiresAt,
        connectedAt: new Date(),
      },
      update: {
        status: "CONNECTED",
        externalAccountId: input.externalAccountId,
        displayName: input.displayName,
        handle: input.handle,
        scopes: input.scopes,
        authorizationExpiresAt: input.accessTokenExpiresAt,
        connectedAt: new Date(),
      },
      select: { id: true },
    });
    await transaction.socialCredential.upsert({
      where: { socialAccountId: account.id },
      create: {
        socialAccountId: account.id,
        encryptedAccessToken: encryptSecret(input.accessToken, encryption),
        encryptedRefreshToken: input.refreshToken ? encryptSecret(input.refreshToken, encryption) : null,
        refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
        encryptionKeyId: encryption.keyId,
      },
      update: {
        encryptedAccessToken: encryptSecret(input.accessToken, encryption),
        encryptedRefreshToken: input.refreshToken ? encryptSecret(input.refreshToken, encryption) : null,
        refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
        encryptionKeyId: encryption.keyId,
      },
    });
  });
}

export async function getSocialAccountConnections(userId: string) {
  return db.socialAccount.findMany({
    where: { userId },
    orderBy: { platform: "asc" },
    select: {
      id: true,
      platform: true,
      status: true,
      externalAccountId: true,
      displayName: true,
      handle: true,
      scopes: true,
      authorizationExpiresAt: true,
      connectedAt: true,
    },
  });
}
