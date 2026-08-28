import { Command } from "commander";
import { HermesClient } from "./hermes/client.js";
import { loadHermesConfig } from "./hermes/config.js";
import { planDemo } from "./planner.js";

const program = new Command()
  .name("ai-demo-agent plan")
  .description("Gera um plano de demonstração validado usando o Hermes Agent")
  .requiredOption("--url <url>", "URL autorizada do produto")
  .requiredOption("--objective <text>", "objetivo da demonstração")
  .option("--repo <directory>", "repositório usado como contexto", ".")
  .option("-o, --output <directory>", "diretório dos planos", "output")
  .parse();

const options = program.opts<{
  url: string;
  objective: string;
  repo: string;
  output: string;
}>();

console.log("Analisando o produto com o Hermes Agent...");

const client = new HermesClient(loadHermesConfig());
const planPath = await planDemo({
  url: options.url,
  objective: options.objective,
  repositoryPath: options.repo,
  outputRoot: options.output
}, client);

console.log(`\nPlano criado em: ${planPath}`);
console.log("A gravação ainda não foi iniciada. Revise e aprove o plano primeiro.");
