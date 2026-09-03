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
      "The journey must start from the application's normal freshly launched main window using its existing local state.",
      "Do not require prepared fixtures, seeded profiles, pending reminders, already-visible notifications, or any setup not included in the returned steps.",
      "Prefer reliably visible main-window navigation and read-only feature exploration over timing-dependent operating-system notifications.",
      "The demo must contain at least one meaningful, safe click, fill, or press action that changes the visible application state, followed by assertVisible evidence of that result.",
      "A sequence made only of assertVisible and wait steps is invalid because it does not demonstrate how the product works.",
      "Every important result must be confirmed with an assertVisible step against visible native UI text or an accessibility role/name.",
      "Return only one valid JSON object, with no Markdown or commentary.",
      "The JSON must contain: objective, summary, assumptions, warnings, and demo.",
      "Write summary as a narration-ready English portfolio script of 45 to 60 words in first person: briefly explain why I built the product, how the implementation works, and what the viewer will visibly do. Avoid sales language, hype, generic claims, and unsupported technical details.",
      "demo must contain a non-empty name and a steps array.",
      "Each step must contain one action from click, fill, press, wait, or assertVisible plus only the fields required by that action.",
      "click and assertVisible require target; fill requires target and value; press requires target and key; wait requires milliseconds between 0 and 10000.",
      "A target must be an object using role/name or visible text. Do not use goto for a desktop demo.",
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
    "Write summary as a narration-ready English portfolio script of 45 to 60 words in first person: briefly explain why I built the product, how the implementation works, and what the viewer will visibly do. Avoid sales language, hype, generic claims, and unsupported technical details.",
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
    const parsedRequest = hermesPlanningRequestSchema.parse(request);
    const args = ["--oneshot", buildHermesPlanningPrompt(parsedRequest)];
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
      const plan = hermesDemoPlanSchema.parse(extractJson(result.stdout));
      if (parsedRequest.kind === "DESKTOP" && !plan.demo.steps.some((step) => ["click", "fill", "press"].includes(step.action))) {
        throw new HermesClientError("Hermes returned a passive desktop plan without a meaningful user interaction");
      }
      return plan;
    } catch (error) {
      if (error instanceof HermesClientError) throw error;
      if (error instanceof ZodError) {
        const detail = error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
          .join("; ");
        throw new HermesClientError(`O plano retornado pelo Hermes não segue o contrato esperado: ${detail}`, {
          cause: error
        });
      }
      throw error;
    }
  }
}
