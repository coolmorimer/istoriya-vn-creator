import path from "node:path";
import { defaultProject } from "../src/data/defaultProject.js";
import { compileProject } from "../runtime/compiler.mjs";

const destination = path.resolve(".artifacts", "demo-renpy");
const result = await compileProject(structuredClone(defaultProject), destination, {
  sdkPath: path.resolve("..", "renpy-8.5.3-sdk"),
  assetsRoot: path.resolve("public"),
});
console.log(JSON.stringify(result, null, 2));
