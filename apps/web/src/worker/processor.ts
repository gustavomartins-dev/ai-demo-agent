import { HermesClient } from "../../../../src/hermes/client.js";
import { loadHermesConfig } from "../../../../src/hermes/config.js";
import { hermesDemoPlanSchema, type HermesDemoPlan, type HermesPlanningRequest } from "../../../../src/hermes/contract.js";
import { markGenerationRunPlanning, saveGenerationRunPlan } from "../data/generation-plan.js";
import type { GenerationProcessor } from "./runtime.js";

type Planner = { createDemoPlan(request: HermesPlanningRequest): Promise<HermesDemoPlan> };
type PlanStore = {
  markPlanning(runId: string, workerId: string): Promise<boolean>;
  savePlan(runId: string, workerId: string, plan: HermesDemoPlan): Promise<boolean>;
};

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

const hermesClient = new HermesClient(loadHermesConfig());
export const processGenerationRun = createHermesPlanningProcessor(hermesClient, {
  markPlanning: markGenerationRunPlanning,
  savePlan: saveGenerationRunPlan,
});

export const generationProcessorReady = true;
