import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import path from "node:path";

export type DesktopLaunch = {
  projectPath: string;
  executable: string;
  args: string[];
};

function inside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function parseLaunchCommand(command: string): string[] {
  const value = command.trim();
  if (!value) throw new Error("Desktop launch command is required");
  if (/[\r\n;&|<>`$]/.test(value)) throw new Error("Desktop launch command contains forbidden shell syntax");

  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      token += character;
      escaped = false;
    } else if (character === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = null;
      else token += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
    } else {
      token += character;
    }
  }
  if (escaped || quote) throw new Error("Desktop launch command has incomplete quoting");
  if (token) tokens.push(token);
  if (!tokens.length) throw new Error("Desktop launch command is required");
  if (!tokens[0]?.includes(path.sep)) throw new Error("Desktop executable must be a project-local path");
  return tokens;
}

export async function resolveDesktopLaunch(
  projectPath: string,
  command: string,
  allowedRoots: string[],
): Promise<DesktopLaunch> {
  if (!path.isAbsolute(projectPath)) throw new Error("Desktop project path must be absolute");
  if (!allowedRoots.length) throw new Error("AI_DEMO_DESKTOP_PROJECT_ROOTS is required for desktop execution");

  const resolvedProject = await realpath(projectPath);
  const roots = await Promise.all(allowedRoots.map((root) => realpath(path.resolve(root))));
  if (!roots.some((root) => inside(root, resolvedProject))) {
    throw new Error("Desktop project path is outside AI_DEMO_DESKTOP_PROJECT_ROOTS");
  }

  const [program, ...args] = parseLaunchCommand(command);
  if (!program) throw new Error("Desktop launch command is required");
  const candidate = path.isAbsolute(program) ? program : path.resolve(resolvedProject, program);
  const executable = await realpath(candidate);
  if (!inside(resolvedProject, executable)) throw new Error("Desktop executable must resolve inside the project path");
  await access(executable, constants.X_OK);
  return { projectPath: resolvedProject, executable, args };
}

export function desktopProjectRoots(environment: NodeJS.ProcessEnv = process.env): string[] {
  return (environment.AI_DEMO_DESKTOP_PROJECT_ROOTS ?? "")
    .split(path.delimiter)
    .map((root) => root.trim())
    .filter(Boolean);
}
