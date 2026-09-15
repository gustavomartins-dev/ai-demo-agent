import type { ZodType } from "zod";

export type AiRequest = {
  task: string;
  instructions: string[];
  input: unknown;
  signal?: AbortSignal;
};

export type AiProviderResult<T> = {
  provider: string;
  value: T;
};

export interface AiProvider {
  readonly name: string;
  generateStructured<T>(request: AiRequest, schema: ZodType<T>): Promise<AiProviderResult<T>>;
}

export function formatAiRequest(request: AiRequest): string {
  return [
    `Task: ${request.task}`,
    ...request.instructions,
    "Input:",
    JSON.stringify(request.input),
  ].join("\n");
}
