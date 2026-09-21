import path from "node:path";
import { defaultProject } from "../src/data/defaultProject.js";
import { buildWindowsGame } from "../runtime/builder.mjs";

const result = await buildWindowsGame(structuredClone(defaultProject), {
  sdkPath: path.resolve("..", "renpy-8.5.3-sdk"),
  assetsRoot: path.resolve("public"),
  workDir: path.resolve(".artifacts", "demo-renpy-win"),
  outputDir: path.resolve(".artifacts", "dist-win-named"),
});
console.log(JSON.stringify(result, null, 2));
