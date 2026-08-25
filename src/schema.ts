import { z } from "zod";

const locatorSchema = z.object({
  role: z.string().optional(),
  name: z.string().optional(),
  text: z.string().optional(),
  testId: z.string().optional(),
  css: z.string().optional()
}).refine((value) => Object.values(value).some(Boolean), {
  message: "Informe role/name, text, testId ou css"
});

const stepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("goto"), url: z.string().url(), title: z.string().optional() }),
  z.object({ action: z.literal("click"), target: locatorSchema, title: z.string().optional() }),
  z.object({ action: z.literal("fill"), target: locatorSchema, value: z.string(), title: z.string().optional() }),
  z.object({ action: z.literal("press"), target: locatorSchema, key: z.string(), title: z.string().optional() }),
  z.object({ action: z.literal("wait"), milliseconds: z.number().int().min(0).max(10_000), title: z.string().optional() }),
  z.object({ action: z.literal("assertVisible"), target: locatorSchema, title: z.string().optional() })
]);

export const demoSchema = z.object({
  name: z.string().min(1),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() })
    .default({ width: 1280, height: 720 }),
  steps: z.array(stepSchema).min(1)
});

export type Demo = z.infer<typeof demoSchema>;
export type DemoStep = Demo["steps"][number];
export type DemoTarget = Extract<DemoStep, { target: unknown }>["target"];
