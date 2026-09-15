import { z } from "zod";

export const repositorySourceFileSchema = z.object({
  path: z.string().trim().min(1),
  sha: z.string().trim().min(1),
  content: z.string().max(16_000),
});

export const repositorySnapshotSchema = z.object({
  provider: z.literal("github"),
  owner: z.string().trim().min(1),
  name: z.string().trim().min(1),
  defaultBranch: z.string().trim().min(1),
  sourceSha: z.string().trim().min(1),
  repositoryDescription: z.string().nullable(),
  readme: repositorySourceFileSchema.nullable(),
  files: z.array(repositorySourceFileSchema).max(24),
});

export type RepositorySourceFile = z.infer<typeof repositorySourceFileSchema>;
export type RepositorySnapshot = z.infer<typeof repositorySnapshotSchema>;
