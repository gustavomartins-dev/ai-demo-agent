import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HermesConfig } from "../hermes/config.js";
import { evaluateSocialDraftBundle } from "./evals.js";
import {
  validateDraftBundleAgainstContext,
  verifiedSocialContextSchema,
  type SocialDraftBundle,
  type VerifiedSocialContext,
} from "./contract.js";

const execFileAsync = promisify(execFile);

type CommandResult = { stdout: string; stderr: string };
type CommandRunner = (command: string, args: string[], options: { timeout: number }) => Promise<CommandResult>;

const defaultCommandRunner: CommandRunner = async (command, args, options) => {
  const result = await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: options.timeout,
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

export class HermesSocialClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HermesSocialClientError";
  }
}

export function buildSocialDraftPrompt(contextInput: VerifiedSocialContext): string {
  const context = verifiedSocialContextSchema.parse(contextInput);
  return [
    "Create two evidence-grounded social posts for this completed product demo.",
    "Write both posts in English. Never invent a feature, result, person, handle, or attribution.",
    "Use only verifiedClaims. claimIds must list every claim used by each post.",
    "Suggest mentions only from mentionCandidates, preserving identity and reason exactly. An empty list is valid.",
    "The X post must be concise and at most 280 characters.",
    "The LinkedIn post should be professional, clear, and at most 3000 characters.",
    "If the project is open source, include its repositoryUrl verbatim in both posts.",
    "Return only valid JSON with this shape:",
    '{"x":{"platform":"X","language":"en","content":"...","claimIds":["claim-1"],"mentions":[]},"linkedin":{"platform":"LINKEDIN","language":"en","content":"...","claimIds":["claim-1"],"mentions":[]}}',
    "Verified context:",
    JSON.stringify(context),
  ].join("\n");
}

function parseJson(response: string): unknown {
  const trimmed = response.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  try {
    return JSON.parse(fenced?.[1] ?? trimmed);
  } catch (error) {
    throw new HermesSocialClientError("Hermes did not return valid JSON", { cause: error });
  }
}

export class HermesSocialClient {
  constructor(private readonly config: HermesConfig, private readonly runCommand: CommandRunner = defaultCommandRunner) {}

  async createDrafts(context: VerifiedSocialContext): Promise<SocialDraftBundle> {
    const args = ["--oneshot", buildSocialDraftPrompt(context)];
    if (this.config.model) args.push("--model", this.config.model);
    if (this.config.provider) args.push("--provider", this.config.provider);

    let result: CommandResult;
    try {
      result = await this.runCommand(this.config.command, args, { timeout: this.config.timeoutMs });
    } catch (error) {
      throw new HermesSocialClientError(`Failed to run Hermes with command "${this.config.command}"`, { cause: error });
    }
    if (!result.stdout.trim()) {
      throw new HermesSocialClientError(result.stderr.trim() || "Hermes did not return social drafts");
    }
    try {
      const bundle = validateDraftBundleAgainstContext(parseJson(result.stdout), context);
      const evaluation = evaluateSocialDraftBundle(bundle, context);
      if (!evaluation.passed) {
        const failed = evaluation.checks.filter((check) => !check.passed).map((check) => check.name).join(", ");
        throw new HermesSocialClientError(`Hermes drafts failed quality checks: ${failed}`);
      }
      return bundle;
    } catch (error) {
      if (error instanceof HermesSocialClientError) throw error;
      throw new HermesSocialClientError("Hermes returned drafts that violate the verified social contract", { cause: error });
    }
  }
}
