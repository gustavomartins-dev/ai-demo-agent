import { socialDraftBundleSchema, verifiedSocialContextSchema } from "./contract.js";

export type SocialEvalCheck = {
  name: "schema" | "english_only" | "required_links" | "supported_mentions" | "grounded_claims";
  passed: boolean;
  detail: string;
};

export type SocialEvalResult = { passed: boolean; checks: SocialEvalCheck[] };

const portugueseSignals = new Set([
  "ainda", "aplicacao", "aplicação", "com", "como", "consegui", "este", "esta", "está", "feito",
  "foi", "funciona", "para", "pela", "projeto", "resultado", "uma", "video", "vídeo",
]);

function words(content: string): string[] {
  return content.toLocaleLowerCase("en-US").match(/[\p{L}]+/gu) ?? [];
}

export function appearsEnglish(content: string): boolean {
  const tokens = words(content);
  const signals = tokens.filter((token) => portugueseSignals.has(token)).length;
  return signals < 2;
}

export function evaluateSocialDraftBundle(input: unknown, contextInput: unknown): SocialEvalResult {
  const contextResult = verifiedSocialContextSchema.safeParse(contextInput);
  const bundleResult = socialDraftBundleSchema.safeParse(input);
  const checks: SocialEvalCheck[] = [{
    name: "schema",
    passed: contextResult.success && bundleResult.success,
    detail: contextResult.success && bundleResult.success
      ? "Context and both platform drafts match the structured contract."
      : "Context or draft output violates the structured contract or platform limit.",
  }];

  if (!contextResult.success || !bundleResult.success) return { passed: false, checks };
  const context = contextResult.data;
  const bundle = bundleResult.data;
  const drafts = [bundle.x, bundle.linkedin];
  const knownClaims = new Map(context.verifiedClaims.map((claim) => [claim.id, claim]));

  checks.push({
    name: "english_only",
    passed: drafts.every((draft) => appearsEnglish(draft.content)),
    detail: "Draft content must not contain multiple deterministic Portuguese-language signals.",
  });

  const requiredRepository = context.project.isOpenSource ? context.project.repositoryUrl : null;
  checks.push({
    name: "required_links",
    passed: !requiredRepository || drafts.every((draft) => draft.content.includes(requiredRepository)),
    detail: requiredRepository ? "Both open-source drafts must include the repository URL." : "No repository URL is required.",
  });

  checks.push({
    name: "supported_mentions",
    passed: drafts.every((draft) => draft.mentions.every((mention) => context.mentionCandidates.some((candidate) =>
      candidate.platform === draft.platform
      && candidate.identity.toLowerCase() === mention.identity.toLowerCase()
      && candidate.reason === mention.reason,
    ))),
    detail: "Every suggested identity and reason must match a verified platform candidate.",
  });

  checks.push({
    name: "grounded_claims",
    passed: drafts.every((draft) => draft.claimIds.every((claimId) => {
      const claim = knownClaims.get(claimId);
      return Boolean(claim?.evidenceStorageKey && claim.stepIndex > 0);
    })),
    detail: "Every referenced claim must resolve to a passed Playwright step with stored evidence.",
  });

  return { passed: checks.every((check) => check.passed), checks };
}
