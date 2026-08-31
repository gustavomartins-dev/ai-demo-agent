import { HermesClient } from "../../../../src/hermes/client.js";
import { loadHermesConfig } from "../../../../src/hermes/config.js";
import { hermesDemoPlanSchema, type HermesDemoPlan, type HermesPlanningRequest } from "../../../../src/hermes/contract.js";
import { DemoRunError, runDemoWithReport, type DemoRunResult } from "../../../../src/runner.js";
import { registerRecordingArtifacts, type RecordingArtifacts } from "../data/generation-artifacts.js";
import { markGenerationRunPlanning, saveGenerationRunPlan } from "../data/generation-plan.js";
import type { GenerationProcessor } from "./runtime.js";

type Planner = { createDemoPlan(request: HermesPlanningRequest): Promise<HermesDemoPlan> };
type PlanStore = {
  markPlanning(runId: string, workerId: string): Promise<boolean>;
  savePlan(runId: string, workerId: string, plan: HermesDemoPlan): Promise<boolean>;
};
type Recorder = (demo: HermesDemoPlan["demo"], outputRoot: string) => Promise<DemoRunResult>;
type ArtifactStore = (
  runId: string,
  workerId: string,
  artifacts: RecordingArtifacts,
  outputRoot: string,
  succeeded: boolean,
) => Promise<boolean>;

function ensureActive(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error("Generation processing was aborted");
}

export function createHermesPlanningProcessor(planner: Planner, store: PlanStore): GenerationProcessor {
  return async (run, context) => {
    ensureActive(context.signal);
    if (!(await store.markPlanning(run.id, context.workerId))) {
      throw new Error("Generation run lease was lost before Hermes planning");
    }

    const request: HermesPlanningRequest = {
      url: run.project.productUrl,
      objective: run.objective,
      ...(run.project.repositoryUrl ? { repository: { url: run.project.repositoryUrl } } : {}),
    };
    const plan = hermesDemoPlanSchema.parse(await planner.createDemoPlan(request));
    ensureActive(context.signal);

    if (!(await store.savePlan(run.id, context.workerId, plan))) {
      throw new Error("Generation run lease was lost while saving the Hermes plan");
    }
  };
}

export function createPlaywrightRecordingProcessor(
  recorder: Recorder,
  store: ArtifactStore,
  outputRoot: string,
): GenerationProcessor {
  return async (run, context) => {
    ensureActive(context.signal);
    const plan = hermesDemoPlanSchema.parse(run.plan);
    try {
      const result = await recorder(plan.demo, outputRoot);
      ensureActive(context.signal);
      if (!(await store(run.id, context.workerId, result, outputRoot, true))) {
        throw new Error("Generation run lease was lost while registering Playwright artifacts");
      }
    } catch (error) {
      if (error instanceof DemoRunError) {
        await store(run.id, context.workerId, error.artifacts, outputRoot, false);
      }
      throw error;
    }
  };
}

const hermesClient = new HermesClient(loadHermesConfig());
const planningProcessor = createHermesPlanningProcessor(hermesClient, {
  markPlanning: markGenerationRunPlanning,
  savePlan: saveGenerationRunPlan,
});
const recordingProcessor = createPlaywrightRecordingProcessor(
  runDemoWithReport,
  registerRecordingArtifacts,
  process.env.AI_DEMO_OUTPUT_ROOT ?? "output",
);

export const processGenerationRun: GenerationProcessor = (run, context) =>
  run.status === "RECORDING" ? recordingProcessor(run, context) : planningProcessor(run, context);

export const generationProcessorReady = true;
