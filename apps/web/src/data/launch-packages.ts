import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { launchPackageDraftSchema, type LaunchPackageDraft } from "../../../../src/launch/contract";
import { repositorySnapshotSchema } from "../../../../src/repository/contract";
import {
  GitHubPublishProviderError,
  publishGitHubLaunchPackage,
  type GitHubPublishResult,
} from "../../../../src/github/publishing";
import { db } from "../lib/db";
import { resolveArtifactPath } from "../lib/media-delivery";

type PackagePublisher = typeof publishGitHubLaunchPackage;
type LaunchSourceIdentity = { repositoryOwner: string; repositoryName: string; defaultBranch: string; sourceSha: string };

export function launchPackageContentHash(snapshot: LaunchPackageDraft, source: LaunchSourceIdentity): string {
  const identity: LaunchSourceIdentity = {
    repositoryOwner: source.repositoryOwner,
    repositoryName: source.repositoryName,
    defaultBranch: source.defaultBranch,
    sourceSha: source.sourceSha,
  };
  return createHash("sha256").update(JSON.stringify({ source: identity, snapshot })).digest("hex");
}

export async function saveLaunchPackageDraft(
  runId: string,
  workerId: string,
  draft: LaunchPackageDraft,
): Promise<boolean> {
  const validated = launchPackageDraftSchema.parse(draft);
  return db.$transaction(async (transaction) => {
    const run = await transaction.generationRun.findFirst({
      where: { id: runId, workerId, status: "DRAFTING" },
      select: { repositorySnapshot: true },
    });
    if (!run?.repositorySnapshot) return false;
    const repository = repositorySnapshotSchema.parse(run.repositorySnapshot);
    await transaction.launchPackage.upsert({
      where: { generationRunId: runId },
      create: {
        generationRunId: runId,
        repositoryOwner: repository.owner,
        repositoryName: repository.name,
        defaultBranch: repository.defaultBranch,
        sourceSha: repository.sourceSha,
        repositoryDescription: validated.repositoryDescription,
        readmeMarkdown: validated.readmeMarkdown,
        releaseTag: validated.releaseTag,
        releaseTitle: validated.releaseTitle,
        releaseNotesMarkdown: validated.releaseNotesMarkdown,
        sourcePaths: validated.sourcePaths as Prisma.InputJsonValue,
        claimIds: validated.claimIds as Prisma.InputJsonValue,
      },
      update: {
        status: "DRAFT",
        repositoryOwner: repository.owner,
        repositoryName: repository.name,
        defaultBranch: repository.defaultBranch,
        sourceSha: repository.sourceSha,
        repositoryDescription: validated.repositoryDescription,
        readmeMarkdown: validated.readmeMarkdown,
        releaseTag: validated.releaseTag,
        releaseTitle: validated.releaseTitle,
        releaseNotesMarkdown: validated.releaseNotesMarkdown,
        sourcePaths: validated.sourcePaths as Prisma.InputJsonValue,
        claimIds: validated.claimIds as Prisma.InputJsonValue,
        approvedSnapshot: Prisma.DbNull,
        approvedContentHash: null,
        approvedAt: null,
        approvedByUserId: null,
      },
    });
    return true;
  });
}

export async function updateOwnedLaunchPackage(ownerId: string, packageId: string, input: {
  repositoryDescription: string;
  readmeMarkdown: string;
  releaseTag: string;
  releaseTitle: string;
  releaseNotesMarkdown: string;
}): Promise<{ projectId: string } | null> {
  const current = await db.launchPackage.findFirst({
    where: { id: packageId, publishedAt: null, status: { not: "PUBLISHING" }, generationRun: { project: { ownerId } } },
    select: { sourcePaths: true, claimIds: true, generationRun: { select: { projectId: true } } },
  });
  if (!current) return null;
  const draft = launchPackageDraftSchema.parse({ ...input, sourcePaths: current.sourcePaths, claimIds: current.claimIds });
  const result = await db.launchPackage.updateMany({
    where: { id: packageId, publishedAt: null, status: { not: "PUBLISHING" }, generationRun: { project: { ownerId } } },
    data: {
      ...draft,
      sourcePaths: draft.sourcePaths as Prisma.InputJsonValue,
      claimIds: draft.claimIds as Prisma.InputJsonValue,
      status: "DRAFT",
      approvedSnapshot: Prisma.DbNull,
      approvedContentHash: null,
      approvedAt: null,
      approvedByUserId: null,
    },
  });
  return result.count === 1 ? { projectId: current.generationRun.projectId } : null;
}

