"use server";

import { revalidatePath } from "next/cache";
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
  if (process.env.NODE_ENV === "production") {
    return {
      status: "error",
      message: "Project creation is disabled until workspace authentication is configured.",
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

  await createProject(validated.data);
  revalidatePath("/");
  return { status: "success", message: "Project created and queued for analysis." };
}
