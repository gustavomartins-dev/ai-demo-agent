import { readFile } from "node:fs/promises";
import path from "node:path";
import { HermesClient } from "../../../../src/hermes/client.js";
import { loadHermesConfig } from "../../../../src/hermes/config.js";
import { hermesDemoPlanSchema, type HermesDemoPlan, type HermesPlanningRequest } from "../../../../src/hermes/contract.js";
import { DemoRunError, runDemoWithReport, type DemoRunResult } from "../../../../src/runner.js";
import { createVerifiedSocialContext } from "../../../../src/social/context.js";
import { HermesSocialClient } from "../../../../src/social/hermes-client.js";
import type { SocialDraftBundle, VerifiedSocialContext } from "../../../../src/social/contract.js";
import { artifactStorageKey, registerRecordingArtifacts, type RecordingArtifacts } from "../data/generation-artifacts.js";
import { markGenerationRunPlanning, saveGenerationRunPlan } from "../data/generation-plan.js";
import { saveSocialDraftBundle } from "../data/social-drafts.js";
import type { ClaimedGenerationRun } from "../data/generation-queue.js";
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
type SocialGenerator = { createDrafts(context: VerifiedSocialContext): Promise<SocialDraftBundle> };
type SocialStore = (runId: string, workerId: string, bundle: SocialDraftBundle, context: VerifiedSocialContext) => Promise<boolean>;
type DraftingProcessor = (
  run: ClaimedGenerationRun,
  context: { workerId: string; signal: AbortSignal },
  artifacts?: RecordingArtifacts,
) => Promise<void>;

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
  draft?: DraftingProcessor,
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
      if (draft) await draft(run, context, result);
    } catch (error) {
      if (error instanceof DemoRunError) {
        await store(run.id, context.workerId, error.artifacts, outputRoot, false);
      }
      throw error;
    }
  };
}

function safeArtifactPath(outputRoot: string, storageKey: string): string {
  const root = path.resolve(outputRoot);
  const resolved = path.resolve(root, storageKey);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Stored artifact is outside AI_DEMO_OUTPUT_ROOT");
  return resolved;
}

async function persistedArtifacts(run: ClaimedGenerationRun, outputRoot: string): Promise<RecordingArtifacts> {
  const reportAsset = run.assets?.find((asset) => asset.type === "EXECUTION_REPORT" && asset.status === "READY");
  if (!reportAsset) throw new Error("A passed Playwright execution report is required before drafting");
  const reportPath = safeArtifactPath(outputRoot, reportAsset.storageKey);
  const report = JSON.parse(await readFile(reportPath, "utf8")) as RecordingArtifacts["report"];
  const videoPath = null;
  return { reportPath, report, videoPath };
}

function evidenceKeys(artifacts: RecordingArtifacts, outputRoot: string): Record<number, string> {
  const reportDirectory = path.dirname(artifacts.reportPath);
  return Object.fromEntries(artifacts.report.steps.flatMap((step) =>
    step.evidencePath
      ? [[step.index, artifactStorageKey(path.join(reportDirectory, step.evidencePath), outputRoot)]]
      : [],
  ));
}

export function createSocialDraftingProcessor(
  generator: SocialGenerator,
  store: SocialStore,
  outputRoot: string,
): DraftingProcessor {
  return async (run, context, suppliedArtifacts) => {
    ensureActive(context.signal);
    const plan = hermesDemoPlanSchema.parse(run.plan);
    const artifacts = suppliedArtifacts ?? await persistedArtifacts(run, outputRoot);
    const socialContext = createVerifiedSocialContext({
      project: run.project,
      objective: run.objective,
      plan,
      report: artifacts.report,
      evidenceKeysByStep: evidenceKeys(artifacts, outputRoot),
      mentionCandidates: [],
    });
    const bundle = await generator.createDrafts(socialContext);
    ensureActive(context.signal);
    if (!(await store(run.id, context.workerId, bundle, socialContext))) {
      throw new Error("Generation run lease was lost while saving social drafts");
    }
  };
}

const hermesClient = new HermesClient(loadHermesConfig());
const planningProcessor = createHermesPlanningProcessor(hermesClient, {
  markPlanning: markGenerationRunPlanning,
  savePlan: saveGenerationRunPlan,
});
const socialClient = new HermesSocialClient(loadHermesConfig());
const draftingProcessor = createSocialDraftingProcessor(
  socialClient,
  saveSocialDraftBundle,
  process.env.AI_DEMO_OUTPUT_ROOT ?? "output",
);
const recordingProcessor = createPlaywrightRecordingProcessor(
  runDemoWithReport,
  registerRecordingArtifacts,
  process.env.AI_DEMO_OUTPUT_ROOT ?? "output",
  draftingProcessor,
);

export const processGenerationRun: GenerationProcessor = (run, context) =>
  run.status === "RECORDING"
    ? recordingProcessor(run, context)
    : run.status === "DRAFTING"
      ? draftingProcessor(run, context)
      : planningProcessor(run, context);

export const generationProcessorReady = true;