export async function approveOwnedLaunchPackage(
  ownerId: string,
  packageId: string,
  now = new Date(),
): Promise<{ projectId: string } | null> {
  const current = await db.launchPackage.findFirst({
    where: { id: packageId, publishedAt: null, status: { in: ["DRAFT", "FAILED", "APPROVED"] }, generationRun: { project: { ownerId } } },
    select: {
      repositoryDescription: true,
      readmeMarkdown: true,
      releaseTag: true,
      releaseTitle: true,
      releaseNotesMarkdown: true,
      repositoryOwner: true,
      repositoryName: true,
      defaultBranch: true,
      sourceSha: true,
      sourcePaths: true,
      claimIds: true,
      generationRun: { select: { projectId: true } },
    },
  });
  if (!current) return null;
  const snapshot = launchPackageDraftSchema.parse(current);
  const updated = await db.launchPackage.updateMany({
    where: {
      id: packageId,
      publishedAt: null,
      status: { in: ["DRAFT", "FAILED", "APPROVED"] },
      repositoryDescription: current.repositoryDescription,
      readmeMarkdown: current.readmeMarkdown,
      releaseTag: current.releaseTag,
      releaseTitle: current.releaseTitle,
      releaseNotesMarkdown: current.releaseNotesMarkdown,
      generationRun: { project: { ownerId } },
    },
    data: {
      status: "APPROVED",
      approvedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      approvedContentHash: launchPackageContentHash(snapshot, current),
      approvedAt: now,
      approvedByUserId: ownerId,
    },
  });
  return updated.count === 1 ? { projectId: current.generationRun.projectId } : null;
}

export async function publishApprovedOwnedLaunchPackage(
  ownerId: string,
  packageId: string,
  publisher?: PackagePublisher,
): Promise<{ status: "published" | "blocked" | "already_handled" | "failed"; projectId?: string; url?: string; code?: string }> {
  let prepared: Awaited<ReturnType<typeof prepareLaunchPublication>>;
  try {
    prepared = await prepareLaunchPublication(ownerId, packageId);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "already_handled" };
    }
    throw error;
  }

  if (prepared.kind === "blocked") return { status: "blocked", ...(prepared.projectId ? { projectId: prepared.projectId } : {}) };
  if (prepared.kind === "handled") return { status: "already_handled", projectId: prepared.projectId, ...(prepared.url ? { url: prepared.url } : {}) };

  const outputRoot = process.env.AI_DEMO_OUTPUT_ROOT ?? "output";
  try {
    const videoAsset = prepared.assets.find((asset) => asset.type === "VIDEO");
    const evidenceAssets = prepared.assets.filter((asset) => asset.type === "EVIDENCE");
    if (!videoAsset || evidenceAssets.length === 0) throw new GitHubPublishProviderError("missing_release_assets", false);
    const selectedAssets = [videoAsset, ...evidenceAssets];
    const assets = await Promise.all(selectedAssets.map(async (asset, index) => ({
      name: asset.type === "VIDEO"
        ? `presentation.${asset.mimeType === "video/mp4" ? "mp4" : "webm"}`
        : `evidence-${String(index).padStart(2, "0")}.png`,
      contentType: asset.mimeType,
      data: await readFile(resolveArtifactPath(outputRoot, asset.storageKey)),
    })));
    const result: GitHubPublishResult = await (publisher ?? publishGitHubLaunchPackage)(prepared.repository, prepared.snapshot, assets, prepared.token, {
      apiVersion: process.env.GITHUB_API_VERSION?.trim() || undefined,
    });
    await db.$transaction(async (transaction) => {
      await transaction.gitHubPublishAttempt.update({ where: { id: prepared.attemptId }, data: { status: "SUCCEEDED", commitSha: result.commitSha, releaseId: result.releaseId, releaseUrl: result.releaseUrl, completedAt: new Date() } });
      await transaction.launchPackage.update({ where: { id: prepared.launchPackageId }, data: { status: "PUBLISHED", publishedCommitSha: result.commitSha, publishedReleaseId: result.releaseId, publishedReleaseUrl: result.releaseUrl, publishedAt: new Date() } });
      const [totalSocial, unpublishedSocial] = await Promise.all([
        transaction.socialDraft.count({ where: { generationRunId: prepared.runId } }),
        transaction.socialDraft.count({ where: { generationRunId: prepared.runId, status: { not: "PUBLISHED" } } }),
      ]);
      if (totalSocial >= 2 && unpublishedSocial === 0) {
        await transaction.generationRun.update({ where: { id: prepared.runId }, data: { status: "PUBLISHED" } });
        await transaction.project.update({ where: { id: prepared.projectId }, data: { status: "PUBLISHED" } });
      }
    });
    return { status: "published", projectId: prepared.projectId, url: result.releaseUrl };
  } catch (error) {
    const providerError = error instanceof GitHubPublishProviderError ? error : new GitHubPublishProviderError("internal_error", true);
    await db.$transaction([
      db.gitHubPublishAttempt.update({ where: { id: prepared.attemptId }, data: { status: providerError.ambiguous ? "UNKNOWN" : "FAILED", errorCode: providerError.code, completedAt: new Date() } }),
      db.launchPackage.update({ where: { id: prepared.launchPackageId }, data: { status: "FAILED" } }),
    ]);
    return { status: "failed", projectId: prepared.projectId, code: providerError.code };
  }
}

