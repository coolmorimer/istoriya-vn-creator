import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileProject } from "./compiler.mjs";

const [, , projectFile, destinationArg] = process.argv;
if (!projectFile || !destinationArg) {
  console.error("Использование: node runtime/cli.mjs <project.vnproject> <папка назначения>");
  process.exit(2);
}

const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(runtimeDir, "..");
const project = JSON.parse(await fs.readFile(path.resolve(projectFile), "utf8"));
const result = await compileProject(project, path.resolve(destinationArg), {
  sdkPath: path.resolve(rootDir, "..", "renpy-8.5.3-sdk"),
  assetsRoot: path.join(rootDir, "public"),
});
console.log(JSON.stringify(result, null, 2));
