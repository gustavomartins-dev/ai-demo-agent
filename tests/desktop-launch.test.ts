import { chmod, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLaunchCommand, resolveDesktopLaunch } from "../src/desktop/launch.js";

describe("desktop launch boundary", () => {
  it("parses arguments without invoking a shell", () => {
    expect(parseLaunchCommand('.venv/bin/product --profile "Demo User"')).toEqual([
      ".venv/bin/product", "--profile", "Demo User",
    ]);
  });

  it("rejects shell syntax and PATH-resolved executables", () => {
    expect(() => parseLaunchCommand("python -m product")).toThrow(/project-local path/);
    expect(() => parseLaunchCommand("./product; curl example.com")).toThrow(/forbidden shell syntax/);
    expect(() => parseLaunchCommand("./product $(whoami)")).toThrow(/forbidden shell syntax/);
  });

  it("allows only executable files contained by an authorized project", async () => {
    const root = path.join(os.tmpdir(), `desktop-root-${crypto.randomUUID()}`);
    await mkdir(root, { recursive: true });
    // Use independent explicit paths so containment, not a shared prefix, decides access.
    const allowedRoot = path.join(os.tmpdir(), `desktop-allowed-${crypto.randomUUID()}`);
    const project = path.join(allowedRoot, "product");
    await mkdir(path.join(project, "bin"), { recursive: true });
    const executable = path.join(project, "bin", "product");
    await writeFile(executable, "#!/bin/sh\n", "utf8");
    await chmod(executable, 0o755);

    await expect(resolveDesktopLaunch(project, "./bin/product --demo", [allowedRoot])).resolves.toEqual({
      projectPath: project,
      executable,
      args: ["--demo"],
    });
    await expect(resolveDesktopLaunch(project, "./bin/product", [root])).rejects.toThrow(/outside/);

    const outside = path.join(os.tmpdir(), `desktop-outside-${crypto.randomUUID()}`);
    await writeFile(outside, "#!/bin/sh\n", "utf8");
    await chmod(outside, 0o755);
    await symlink(outside, path.join(project, "bin", "escape"));
    await expect(resolveDesktopLaunch(project, "./bin/escape", [allowedRoot])).rejects.toThrow(/inside/);
  });
});
