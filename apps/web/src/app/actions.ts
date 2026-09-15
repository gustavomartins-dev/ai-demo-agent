"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createProject, retryFailedGenerationRun, updateOwnedSocialDraft } from "@/data/projects";
import { projectInputFromFormData, projectInputSchema } from "@/lib/project-input";
import { socialDraftEditFromFormData, socialDraftEditSchema } from "@/lib/social-draft-input";
import { disconnectOwnedSocialAccount } from "@/data/social-accounts";
import { parseSocialOAuthPlatform } from "@/lib/social-oauth/config";
import { approveOwnedSocialDraft } from "@/data/social-drafts";
import { publishApprovedOwnedSocialDraft } from "@/data/social-publishing";
import {
  approveOwnedLaunchPackage,
  publishApprovedOwnedLaunchPackage,
  updateOwnedLaunchPackage,
} from "@/data/launch-packages";
import { launchPackageEditFromFormData, launchPackageEditSchema } from "@/lib/launch-package-input";

export type CreateProjectState = {
  status: "idle" | "error" | "success";
  message: string;
  errors?: Record<string, string[]>;
};

export type SaveSocialDraftState = { status: "idle" | "error" | "success"; message: string };
export type ApproveSocialDraftState = { status: "idle" | "error" | "success"; message: string };
export type PublishSocialDraftState = { status: "idle" | "error" | "success"; message: string; url?: string };
export type LaunchPackageActionState = { status: "idle" | "error" | "success"; message: string; url?: string };

export async function saveLaunchPackageAction(
  _previousState: LaunchPackageActionState,
  formData: FormData,
): Promise<LaunchPackageActionState> {
  const session = await auth();
  if (!session?.user?.id) return { status: "error", message: "Authentication required." };
  const validated = launchPackageEditSchema.safeParse(launchPackageEditFromFormData(formData));
  if (!validated.success) return { status: "error", message: validated.error.issues[0]?.message ?? "Invalid launch package." };
  const { packageId, ...input } = validated.data;
  const saved = await updateOwnedLaunchPackage(session.user.id, packageId, input);
  if (!saved) return { status: "error", message: "This launch package is no longer editable." };
  revalidatePath(`/projects/${saved.projectId}`);
  return { status: "success", message: "Launch package saved. Its previous approval, if any, was cleared." };
}

export async function approveLaunchPackageAction(
  _previousState: LaunchPackageActionState,
  formData: FormData,
): Promise<LaunchPackageActionState> {
  const session = await auth();
  if (!session?.user?.id) return { status: "error", message: "Authentication required." };
  const packageId = formData.get("packageId");
  if (typeof packageId !== "string" || !packageId.trim()) return { status: "error", message: "Invalid launch package." };
  const approved = await approveOwnedLaunchPackage(session.user.id, packageId);
  if (!approved) return { status: "error", message: "This package cannot be approved in its current state." };
  revalidatePath(`/projects/${approved.projectId}`);
  return { status: "success", message: "README, repository description, release notes, and tag were frozen. Nothing was published." };
}

export async function publishLaunchPackageAction(
  _previousState: LaunchPackageActionState,
  formData: FormData,
): Promise<LaunchPackageActionState> {
  const session = await auth();
  if (!session?.user?.id) return { status: "error", message: "Authentication required." };
  const packageId = formData.get("packageId");
  if (typeof packageId !== "string" || !packageId.trim()) return { status: "error", message: "Invalid launch package." };
  const outcome = await publishApprovedOwnedLaunchPackage(session.user.id, packageId);
  if (outcome.projectId) revalidatePath(`/projects/${outcome.projectId}`);
  if (outcome.status === "published") return { status: "success", message: "GitHub README, description, and release were published.", url: outcome.url };
  if (outcome.status === "already_handled") return { status: "error", message: "This exact approval already has a publication attempt, so no duplicate was created.", ...(outcome.url ? { url: outcome.url } : {}) };
  if (outcome.status === "failed") return { status: "error", message: `GitHub publishing stopped (${outcome.code}). Ambiguous attempts are not retried automatically.`, };
  return { status: "error", message: "Publishing requires an approved package and a GitHub token with repository write access." };
}

