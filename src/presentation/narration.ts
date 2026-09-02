import { writeFile } from "node:fs/promises";

type Fetcher = typeof fetch;

export type NarrationConfig = {
  apiKey: string;
  model: string;
  voice: string;
};

export function loadNarrationConfig(environment: NodeJS.ProcessEnv = process.env): NarrationConfig | null {
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: environment.AI_DEMO_TTS_MODEL?.trim() || "gpt-4o-mini-tts",
    voice: environment.AI_DEMO_TTS_VOICE?.trim() || "marin",
  };
}

export function buildNarrationScript(objective: string, summary: string): string {
  return [
    `I built this project to explore a focused solution: ${objective.trim()}`,
    `This demo walks through ${summary.trim()}`,
    "I kept the workflow intentionally narrow so the important interactions and states are easy to understand.",
    "The result shows the implementation working end to end, with visible evidence instead of unsupported claims.",
  ].join(" ");
}

export async function synthesizeNarration(
  script: string,
  outputPath: string,
  config: NarrationConfig,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const response = await fetcher("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      voice: config.voice,
      input: script,
      instructions: "Speak in clear, warm, professional English at a concise portfolio-demo pace.",
      response_format: "wav",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Narration synthesis failed with provider status ${response.status}`);
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}
