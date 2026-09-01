import { z } from "zod";

export const projectInputSchema = z.object({
  name: z.string().trim().min(2, "Project name must have at least 2 characters.").max(80),
  kind: z.enum(["WEB", "DESKTOP"]),
  productUrl: z.url("Enter a valid product URL."),
  repositoryUrl: z.union([z.literal(""), z.url("Enter a valid repository URL.")]),
  localPath: z.string().trim(),
  launchCommand: z.string().trim(),
  objective: z.string().trim().min(10, "Describe the launch objective in at least 10 characters.").max(500),
  isOpenSource: z.boolean(),
}).superRefine((input, context) => {
  if (input.kind !== "DESKTOP") return;
  if (!input.localPath.startsWith("/")) {
    context.addIssue({ code: "custom", path: ["localPath"], message: "Desktop project path must be absolute." });
  }
  if (!input.launchCommand) {
    context.addIssue({ code: "custom", path: ["launchCommand"], message: "Desktop launch command is required." });
  }
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

export function projectInputFromFormData(formData: FormData): unknown {
  return {
    name: formData.get("name"),
    kind: formData.get("kind"),
    productUrl: formData.get("productUrl"),
    repositoryUrl: formData.get("repositoryUrl"),
    localPath: formData.get("localPath"),
    launchCommand: formData.get("launchCommand"),
    objective: formData.get("objective"),
    isOpenSource: formData.get("isOpenSource") === "on",
  };
}