async function prepareLaunchPublication(ownerId: string, packageId: string) {
  return db.$transaction(async (transaction) => {
    const launch = await transaction.launchPackage.findFirst({
      where: { id: packageId, generationRun: { project: { ownerId } } },
      select: {
        id: true,
        status: true,
        approvedSnapshot: true,
        approvedContentHash: true,
        repositoryOwner: true,
        repositoryName: true,
        defaultBranch: true,
        sourceSha: true,
        publishedReleaseUrl: true,
        generationRun: {
          select: {
            id: true,
            projectId: true,
            repositorySnapshot: true,
            project: { select: { ownerId: true } },
            assets: { where: { status: "READY", type: { in: ["VIDEO", "EVIDENCE"] } }, select: { type: true, storageKey: true, mimeType: true } },
          },
        },
      },
    });
    if (!launch) return { kind: "blocked" as const };
    if (launch.publishedReleaseUrl) return { kind: "handled" as const, projectId: launch.generationRun.projectId, url: launch.publishedReleaseUrl };
    if (launch.status !== "APPROVED" || !launch.approvedSnapshot || !launch.approvedContentHash || !launch.generationRun.repositorySnapshot) {
      return { kind: "blocked" as const, projectId: launch.generationRun.projectId };
    }
    const snapshot = launchPackageDraftSchema.parse(launch.approvedSnapshot);
    if (launchPackageContentHash(snapshot, launch) !== launch.approvedContentHash) return { kind: "blocked" as const, projectId: launch.generationRun.projectId };
    const repository = repositorySnapshotSchema.parse(launch.generationRun.repositorySnapshot);
    if (
      repository.owner !== launch.repositoryOwner
      || repository.name !== launch.repositoryName
      || repository.defaultBranch !== launch.defaultBranch
      || repository.sourceSha !== launch.sourceSha
    ) return { kind: "blocked" as const, projectId: launch.generationRun.projectId };
    const account = await transaction.account.findFirst({
      where: { userId: ownerId, provider: "github" },
      select: { access_token: true, scope: true },
    });
    const token = process.env.GITHUB_LAUNCH_TOKEN?.trim() || account?.access_token?.trim();
    if (!token) return { kind: "blocked" as const, projectId: launch.generationRun.projectId };
    if (!process.env.GITHUB_LAUNCH_TOKEN && !account?.scope?.split(/[ ,]+/).includes("repo")) {
      return { kind: "blocked" as const, projectId: launch.generationRun.projectId };
    }
    const existing = await transaction.gitHubPublishAttempt.findUnique({
      where: { launchPackageId_approvalHash: { launchPackageId: launch.id, approvalHash: launch.approvedContentHash } },
    });
    if (existing) return { kind: "handled" as const, projectId: launch.generationRun.projectId, url: existing.releaseUrl ?? undefined };
    const claimed = await transaction.launchPackage.updateMany({ where: { id: launch.id, status: "APPROVED" }, data: { status: "PUBLISHING" } });
    if (claimed.count !== 1) return { kind: "handled" as const, projectId: launch.generationRun.projectId };
    const attempt = await transaction.gitHubPublishAttempt.create({
      data: { launchPackageId: launch.id, approvalHash: launch.approvedContentHash },
      select: { id: true },
    });
    return {
      kind: "ready" as const,
      attemptId: attempt.id,
      launchPackageId: launch.id,
      runId: launch.generationRun.id,
      projectId: launch.generationRun.projectId,
      repository,
      snapshot,
      token,
      assets: launch.generationRun.assets,
    };
  });
}
