import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ZodError } from "zod";
import type { HermesConfig } from "./config.js";
import {
  hermesDemoPlanSchema,
  hermesPlanningRequestSchema,
  type HermesDemoPlan,
  type HermesPlanningRequest
} from "./contract.js";

const execFileAsync = promisify(execFile);

type CommandResult = { stdout: string; stderr: string };
type CommandRunner = (
  command: string,
  args: string[],
  options: { timeout: number }
) => Promise<CommandResult>;

const defaultCommandRunner: CommandRunner = async (command, args, options) => {
  const result = await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: options.timeout
  });

  return { stdout: result.stdout, stderr: result.stderr };
};

export class HermesClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HermesClientError";
  }
}

export function buildHermesPlanningPrompt(request: HermesPlanningRequest): string {
  const input = hermesPlanningRequestSchema.parse(request);

  if (input.kind === "DESKTOP") {
    return [
      "You are planning a reproducible native desktop product demo.",
      "Use only documented repository context and the stated launch objective.",
      "Do not execute the application during planning and do not invent features.",
      "Every important result must be confirmed with an assertVisible step against visible native UI text or an accessibility role/name.",
      "Return only one valid JSON object, with no Markdown or commentary.",
      "The JSON must contain: objective, summary, assumptions, warnings, and demo.",
      "demo uses the existing semantic actions click, fill, press, wait, and assertVisible. Do not use goto for a desktop demo.",
      "Targets may use role/name or visible text. Do not use browser CSS or test IDs.",
      "Keep the journey short, reversible, and free of destructive actions or external communication.",
      "Planning input:",
      JSON.stringify(input),
    ].join("\n");
  }

  return [
    "You are planning a reproducible browser product demo.",
    "Inspect only the authorized URL and use the repository context provided below.",
    "Do not invent features. Every important result must be confirmed with an assertVisible step.",
    "Return only one valid JSON object, with no Markdown or commentary.",
    "The JSON must contain: objective, summary, assumptions, warnings, and demo.",
    "demo must contain name, optional viewport, and steps using only these actions:",
    "goto, click, fill, press, wait, assertVisible.",
    "Targets may use role/name, text, testId, or css. Prefer role/name or testId over css.",
    "Planning input:",
    JSON.stringify(input)
  ].join("\n");
}

function extractJson(response: string): unknown {
  const trimmed = response.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1] ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new HermesClientError("O Hermes não retornou um JSON válido", { cause: error });
  }
}

export class HermesClient {
  constructor(
    private readonly config: HermesConfig,
    private readonly runCommand: CommandRunner = defaultCommandRunner
  ) {}

  async createDemoPlan(request: HermesPlanningRequest): Promise<HermesDemoPlan> {
    const args = ["--oneshot", buildHermesPlanningPrompt(request)];
    if (this.config.model) args.push("--model", this.config.model);
    if (this.config.provider) args.push("--provider", this.config.provider);

    let result: CommandResult;
    try {
      result = await this.runCommand(this.config.command, args, { timeout: this.config.timeoutMs });
    } catch (error) {
      throw new HermesClientError(
        `Falha ao executar o Hermes Agent pelo comando "${this.config.command}"`,
        { cause: error }
      );
    }

    if (!result.stdout.trim()) {
      const detail = result.stderr.trim();
      throw new HermesClientError(
        detail ? `O Hermes não retornou um plano: ${detail}` : "O Hermes não retornou um plano"
      );
    }

    try {
      return hermesDemoPlanSchema.parse(extractJson(result.stdout));
    } catch (error) {
      if (error instanceof HermesClientError) throw error;
      if (error instanceof ZodError) {
        throw new HermesClientError("O plano retornado pelo Hermes não segue o contrato esperado", {
          cause: error
        });
      }
      throw error;
    }
  }
}
