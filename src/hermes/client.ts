import { AiProviderError, HermesAiProvider, type AiCommandRunner } from "../ai/hermes-provider.js";
import { formatAiRequest, type AiRequest } from "../ai/provider.js";
import type { HermesConfig } from "./config.js";
import {
  hermesDemoPlanSchema,
  hermesPlanningRequestSchema,
  type HermesDemoPlan,
  type HermesPlanningRequest
} from "./contract.js";

export class HermesClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HermesClientError";
  }
}

function planningRequest(request: HermesPlanningRequest, signal?: AbortSignal): AiRequest {
  const input = hermesPlanningRequestSchema.parse(request);

  if (input.kind === "DESKTOP") {
    return { task: "demo-plan", instructions: [
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
      "Every step must include a title: a short present-tense caption of 3 to 8 words describing exactly what becomes visible on screen during that step (e.g. \"Setting a 30-minute manual interval\", \"Dashboard shows the active countdown\"). This caption is burned into the final video, so it must read clearly on its own without the rest of the plan.",
      "Keep the journey short, reversible, and free of destructive actions or external communication.",
    ], input, signal };
  }

  return { task: "demo-plan", instructions: [
    "You are planning a reproducible browser product demo.",
    "Inspect only the authorized URL and use only the supplied repository snapshot as code evidence.",
    "A repository URL is an identifier, not evidence. Treat only the supplied README and source files as repository facts.",
    "Do not invent features. Every important result must be confirmed with an assertVisible step.",
    "The demo must contain at least one meaningful, safe click, fill, or press action that changes the visible page state, followed by assertVisible evidence of that result. A sequence made only of goto, wait, and assertVisible steps is invalid because it does not demonstrate how the product works.",
    "Return only one valid JSON object, with no Markdown or commentary.",
    "The JSON must contain: objective, summary, assumptions, warnings, and demo.",
    "Write summary as a narration-ready English portfolio script of 45 to 60 words in first person: briefly explain why I built the product, how the implementation works, and what the viewer will visibly do. Avoid sales language, hype, generic claims, and unsupported technical details.",
    "demo must contain name, optional viewport, and steps using only these actions:",
    "goto, click, fill, press, wait, assertVisible.",
    "Targets may use role/name, text, testId, or css. Prefer role/name or testId over css.",
    "Every step must include a title: a short present-tense caption of 3 to 8 words describing exactly what becomes visible on screen during that step (e.g. \"Opening the pricing page\", \"Confirmation banner appears\"). This caption is burned into the final video, so it must read clearly on its own without the rest of the plan.",
  ], input, signal };
}

export function buildHermesPlanningPrompt(request: HermesPlanningRequest): string {
  return formatAiRequest(planningRequest(request));
}

export class HermesClient {
  constructor(
    private readonly config: HermesConfig,
    private readonly runCommand?: AiCommandRunner,
  ) {}

  async createDemoPlan(request: HermesPlanningRequest, signal?: AbortSignal): Promise<HermesDemoPlan> {
    const parsedRequest = hermesPlanningRequestSchema.parse(request);
    const provider = new HermesAiProvider(this.config, this.runCommand);
    try {
      const { value: plan } = await provider.generateStructured(planningRequest(parsedRequest, signal), hermesDemoPlanSchema);
      if (!plan.demo.steps.some((step) => ["click", "fill", "press"].includes(step.action))) {
        throw new HermesClientError(
          `Hermes returned a passive ${parsedRequest.kind.toLowerCase()} plan without a meaningful user interaction`
        );
      }
      return plan;
    } catch (error) {
      if (error instanceof HermesClientError) throw error;
      if (error instanceof AiProviderError) {
        if (error.code === "invalid_json") throw new HermesClientError("O Hermes não retornou um JSON válido", { cause: error });
        if (error.code === "invalid_structure") {
          throw new HermesClientError(`O plano retornado pelo Hermes não segue o contrato esperado: ${error.message}`, { cause: error });
        }
        if (error.code === "empty_response") throw new HermesClientError("O Hermes não retornou um plano", { cause: error });
        throw new HermesClientError(`Falha ao executar o Hermes Agent pelo comando "${this.config.command}"`, { cause: error });
      }
      throw error;
    }
  }
}
