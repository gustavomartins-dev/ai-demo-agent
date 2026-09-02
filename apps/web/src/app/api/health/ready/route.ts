import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

import { db } from "@/lib/db";
import { validateOAuthOrigins } from "@/lib/production-config";

export async function GET() {
  try {
    await Promise.all([
      db.$queryRaw`SELECT 1`,
      access(path.resolve(/* turbopackIgnore: true */ process.env.AI_DEMO_OUTPUT_ROOT ?? "output"), constants.R_OK | constants.W_OK),
    ]);
    validateOAuthOrigins();
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "not_ready" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
