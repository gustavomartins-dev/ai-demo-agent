import { z } from "zod";

export const projectInputSchema = z.object({
  name: z.string().trim().min(2, "Project name must have at least 2 characters.").max(80),
  productUrl: z.url("Enter a valid product URL."),
  repositoryUrl: z.union([z.literal(""), z.url("Enter a valid repository URL.")]),
  objective: z.string().trim().min(10, "Describe the launch objective in at least 10 characters.").max(500),
  isOpenSource: z.boolean(),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

export function projectInputFromFormData(formData: FormData): unknown {
  return {
    name: formData.get("name"),
    productUrl: formData.get("productUrl"),
    repositoryUrl: formData.get("repositoryUrl"),
    objective: formData.get("objective"),
    isOpenSource: formData.get("isOpenSource") === "on",
  };
}
