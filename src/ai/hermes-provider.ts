import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ZodError, type ZodType } from "zod";
import type { HermesConfig } from "../hermes/config.js";
import {
  formatAiRequest,
  type AiProvider,
  type AiProviderResult,
  type AiRequest,
} from "./provider.js";

const execFileAsync = promisify(execFile);

export type AiCommandResult = { stdout: string; stderr: string };
export type AiCommandRunner = (
  command: string,
  args: string[],
  options: { timeout: number; signal?: AbortSignal },
) => Promise<AiCommandResult>;

const defaultCommandRunner: AiCommandRunner = async (command, args, options) => {
  const result = await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: options.timeout,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

export class AiProviderError extends Error {
  constructor(
    readonly code: "execution_failed" | "empty_response" | "invalid_json" | "invalid_structure",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AiProviderError";
  }
}

function parseJson(response: string): unknown {
  const trimmed = response.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  try {
    return JSON.parse(fenced?.[1] ?? trimmed);
  } catch (error) {
    throw new AiProviderError("invalid_json", "AI provider did not return valid JSON", { cause: error });
  }
}

export class HermesAiProvider implements AiProvider {
  readonly name = "hermes";

  constructor(
    private readonly config: HermesConfig,
    private readonly runCommand: AiCommandRunner = defaultCommandRunner,
  ) {}

  async generateStructured<T>(request: AiRequest, schema: ZodType<T>): Promise<AiProviderResult<T>> {
    const args = ["--oneshot", formatAiRequest(request)];
    if (this.config.model) args.push("--model", this.config.model);
    if (this.config.provider) args.push("--provider", this.config.provider);

    let result: AiCommandResult;
    try {
      result = await this.runCommand(
        this.config.command,
        args,
        request.signal ? { timeout: this.config.timeoutMs, signal: request.signal } : { timeout: this.config.timeoutMs },
      );
    } catch (error) {
      throw new AiProviderError("execution_failed", `Failed to run AI provider "${this.name}"`, { cause: error });
    }
    if (!result.stdout.trim()) {
      throw new AiProviderError("empty_response", `AI provider "${this.name}" returned no structured result`);
    }

    try {
      return { provider: this.name, value: schema.parse(parseJson(result.stdout)) };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof ZodError) {
        const detail = error.issues.slice(0, 3).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
        throw new AiProviderError("invalid_structure", `AI provider result does not match the expected contract: ${detail}`, { cause: error });
      }
      throw error;
    }
  }
}
