import { z } from "zod";

export const socialDraftEditSchema = z.discriminatedUnion("platform", [
  z.object({
    draftId: z.string().trim().min(1),
    platform: z.literal("X"),
    content: z.string().trim().min(1, "The X draft cannot be empty.").max(280, "The X draft must stay within 280 characters."),
  }),
  z.object({
    draftId: z.string().trim().min(1),
    platform: z.literal("LINKEDIN"),
    content: z.string().trim().min(1, "The LinkedIn draft cannot be empty.").max(3_000, "The LinkedIn draft must stay within 3,000 characters."),
  }),
]);

export function socialDraftEditFromFormData(formData: FormData) {
  return {
    draftId: formData.get("draftId"),
    platform: formData.get("platform"),
    content: formData.get("content"),
  };
}
