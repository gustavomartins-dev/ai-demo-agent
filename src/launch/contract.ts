import { z } from "zod";
import { repositorySnapshotSchema } from "../repository/contract";
import { verifiedClaimSchema } from "../social/contract";

export const launchPackageContextSchema = z.object({
  project: z.object({
    name: z.string().trim().min(1),
    productUrl: z.string().url(),
    repositoryUrl: z.string().url(),
  }),
  objective: z.string().trim().min(1),
  demoSummary: z.string().trim().min(1),
  repository: repositorySnapshotSchema,
  verifiedClaims: z.array(verifiedClaimSchema).min(1),
});

export const launchPackageDraftSchema = z.object({
  repositoryDescription: z.string().trim().min(1).max(350),
  readmeMarkdown: z.string().trim().min(100).max(100_000),
  releaseTag: z.string().trim().regex(/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  releaseTitle: z.string().trim().min(1).max(120),
  releaseNotesMarkdown: z.string().trim().min(50).max(50_000),
  sourcePaths: z.array(z.string().trim().min(1)).min(1).max(24),
  claimIds: z.array(z.string().trim().min(1)).min(1),
});

export type LaunchPackageContext = z.infer<typeof launchPackageContextSchema>;
export type LaunchPackageDraft = z.infer<typeof launchPackageDraftSchema>;

export function validateLaunchPackageAgainstContext(
  input: unknown,
  contextInput: unknown,
): LaunchPackageDraft {
  const context = launchPackageContextSchema.parse(contextInput);
  const draft = launchPackageDraftSchema.parse(input);
  const allowedPaths = new Set(context.repository.files.map((file) => file.path));
  const allowedClaims = new Set(context.verifiedClaims.map((claim) => claim.id));
  for (const sourcePath of draft.sourcePaths) {
    if (!allowedPaths.has(sourcePath)) throw new Error(`Launch package references unavailable source file ${sourcePath}`);
  }
  for (const claimId of draft.claimIds) {
    if (!allowedClaims.has(claimId)) throw new Error(`Launch package references unsupported visual claim ${claimId}`);
  }
  if (!draft.readmeMarkdown.includes(context.project.productUrl)) {
    throw new Error("Launch README must include the verified product URL");
  }
  return draft;
}
