import type { SocialPlatform } from "@prisma/client";

import type { SocialOAuthStart } from "@/lib/social-oauth/flow";
import { decryptSecret, encryptSecret, loadTokenEncryptionConfig, type TokenEncryptionConfig } from "@/lib/social-oauth/crypto";
import { db } from "@/lib/db";
import { effectiveSocialAccountStatus } from "@/lib/social-oauth/account-status";
import { loadSocialOAuthConfig } from "@/lib/social-oauth/config";
import { refreshSocialAccessToken } from "@/lib/social-oauth/provider-client";

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
  const accounts = await db.socialAccount.findMany({
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
  const now = new Date();
  return accounts.map((account) => ({
    ...account,
    status: effectiveSocialAccountStatus(account.status, account.authorizationExpiresAt, now),
  }));
}

export async function refreshExpiredSocialAccount(
  userId: string,
  platform: SocialPlatform,
  now = new Date(),
): Promise<boolean> {
  const encryption = loadTokenEncryptionConfig();
  const account = await db.socialAccount.findFirst({
    where: { userId, platform, status: "CONNECTED", authorizationExpiresAt: { lte: now } },
    select: {
      id: true,
      scopes: true,
      credential: {
        select: { encryptedRefreshToken: true, refreshTokenExpiresAt: true, encryptionKeyId: true },
      },
    },
  });
  if (!account) return true;
  if (!account.credential?.encryptedRefreshToken) return false;
  if (account.credential.refreshTokenExpiresAt && account.credential.refreshTokenExpiresAt <= now) return false;
  if (account.credential.encryptionKeyId !== encryption.keyId) {
    throw new Error("Social credential uses an unavailable encryption key");
  }

  const config = loadSocialOAuthConfig(platform);
  const currentRefreshToken = decryptSecret(account.credential.encryptedRefreshToken, encryption);
  const token = await refreshSocialAccessToken(config, currentRefreshToken);
  const accessTokenExpiresAt = token.expiresIn ? new Date(now.getTime() + token.expiresIn * 1_000) : null;
  const refreshTokenExpiresAt = token.refreshTokenExpiresIn
    ? new Date(now.getTime() + token.refreshTokenExpiresIn * 1_000)
    : account.credential.refreshTokenExpiresAt;

  await db.$transaction([
    db.socialAccount.update({
      where: { id: account.id },
      data: {
        status: "CONNECTED",
        scopes: token.scopes.length > 0 ? token.scopes : account.scopes,
        authorizationExpiresAt: accessTokenExpiresAt,
      },
    }),
    db.socialCredential.update({
      where: { socialAccountId: account.id },
      data: {
        encryptedAccessToken: encryptSecret(token.accessToken, encryption),
        encryptedRefreshToken: encryptSecret(token.refreshToken ?? currentRefreshToken, encryption),
        refreshTokenExpiresAt,
        encryptionKeyId: encryption.keyId,
      },
    }),
  ]);
  return true;
}

export async function disconnectOwnedSocialAccount(userId: string, platform: SocialPlatform): Promise<boolean> {
  return db.$transaction(async (transaction) => {
    const account = await transaction.socialAccount.findFirst({ where: { userId, platform }, select: { id: true } });
    if (!account) return false;
    await transaction.socialCredential.deleteMany({ where: { socialAccountId: account.id } });
    const disconnected = await transaction.socialAccount.updateMany({
      where: { id: account.id, userId, platform },
      data: {
        status: "DISCONNECTED",
        externalAccountId: null,
        displayName: null,
        handle: null,
        scopes: [],
        authorizationExpiresAt: null,
        connectedAt: null,
      },
    });
    return disconnected.count === 1;
  });
}
