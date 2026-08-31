"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createProject } from "@/data/projects";
import { projectInputFromFormData, projectInputSchema } from "@/lib/project-input";

export type CreateProjectState = {
  status: "idle" | "error" | "success";
  message: string;
  errors?: Record<string, string[]>;
};

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
