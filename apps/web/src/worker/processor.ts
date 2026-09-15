import { readFile } from "node:fs/promises";
import path from "node:path";
import { HermesClient } from "../../../../src/hermes/client.js";
import { loadHermesConfig } from "../../../../src/hermes/config.js";
import { hermesDemoPlanSchema, type HermesDemoPlan, type HermesPlanningRequest } from "../../../../src/hermes/contract.js";
import { HermesAiProvider } from "../../../../src/ai/hermes-provider.js";
import { readGitHubRepositorySnapshot } from "../../../../src/github/repository.js";
import { LaunchPackageGenerator } from "../../../../src/launch/generator.js";
import type { LaunchPackageContext, LaunchPackageDraft } from "../../../../src/launch/contract.js";
import { repositorySnapshotSchema, type RepositorySnapshot } from "../../../../src/repository/contract.js";
import { DemoRunError, runDemoWithReport, type DemoRunResult } from "../../../../src/runner.js";
import { runDesktopDemoWithReport } from "../../../../src/desktop/runner.js";
import { desktopProjectRoots, resolveDesktopLaunch } from "../../../../src/desktop/launch.js";
import { createVerifiedSocialContext } from "../../../../src/social/context.js";
import { HermesSocialClient } from "../../../../src/social/hermes-client.js";
import type { SocialDraftBundle, VerifiedSocialContext } from "../../../../src/social/contract.js";
import { artifactStorageKey, registerRecordingArtifacts, type RecordingArtifacts } from "../data/generation-artifacts.js";
import { markGenerationRunPlanning, saveGenerationRunPlan } from "../data/generation-plan.js";
import { saveSocialDraftBundle } from "../data/social-drafts.js";
import { saveLaunchPackageDraft } from "../data/launch-packages.js";
import { githubAccessTokenForOwner } from "../data/github-access.js";
import type { ClaimedGenerationRun } from "../data/generation-queue.js";
import type { GenerationProcessor } from "./runtime.js";

type Planner = { createDemoPlan(request: HermesPlanningRequest, signal?: AbortSignal): Promise<HermesDemoPlan> };
type PlanStore = {
  markPlanning(runId: string, workerId: string): Promise<boolean>;
  savePlan(runId: string, workerId: string, plan: HermesDemoPlan, repositorySnapshot?: RepositorySnapshot): Promise<boolean>;
};
type Recorder = (demo: HermesDemoPlan["demo"], outputRoot: string) => Promise<DemoRunResult>;
type DesktopRecorder = (
  plan: HermesDemoPlan,
  desktop: { projectPath: string; launchCommand: string },
  outputRoot: string,
) => Promise<DemoRunResult>;
type ArtifactStore = (
  runId: string,
  workerId: string,
  artifacts: RecordingArtifacts,
  outputRoot: string,
  succeeded: boolean,
) => Promise<boolean>;
type SocialGenerator = { createDrafts(context: VerifiedSocialContext, signal?: AbortSignal): Promise<SocialDraftBundle> };
type SocialStore = (runId: string, workerId: string, bundle: SocialDraftBundle, context: VerifiedSocialContext) => Promise<boolean>;
type RepositoryReader = (repositoryUrl: string, options: { token?: string; signal?: AbortSignal }) => Promise<RepositorySnapshot>;
type LaunchGenerator = { createPackage(context: LaunchPackageContext, signal?: AbortSignal): Promise<LaunchPackageDraft> };
type DraftingProcessor = (
  run: ClaimedGenerationRun,
  context: { workerId: string; signal: AbortSignal },
  artifacts?: RecordingArtifacts,
) => Promise<void>;

function ensureActive(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error("Generation processing was aborted");
}

