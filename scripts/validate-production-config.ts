import { ZodError } from "zod";
import { validateProductionEnvironment } from "../apps/web/src/lib/production-config.js";

try {
  validateProductionEnvironment();
  console.log("Production configuration is valid.");
} catch (error) {
  if (error instanceof ZodError) {
    for (const issue of error.issues) console.error(`${issue.path.join(".")}: ${issue.message}`);
  } else {
    console.error(error instanceof Error ? error.message : "Production configuration is invalid.");
  }
  process.exitCode = 1;
}
