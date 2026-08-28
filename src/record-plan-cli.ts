import { Command } from "commander";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  executeApprovedPlan,
  formatDemoPlan,
  isExplicitApproval,
  loadDemoPlan
} from "./approval.js";
import { runDemo } from "./runner.js";

const program = new Command()
  .name("ai-demo-agent record-plan")
  .description("Revisa e grava um plano aprovado")
  .argument("<plan>", "arquivo demo-plan.json")
  .option("--yes", "aprova explicitamente sem pergunta interativa", false)
  .option("-o, --output <directory>", "diretório dos vídeos")
  .parse();

const planPath = path.resolve(program.args[0] as string);
const options = program.opts<{ yes: boolean; output?: string }>();
const plan = await loadDemoPlan(planPath);

console.log(`\n${formatDemoPlan(plan)}\n`);

let approved = options.yes;
if (!approved) {
  const terminal = createInterface({ input, output });
  try {
    approved = isExplicitApproval(await terminal.question("Aprovar e iniciar a gravação? [s/N] "));
  } finally {
    terminal.close();
  }
}

const result = await executeApprovedPlan(plan, approved, runDemo, options.output);
if (result.status === "cancelled") {
  console.log("Gravação cancelada. Nenhuma ação foi executada no navegador.");
} else {
  console.log(`\nVídeo criado em: ${result.videoPath}`);
}