export function createHermesPlanningProcessor(
  planner: Planner,
  store: PlanStore,
  repository?: { read: RepositoryReader; tokenForOwner(ownerId: string): Promise<string | undefined> },
): GenerationProcessor {
  return async (run, context) => {
    ensureActive(context.signal);
    if (!(await store.markPlanning(run.id, context.workerId))) {
      throw new Error("Generation run lease was lost before Hermes planning");
    }

    let desktop: { projectPath: string; launchCommand: string } | undefined;
    let localReadme: string | undefined;
    let repositorySnapshot: RepositorySnapshot | undefined;
    if ((run.project.kind ?? "WEB") === "DESKTOP") {
      if (!run.project.localPath || !run.project.launchCommand) throw new Error("Desktop project launch configuration is incomplete");
      const launch = await resolveDesktopLaunch(run.project.localPath, run.project.launchCommand, desktopProjectRoots());
      desktop = { projectPath: launch.projectPath, launchCommand: run.project.launchCommand };
      try {
        localReadme = (await readFile(path.join(launch.projectPath, "README.md"), "utf8")).slice(0, 100_000);
      } catch {
        // Repository URL and objective remain valid planning context without a README.
      }
    }

    if (run.project.ownerId && run.project.repositoryUrl && repository && /^https:\/\/(?:www\.)?github\.com\//i.test(run.project.repositoryUrl)) {
      repositorySnapshot = await repository.read(run.project.repositoryUrl, {
        token: await repository.tokenForOwner(run.project.ownerId),
        signal: context.signal,
      });
    }

    const request: HermesPlanningRequest = {
      kind: run.project.kind ?? "WEB",
      url: run.project.productUrl,
      objective: run.objective,
      ...(desktop ? { desktop } : {}),
      ...(run.project.repositoryUrl || desktop ? { repository: {
        ...(run.project.repositoryUrl ? { url: run.project.repositoryUrl } : {}),
        ...(desktop ? { path: desktop.projectPath } : {}),
        ...(repositorySnapshot?.readme?.content || localReadme ? { readme: repositorySnapshot?.readme?.content ?? localReadme } : {}),
        ...(repositorySnapshot ? {
          revision: repositorySnapshot.sourceSha,
          files: repositorySnapshot.files.map((file) => ({ path: file.path, content: file.content })),
        } : {}),
      } } : {}),
    };
    const plan = hermesDemoPlanSchema.parse(await planner.createDemoPlan(request, context.signal));
    ensureActive(context.signal);

    const saved = repositorySnapshot
      ? await store.savePlan(run.id, context.workerId, plan, repositorySnapshot)
      : await store.savePlan(run.id, context.workerId, plan);
    if (!saved) {
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

export function createDesktopRecordingProcessor(
  recorder: DesktopRecorder,
  store: ArtifactStore,
  outputRoot: string,
  draft?: DraftingProcessor,
): GenerationProcessor {
  return async (run, context) => {
    ensureActive(context.signal);
    const plan = hermesDemoPlanSchema.parse(run.plan);
    if (!run.project.localPath || !run.project.launchCommand) throw new Error("Desktop project launch configuration is incomplete");
    try {
      const result = await recorder(plan, {
        projectPath: run.project.localPath,
        launchCommand: run.project.launchCommand,
      }, outputRoot);
      ensureActive(context.signal);
      if (!(await store(run.id, context.workerId, result, outputRoot, true))) {
        throw new Error("Generation run lease was lost while registering desktop artifacts");
      }
      if (draft) await draft(run, context, result);
    } catch (error) {
      if (error instanceof DemoRunError) await store(run.id, context.workerId, error.artifacts, outputRoot, false);
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
  if (!reportAsset) throw new Error("A passed evidence-backed execution report is required before drafting");
  const reportPath = safeArtifactPath(outputRoot, reportAsset.storageKey);
  const report = JSON.parse(await readFile(reportPath, "utf8")) as RecordingArtifacts["report"];
  const videoAsset = run.assets?.find((asset) => asset.type === "VIDEO" && asset.status === "READY");
  const videoPath = videoAsset ? safeArtifactPath(outputRoot, videoAsset.storageKey) : null;
  return { reportPath, report, videoPath };
}

function evidenceKeys(artifacts: RecordingArtifacts, outputRoot: string): Record<number, string> {
  const reportDirectory = path.dirname(artifacts.reportPath);
  const videoStorageKey = artifacts.videoPath ? artifactStorageKey(artifacts.videoPath, outputRoot) : undefined;
  return Object.fromEntries(artifacts.report.steps.flatMap((step) =>
    step.evidencePath
      ? [[step.index, artifactStorageKey(path.join(reportDirectory, step.evidencePath), outputRoot)]]
      : step.status === "passed" && videoStorageKey
        ? [[step.index, videoStorageKey]]
      : [],
  ));
}

export function createSocialDraftingProcessor(
  generator: SocialGenerator,
  store: SocialStore,
  outputRoot: string,
  launch?: {
    generator: LaunchGenerator;
    save(runId: string, workerId: string, draft: LaunchPackageDraft): Promise<boolean>;
  },
): DraftingProcessor {
  return async (run, context, suppliedArtifacts) => {
    ensureActive(context.signal);
    const plan = hermesDemoPlanSchema.parse(run.plan);
    const artifacts = suppliedArtifacts ?? await persistedArtifacts(run, outputRoot);
    const repositorySnapshot = run.repositorySnapshot ? repositorySnapshotSchema.parse(run.repositorySnapshot) : undefined;
    const socialContext = createVerifiedSocialContext({
      project: run.project,
      objective: run.objective,
      plan,
      report: artifacts.report,
      evidenceKeysByStep: evidenceKeys(artifacts, outputRoot),
      repositorySources: repositorySnapshot?.files.map((file) => ({ path: file.path, content: file.content })) ?? [],
      mentionCandidates: [],
    });
    if (launch && repositorySnapshot && (run.project.kind ?? "WEB") === "WEB" && run.project.repositoryUrl) {
      const launchPackage = await launch.generator.createPackage({
        project: { name: run.project.name, productUrl: run.project.productUrl, repositoryUrl: run.project.repositoryUrl },
        objective: run.objective,
        demoSummary: plan.summary,
        repository: repositorySnapshot,
        verifiedClaims: socialContext.verifiedClaims,
      }, context.signal);
      ensureActive(context.signal);
      if (!(await launch.save(run.id, context.workerId, launchPackage))) {
        throw new Error("Generation run lease was lost while saving the launch package");
      }
    }
    const bundle = await generator.createDrafts(socialContext, context.signal);
    ensureActive(context.signal);
    if (!(await store(run.id, context.workerId, bundle, socialContext))) {
      throw new Error("Generation run lease was lost while saving social drafts");
    }
  };
}

const hermesConfig = loadHermesConfig();
const hermesClient = new HermesClient(hermesConfig);
const planningProcessor = createHermesPlanningProcessor(hermesClient, {
  markPlanning: markGenerationRunPlanning,
  savePlan: saveGenerationRunPlan,
}, { read: readGitHubRepositorySnapshot, tokenForOwner: githubAccessTokenForOwner });
const socialClient = new HermesSocialClient(hermesConfig);
const launchPackageGenerator = new LaunchPackageGenerator(new HermesAiProvider(hermesConfig));
const draftingProcessor = createSocialDraftingProcessor(
  socialClient,
  saveSocialDraftBundle,
  process.env.AI_DEMO_OUTPUT_ROOT ?? "output",
  { generator: launchPackageGenerator, save: saveLaunchPackageDraft },
);
const recordingProcessor = createPlaywrightRecordingProcessor(
  runDemoWithReport,
  registerRecordingArtifacts,
  process.env.AI_DEMO_OUTPUT_ROOT ?? "output",
  draftingProcessor,
);
const desktopRecordingProcessor = createDesktopRecordingProcessor(
  (plan, desktop, outputRoot) => runDesktopDemoWithReport(plan, desktop, hermesConfig, outputRoot),
  registerRecordingArtifacts,
  process.env.AI_DEMO_OUTPUT_ROOT ?? "output",
  draftingProcessor,
);

export const processGenerationRun: GenerationProcessor = (run, context) =>
  run.status === "RECORDING"
    ? (run.project.kind === "DESKTOP" ? desktopRecordingProcessor : recordingProcessor)(run, context)
    : run.status === "DRAFTING"
      ? draftingProcessor(run, context)
      : planningProcessor(run, context);

export const generationProcessorReady = true;
