import { z } from "zod";

export const socialPlatformSchema = z.enum(["X", "LINKEDIN"]);

export const mentionCandidateSchema = z.object({
  platform: socialPlatformSchema,
  identity: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  sourceUrl: z.string().url(),
});

export const verifiedClaimSchema = z.object({
  id: z.string().regex(/^claim-\d+$/),
  statement: z.string().trim().min(1),
  stepIndex: z.number().int().positive(),
  evidenceStorageKey: z.string().trim().min(1),
});

export const verifiedSocialContextSchema = z.object({
  project: z.object({
    name: z.string().trim().min(1),
    productUrl: z.string().url(),
    repositoryUrl: z.string().url().nullable(),
    isOpenSource: z.boolean(),
  }),
  objective: z.string().trim().min(1),
  demoSummary: z.string().trim().min(1),
  verifiedClaims: z.array(verifiedClaimSchema).min(1),
  mentionCandidates: z.array(mentionCandidateSchema).default([]),
});

const mentionSuggestionSchema = z.object({
  identity: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});

export const xDraftSchema = z.object({
  platform: z.literal("X"),
  language: z.literal("en"),
  content: z.string().trim().min(1).max(280),
  claimIds: z.array(z.string()).min(1),
  mentions: z.array(mentionSuggestionSchema).default([]),
});

export const linkedInDraftSchema = z.object({
  platform: z.literal("LINKEDIN"),
  language: z.literal("en"),
  content: z.string().trim().min(1).max(3_000),
  claimIds: z.array(z.string()).min(1),
  mentions: z.array(mentionSuggestionSchema).default([]),
});

export const socialDraftBundleSchema = z.object({
  x: xDraftSchema,
  linkedin: linkedInDraftSchema,
});

export type MentionCandidate = z.infer<typeof mentionCandidateSchema>;
export type VerifiedSocialContext = z.infer<typeof verifiedSocialContextSchema>;
export type SocialDraftBundle = z.infer<typeof socialDraftBundleSchema>;

export function validateDraftBundleAgainstContext(
  input: unknown,
  contextInput: unknown,
): SocialDraftBundle {
  const context = verifiedSocialContextSchema.parse(contextInput);
  const bundle = socialDraftBundleSchema.parse(input);
  const allowedClaims = new Set(context.verifiedClaims.map((claim) => claim.id));

  for (const draft of [bundle.x, bundle.linkedin]) {
    for (const claimId of draft.claimIds) {
      if (!allowedClaims.has(claimId)) throw new Error(`${draft.platform} draft references unsupported claim ${claimId}`);
    }
    const candidates = context.mentionCandidates.filter((candidate) => candidate.platform === draft.platform);
    for (const mention of draft.mentions) {
      const supported = candidates.some(
        (candidate) =>
          candidate.identity.toLowerCase() === mention.identity.toLowerCase()
          && candidate.reason === mention.reason,
      );
      if (!supported) throw new Error(`${draft.platform} draft suggests unsupported mention or reason for ${mention.identity}`);
    }
  }

  if (context.project.isOpenSource && context.project.repositoryUrl) {
    for (const draft of [bundle.x, bundle.linkedin]) {
      if (!draft.content.includes(context.project.repositoryUrl)) {
        throw new Error(`${draft.platform} draft must include the open-source repository URL`);
      }
    }
  }

  return bundle;
}
