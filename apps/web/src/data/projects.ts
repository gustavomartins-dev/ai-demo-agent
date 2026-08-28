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

export async function getDashboardData(): Promise<DashboardData> {
  if (!process.env.DATABASE_URL) {
    return {
      databaseConfigured: false,
      counts: { projects: 0, readyForReview: 0, published: 0 },
      projects: [],
    };
  }

  const [projects, readyForReview, published] = await Promise.all([
    db.project.findMany({
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
    db.generationRun.count({ where: { status: "READY_FOR_REVIEW" } }),
    db.project.count({ where: { status: "PUBLISHED" } }),
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

export async function createProject(input: ProjectInput): Promise<{ id: string }> {
  const email = process.env.APP_OWNER_EMAIL ?? "owner@ai-demo-agent.local";
  const name = process.env.APP_OWNER_NAME ?? "Workspace owner";

  return db.$transaction(async (transaction) => {
    const owner = await transaction.user.upsert({
      where: { email },
      update: { name },
      create: { email, name },
      select: { id: true },
    });

    return transaction.project.create({
      data: {
        ownerId: owner.id,
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
    });
  });
}
