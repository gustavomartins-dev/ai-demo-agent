import { AiProviderError, HermesAiProvider, type AiCommandRunner } from "../ai/hermes-provider.js";
import { formatAiRequest, type AiRequest } from "../ai/provider.js";
import type { HermesConfig } from "../hermes/config.js";
import { evaluateSocialDraftBundle } from "./evals.js";
import {
  socialDraftBundleSchema,
  validateDraftBundleAgainstContext,
  verifiedSocialContextSchema,
  type SocialDraftBundle,
  type VerifiedSocialContext,
  type VerifiedSocialContextInput,
} from "./contract.js";

export class HermesSocialClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HermesSocialClientError";
  }
}

function socialDraftRequest(contextInput: VerifiedSocialContextInput, signal?: AbortSignal): AiRequest {
  const context = verifiedSocialContextSchema.parse(contextInput);
  return { task: "social-drafts", instructions: [
    "Create two evidence-grounded portfolio posts about the engineer's completed project demo.",
    "Write both posts in English. Never invent a feature, result, person, handle, or attribution.",
    "Write in first person as the builder. Briefly explain what I built, why I built it, and one concrete implementation or engineering decision supported by repositorySources.",
    "The purpose is to demonstrate engineering judgment and learning to recruiters and technical peers, not to sell the product or address prospective customers.",
    "Avoid launch hype, sales language, calls to action, exaggerated claims, and phrases such as game-changing, revolutionary, excited to announce, try it now, or transforms how you work.",
    "Use only verifiedClaims for observed product behavior and repositorySources for implementation details. claimIds and sourcePaths must list the evidence used by each post.",
    "When repositorySources is non-empty, each post must use and cite at least one source path. When it is empty, make no implementation claim and use sourcePaths: [].",
    "Suggest mentions only from mentionCandidates, preserving identity and reason exactly. An empty list is valid.",
    "The X post must be concise and at most 280 characters.",
    "The LinkedIn post should be professional, technically credible, reflective, and at most 3000 characters.",
    "If the project is open source, include its repositoryUrl verbatim in both posts.",
    "Return only valid JSON with this shape:",
    '{"x":{"platform":"X","language":"en","content":"...","claimIds":["claim-1"],"sourcePaths":[],"mentions":[]},"linkedin":{"platform":"LINKEDIN","language":"en","content":"...","claimIds":["claim-1"],"sourcePaths":["README.md"],"mentions":[]}}',
  ], input: context, signal };
}

export function buildSocialDraftPrompt(contextInput: VerifiedSocialContextInput): string {
  return formatAiRequest(socialDraftRequest(contextInput));
}

export class HermesSocialClient {
  constructor(private readonly config: HermesConfig, private readonly runCommand?: AiCommandRunner) {}

  async createDrafts(context: VerifiedSocialContextInput, signal?: AbortSignal): Promise<SocialDraftBundle> {
    const provider = new HermesAiProvider(this.config, this.runCommand);
    try {
      const generated = await provider.generateStructured(socialDraftRequest(context, signal), socialDraftBundleSchema);
      const bundle = validateDraftBundleAgainstContext(generated.value, context);
      const evaluation = evaluateSocialDraftBundle(bundle, context);
      if (!evaluation.passed) {
        const failed = evaluation.checks.filter((check) => !check.passed).map((check) => check.name).join(", ");
        throw new HermesSocialClientError(`Hermes drafts failed quality checks: ${failed}`);
      }
      return bundle;
    } catch (error) {
      if (error instanceof HermesSocialClientError) throw error;
      if (error instanceof AiProviderError) {
        if (error.code === "invalid_json") throw new HermesSocialClientError("Hermes did not return valid JSON", { cause: error });
        if (error.code === "empty_response") throw new HermesSocialClientError("Hermes did not return social drafts", { cause: error });
        if (error.code === "execution_failed") throw new HermesSocialClientError(`Failed to run Hermes with command "${this.config.command}"`, { cause: error });
      }
      throw new HermesSocialClientError("Hermes returned drafts that violate the verified social contract", { cause: error });
    }
  }
}
