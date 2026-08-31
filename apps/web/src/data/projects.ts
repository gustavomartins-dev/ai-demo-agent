import "server-only";

import { db } from "@/lib/db";
import type { ProjectInput } from "@/lib/project-input";

export type ProjectSummary = {
  id: string;
  name: string;
  productUrl: string;
  repositoryUrl: string | null;
  isOpenSource: boolean;
  status: string;
  latestRunStatus: string | null;
  updatedAt: string;
};

export type DashboardData = {
  databaseConfigured: boolean;
  counts: { projects: number; readyForReview: number; published: number };
  projects: ProjectSummary[];
};

export type ProjectDetail = {
  id: string;
  name: string;
  productUrl: string;
  repositoryUrl: string | null;
  isOpenSource: boolean;
  status: string;
  runs: Array<{
    id: string;
    objective: string;
    status: string;
    error: string | null;
    createdAt: string;
    completedAt: string | null;
    attemptCount: number;
    maxAttempts: number;
    nextAttemptAt: string;
    assets: Array<{ id: string; type: string; status: string; storageKey: string; mimeType: string }>;
    socialDrafts: Array<{ id: string; platform: string; status: string; content: string; publishedPostUrl: string | null }>;
  }>;
};

export async function getDashboardData(ownerId: string): Promise<DashboardData> {
  if (!process.env.DATABASE_URL) {
    return {
      databaseConfigured: false,
      counts: { projects: 0, readyForReview: 0, published: 0 },
      projects: [],
    };
  }

  const [projects, readyForReview, published] = await Promise.all([
    db.project.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        productUrl: true,
        repositoryUrl: true,
        isOpenSource: true,
        status: true,
        updatedAt: true,
        runs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      },
    }),
    db.generationRun.count({ where: { project: { ownerId }, status: "READY_FOR_REVIEW" } }),
    db.project.count({ where: { ownerId, status: "PUBLISHED" } }),
  ]);

  return {
    databaseConfigured: true,
    counts: { projects: projects.length, readyForReview, published },
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      productUrl: project.productUrl,
      repositoryUrl: project.repositoryUrl,
      isOpenSource: project.isOpenSource,
      status: project.status,
      latestRunStatus: project.runs[0]?.status ?? null,
      updatedAt: project.updatedAt.toISOString(),
    })),
  };
}

export async function createProject(ownerId: string, input: ProjectInput): Promise<{ id: string }> {
  return db.$transaction(async (transaction) =>
    transaction.project.create({
      data: {
        ownerId,
        name: input.name,
        productUrl: input.productUrl,
        repositoryUrl: input.repositoryUrl || null,
        isOpenSource: input.isOpenSource,
        status: "READY",
        runs: {
          create: { objective: input.objective, status: "QUEUED" },
        },
      },
      select: { id: true },
    }),
  );
}

export async function getProjectDetail(ownerId: string, projectId: string): Promise<ProjectDetail | null> {
  if (!process.env.DATABASE_URL) return null;
  const project = await db.project.findFirst({
    where: { id: projectId, ownerId },
    select: {
      id: true,
      name: true,
      productUrl: true,
      repositoryUrl: true,
      isOpenSource: true,
      status: true,
      runs: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          objective: true,
          status: true,
          error: true,
          createdAt: true,
          completedAt: true,
          attemptCount: true,
          maxAttempts: true,
          nextAttemptAt: true,
          assets: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, status: true, storageKey: true, mimeType: true } },
          socialDrafts: { orderBy: { platform: "asc" }, select: { id: true, platform: true, status: true, content: true, publishedPostUrl: true } },
        },
      },
    },
  });

  if (!project) return null;
  return {
    ...project,
    status: project.status,
    runs: project.runs.map((run) => ({
      ...run,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      nextAttemptAt: run.nextAttemptAt.toISOString(),
      assets: run.assets.map((asset) => ({ ...asset, type: asset.type, status: asset.status })),
      socialDrafts: run.socialDrafts.map((draft) => ({ ...draft, platform: draft.platform, status: draft.status })),
    })),
  };
}

export async function retryFailedGenerationRun(
  ownerId: string,
  runId: string,
): Promise<{ projectId: string } | null> {
  return db.$transaction(async (transaction) => {
    const run = await transaction.generationRun.findFirst({
      where: { id: runId, status: "FAILED", project: { ownerId } },
      select: { projectId: true, plan: true },
    });
    if (!run) return null;

    const updated = await transaction.generationRun.updateMany({
      where: { id: runId, status: "FAILED", project: { ownerId } },
      data: {
        status: run.plan ? "PLANNED" : "QUEUED",
        attemptCount: 0,
        nextAttemptAt: new Date(),
        error: null,
        completedAt: null,
        workerId: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
      },
    });
    if (updated.count !== 1) return null;
    await transaction.project.update({ where: { id: run.projectId }, data: { status: "PROCESSING" } });
    return { projectId: run.projectId };
  });
}
