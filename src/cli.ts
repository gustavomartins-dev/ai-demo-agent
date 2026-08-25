import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { demoSchema } from "./schema.js";
import { runDemo } from "./runner.js";

const program = new Command()
  .name("ai-demo-agent")
  .description("Grava automaticamente um roteiro de demonstração no navegador")
  .argument("<scenario>", "arquivo .demo.json com o roteiro")
  .option("-o, --output <directory>", "diretório dos vídeos", "output")
  .parse();

const scenarioPath = program.args[0];
if (!scenarioPath) throw new Error("Informe o caminho do roteiro");

const raw = await readFile(scenarioPath, "utf8");
const demo = demoSchema.parse(JSON.parse(raw));
const videoPath = await runDemo(demo, program.opts<{ output: string }>().output);

console.log(`\nVídeo criado em: ${videoPath}`);
