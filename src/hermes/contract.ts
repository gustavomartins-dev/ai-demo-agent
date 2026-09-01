import { z } from "zod";
import { demoSchema } from "../schema.js";

export const hermesPlanningRequestSchema = z.object({
  kind: z.enum(["WEB", "DESKTOP"]).default("WEB"),
  url: z.string().url(),
  objective: z.string().min(1),
  desktop: z.object({
    projectPath: z.string().min(1),
    launchCommand: z.string().min(1),
  }).optional(),
  repository: z.object({
    url: z.string().url().optional(),
    path: z.string().min(1).optional(),
    readme: z.string().min(1).optional()
  }).refine((repository) => repository.url || repository.path || repository.readme, {
    message: "Repository context must contain a URL, path, or README"
}).optional()
}).superRefine((request, context) => {
  if (request.kind === "DESKTOP" && !request.desktop) {
    context.addIssue({ code: "custom", path: ["desktop"], message: "Desktop configuration is required" });
  }
});

export const hermesDemoPlanSchema = z.object({
  objective: z.string().min(1),
  summary: z.string().min(1),
  assumptions: z.array(z.string().min(1)).default([]),
  warnings: z.array(z.string().min(1)).default([]),
  demo: demoSchema
});

export type HermesPlanningRequest = z.input<typeof hermesPlanningRequestSchema>;
export type HermesDemoPlan = z.infer<typeof hermesDemoPlanSchema>;
