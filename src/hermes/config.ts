import { z } from "zod";

const optionalEnvironmentValue = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional()
);

const hermesEnvironmentSchema = z.object({
  AI_DEMO_HERMES_COMMAND: optionalEnvironmentValue.default("hermes"),
  AI_DEMO_HERMES_MODEL: optionalEnvironmentValue,
  AI_DEMO_HERMES_PROVIDER: optionalEnvironmentValue,
  AI_DEMO_HERMES_TIMEOUT_MS: z.preprocess(
    (value) => typeof value === "string" && value.trim() !== "" ? Number(value) : value,
    z.number().int().min(1_000).max(600_000).default(120_000)
  )
});

export type HermesConfig = {
  command: string;
  model?: string;
  provider?: string;
  timeoutMs: number;
};

export function loadHermesConfig(environment: NodeJS.ProcessEnv = process.env): HermesConfig {
  const parsed = hermesEnvironmentSchema.parse(environment);

  return {
    command: parsed.AI_DEMO_HERMES_COMMAND,
    model: parsed.AI_DEMO_HERMES_MODEL,
    provider: parsed.AI_DEMO_HERMES_PROVIDER,
    timeoutMs: parsed.AI_DEMO_HERMES_TIMEOUT_MS
  };
}