export async function publishSocialDraftAction(
  _previousState: PublishSocialDraftState,
  formData: FormData,
): Promise<PublishSocialDraftState> {
  const session = await auth();
  if (!session?.user?.id) return { status: "error", message: "Authentication required." };
  const draftId = formData.get("draftId");
  if (typeof draftId !== "string" || !draftId.trim()) return { status: "error", message: "Invalid draft." };
  const outcome = await publishApprovedOwnedSocialDraft(session.user.id, draftId);
  if (outcome.projectId) revalidatePath(`/projects/${outcome.projectId}`);
  if (outcome.status === "published") return { status: "success", message: "Post published successfully.", url: outcome.url };
  if (outcome.status === "already_handled") return { status: "error", message: "This exact approval was already submitted. No duplicate was created.", ...(outcome.url ? { url: outcome.url } : {}) };
  if (outcome.status === "failed") return { status: "error", message: `Publishing stopped safely (${outcome.code}). Review the connection before trying a newly approved version.` };
  return { status: "error", message: "Publishing requires an unchanged approval and a valid matching account." };
}

export async function approveSocialDraftAction(
  _previousState: ApproveSocialDraftState,
  formData: FormData,
): Promise<ApproveSocialDraftState> {
  const session = await auth();
  if (!session?.user?.id) return { status: "error", message: "Authentication required." };
  const draftId = formData.get("draftId");
  if (typeof draftId !== "string" || !draftId.trim()) return { status: "error", message: "Invalid draft." };
  const approved = await approveOwnedSocialDraft(session.user.id, draftId);
  if (!approved) return { status: "error", message: "Connect the matching account and verify draft evidence before approval." };
  revalidatePath(`/projects/${approved.projectId}`);
  return { status: "success", message: `${approved.platform === "LINKEDIN" ? "LinkedIn" : "X"} draft approved. Nothing was published.` };
}

export async function saveSocialDraftAction(
  _previousState: SaveSocialDraftState,
  formData: FormData,
): Promise<SaveSocialDraftState> {
  const session = await auth();
  if (!session?.user?.id) return { status: "error", message: "Authentication required." };
  const validated = socialDraftEditSchema.safeParse(socialDraftEditFromFormData(formData));
  if (!validated.success) return { status: "error", message: validated.error.issues[0]?.message ?? "Invalid draft." };

  const saved = await updateOwnedSocialDraft(
    session.user.id,
    validated.data.draftId,
    validated.data.platform,
    validated.data.content,
  );
  if (!saved) return { status: "error", message: "This draft is no longer available." };
  revalidatePath(`/projects/${saved.projectId}`);
  return { status: "success", message: "Draft saved." };
}

export async function createProjectAction(
  _previousState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      status: "error",
      message: "Sign in with the workspace owner account before creating a project.",
    };
  }

  const validated = projectInputSchema.safeParse(projectInputFromFormData(formData));
  if (!validated.success) {
    return {
      status: "error",
      message: "Review the highlighted fields.",
      errors: validated.error.flatten().fieldErrors,
    };
  }

  if (!process.env.DATABASE_URL) {
    return {
      status: "error",
      message: "Configure PostgreSQL before creating a project.",
    };
  }

  await createProject(session.user.id, validated.data);
  revalidatePath("/");
  return { status: "success", message: "Project created and queued for analysis." };
}

export async function retryGenerationRunAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Authentication required");
  const runId = formData.get("runId");
  if (typeof runId !== "string" || !runId.trim()) throw new Error("Invalid generation run");

  const retried = await retryFailedGenerationRun(session.user.id, runId);
  if (!retried) throw new Error("This failed generation run is no longer available for retry");
  revalidatePath("/");
  revalidatePath(`/projects/${retried.projectId}`);
}

export async function disconnectSocialAccountAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Authentication required");
  const platformValue = formData.get("platform");
  const platform = typeof platformValue === "string" ? parseSocialOAuthPlatform(platformValue) : null;
  if (!platform) throw new Error("Invalid social platform");
  await disconnectOwnedSocialAccount(session.user.id, platform);
  revalidatePath("/");
}
