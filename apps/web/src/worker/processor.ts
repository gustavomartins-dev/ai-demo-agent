import type { GenerationProcessor } from "@/worker/runtime";

export const processGenerationRun: GenerationProcessor = async () => {
  throw new Error("Generation processor is not installed yet; complete issue #22 before running the worker");
};

export const generationProcessorReady = false;
