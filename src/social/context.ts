import type { DemoExecutionReport } from "../runner.js";
import type { HermesDemoPlan } from "../hermes/contract.js";
import {
  verifiedSocialContextSchema,
  type MentionCandidate,
  type VerifiedSocialContext,
} from "./contract.js";

export type VerifiedSocialContextInput = {
  project: VerifiedSocialContext["project"];
  objective: string;
  plan: HermesDemoPlan;
  report: DemoExecutionReport;
  evidenceKeysByStep: Record<number, string>;
  mentionCandidates?: MentionCandidate[];
};

function targetStatement(step: HermesDemoPlan["demo"]["steps"][number]): string {
  if (step.action !== "assertVisible") throw new Error("Only assertVisible steps can become verified claims");
  const target = step.target;
  if (target.role) return target.name ? `Visible ${target.role}: ${target.name}` : `Visible role: ${target.role}`;
  if (target.text) return `Visible text: ${target.text}`;
  if (target.testId) return `Visible interface element: ${target.testId}`;
  return `Visible interface element matching: ${target.css}`;
}

export function createVerifiedSocialContext(input: VerifiedSocialContextInput): VerifiedSocialContext {
  if (input.report.status !== "passed") {
    throw new Error("Social context requires a passed Playwright execution report");
  }

  const verifiedClaims = input.report.steps.flatMap((result) => {
    const plannedStep = input.plan.demo.steps[result.index - 1];
    const evidenceStorageKey = input.evidenceKeysByStep[result.index];
    if (result.status !== "passed" || plannedStep?.action !== "assertVisible" || !evidenceStorageKey) return [];
    return [{
      id: `claim-${result.index}`,
      statement: targetStatement(plannedStep),
      stepIndex: result.index,
      evidenceStorageKey,
    }];
  });

  return verifiedSocialContextSchema.parse({
    project: input.project,
    objective: input.objective,
    demoSummary: input.plan.summary,
    verifiedClaims,
    mentionCandidates: input.mentionCandidates ?? [],
  });
}
