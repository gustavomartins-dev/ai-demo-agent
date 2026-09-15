import type { AiProvider } from "../ai/provider.js";
import {
  launchPackageContextSchema,
  launchPackageDraftSchema,
  validateLaunchPackageAgainstContext,
  type LaunchPackageContext,
  type LaunchPackageDraft,
} from "./contract.js";

export class LaunchPackageGeneratorError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LaunchPackageGeneratorError";
  }
}

export class LaunchPackageGenerator {
  constructor(private readonly provider: AiProvider) {}

  async createPackage(contextInput: LaunchPackageContext, signal?: AbortSignal): Promise<LaunchPackageDraft> {
    const context = launchPackageContextSchema.parse(contextInput);
    try {
      const generated = await this.provider.generateStructured({
        task: "launch-package",
        signal,
        instructions: [
          "Create a factual English publication package for an engineer's web project.",
          "Return only JSON matching the requested contract.",
          "Use repository files only for implementation claims and verifiedClaims only for observed product behavior.",
          "A path, URL, objective, or demo summary is context, not proof of an implementation detail.",
          "Never invent features, dependencies, metrics, architecture, test results, setup commands, people, or history.",
          "Write a complete README that briefly explains the problem, architecture, implementation decisions, verified demo, setup supported by source files, limitations, and links to the product and repository.",
          "Preserve useful factual material from the existing README when one is supplied, but remove unsupported hype and stale claims.",
          "Write release notes for the verified state being presented. Do not claim an unverified diff or previous release history.",
          "Write as an engineering portfolio: explain what I built, why, how it works, evidence, tradeoffs, and next steps. Do not write sales copy.",
          "repositoryDescription must be concise and no more than 350 characters.",
          "releaseTag must be a semantic version such as v0.1.0. Prefer a version found in supplied manifests; otherwise use v0.1.0.",
          "sourcePaths must contain every supplied repository path used for technical claims, and no unavailable paths.",
          "claimIds must contain every verified visual claim used, and no unavailable claims.",
          "readmeMarkdown must include the productUrl verbatim.",
        ],
        input: context,
      }, launchPackageDraftSchema);
      return validateLaunchPackageAgainstContext(generated.value, context);
    } catch (error) {
      throw new LaunchPackageGeneratorError(`Launch package generation failed with provider "${this.provider.name}"`, { cause: error });
    }
  }
}
