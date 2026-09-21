import path from "node:path";
import { BUILD_TARGETS, buildGame } from "../runtime/builder.mjs";
import { defaultProject } from "../src/data/defaultProject.js";

const platform = process.argv[2] || "windows";
if (!BUILD_TARGETS[platform]) {
  throw new Error(`Неизвестная платформа: ${platform}. Доступно: ${Object.keys(BUILD_TARGETS).join(", ")}.`);
}

const project = structuredClone(defaultProject);
if (platform === "android" && process.argv[3] === "aab") project.meta.android.buildFormat = "aab";

const result = await buildGame(project, platform, {
  sdkPath: path.resolve("..", "renpy-8.5.3-sdk"),
  assetsRoot: path.resolve("public"),
  outputDir: path.resolve(".artifacts", `dist-${platform}`),
  workDir: path.resolve(".artifacts", `demo-renpy-${platform}`),
  androidKeyDir: path.resolve(".artifacts", "android-keys", defaultProject.id),
  onProgress: (message) => {
    if (/Проверяем|Собираем|BUILD SUCCESSFUL|build seems to have succeeded|Copying Android files/.test(message)) process.stdout.write(message);
  },
});

console.log(JSON.stringify(result, null, 2));
