import { z } from "zod";

export const launchPackageEditSchema = z.object({
  packageId: z.string().trim().min(1),
  repositoryDescription: z.string().trim().min(1, "Repository description is required.").max(350),
  readmeMarkdown: z.string().trim().min(100, "README must contain at least 100 characters.").max(100_000),
  releaseTag: z.string().trim().regex(/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Use a semantic version such as v0.1.0."),
  releaseTitle: z.string().trim().min(1, "Release title is required.").max(120),
  releaseNotesMarkdown: z.string().trim().min(50, "Release notes must contain at least 50 characters.").max(50_000),
});

export function launchPackageEditFromFormData(formData: FormData) {
  return {
    packageId: formData.get("packageId"),
    repositoryDescription: formData.get("repositoryDescription"),
    readmeMarkdown: formData.get("readmeMarkdown"),
    releaseTag: formData.get("releaseTag"),
    releaseTitle: formData.get("releaseTitle"),
    releaseNotesMarkdown: formData.get("releaseNotesMarkdown"),
  };
}
