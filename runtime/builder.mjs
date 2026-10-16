import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { compileProject } from "./compiler.mjs";
import {runtimeException} from './runtime-verification.mjs';

export const BUILD_TARGETS = {
  windows: { kind: "desktop", packageName: "win", fileSuffix: "-win.zip", label: "Windows x64" },
  linux: { kind: "desktop", packageName: "linux", fileSuffix: "-linux.tar.bz2", label: "Linux x64" },
  macos: { kind: "desktop", packageName: "mac", fileSuffix: "-mac.zip", label: "macOS Universal" },
  android: { kind: "android", label: "Android", extensions: [".apk", ".aab"] },
};

function runProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); options.onProgress?.(chunk.toString()); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); options.onProgress?.(chunk.toString()); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && !runtimeException(stdout+stderr)) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `Процесс завершился с кодом ${code}.`));
    });
  });
}

async function newestPackage(root, extensions) {
  const candidates = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (extensions.some((extension) => entry.name.toLowerCase().endsWith(extension))) {
        candidates.push({ packagePath: entryPath, stat: await fs.stat(entryPath) });
      }
    }
  }
  await visit(root);
  candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return candidates[0] ?? null;
}

async function ensureAndroidKeys(keyDir, options = {}) {
  if (!keyDir) throw new Error("Не задана безопасная папка для ключа подписи Android.");
  const resolvedKeyDir = path.resolve(keyDir);
  const androidKey = path.join(resolvedKeyDir, "android.keystore");
  const bundleKey = path.join(resolvedKeyDir, "bundle.keystore");
  await fs.mkdir(resolvedKeyDir, { recursive: true });
  let generatedKey = false;
  try {
    await fs.access(androidKey);
  } catch {
    options.onProgress?.("Создаём постоянный ключ подписи Android…\n");
    const keytool = options.javaHome
      ? path.join(path.resolve(options.javaHome), "bin", process.platform === "win32" ? "keytool.exe" : "keytool")
      : process.platform === "win32" ? "keytool.exe" : "keytool";
    try {
      await runProcess(keytool, [
        "-genkeypair", "-keystore", androidKey,
        "-alias", "android", "-keyalg", "RSA", "-keysize", "2048",
        "-validity", "20000", "-storepass", "android", "-keypass", "android",
        "-dname", "CN=Istoriya, OU=Creator, O=Istoriya, L=Moscow, ST=Moscow, C=RU",
        "-noprompt",
      ], { env: options.javaHome ? { JAVA_HOME: path.resolve(options.javaHome) } : undefined, onProgress: options.onProgress });
      generatedKey = true;
    } catch (error) {
      throw new Error(`Не удалось создать ключ подписи Android. Проверьте установку JDK 21. ${error.message}`);
    }
  }
  try {
    await fs.access(bundleKey);
  } catch {
    await fs.copyFile(androidKey, bundleKey);
  }
  return { androidKey, bundleKey, keyDir: resolvedKeyDir, generatedKey };
}

async function buildAndroidGame(project, options, runtime) {
  const android = project.meta.android ?? {};
  const extension = android.buildFormat === "aab" ? ".aab" : ".apk";
  const raptPath = path.join(runtime.sdkPath, "rapt");
  await fs.access(raptPath).catch(() => {
    throw new Error("Модуль Android (RAPT) не найден. Переустановите приложение «История» с Android-компонентами.");
  });

  const keyInfo = await ensureAndroidKeys(options.androidKeyDir, options);
  await Promise.all([
    fs.copyFile(keyInfo.androidKey, path.join(runtime.workDir, "android.keystore")),
    fs.copyFile(keyInfo.bundleKey, path.join(runtime.workDir, "bundle.keystore")),
  ]);

  options.onProgress?.("Проверяем проект…\n");
  await runProcess(runtime.python, [runtime.renpyEntrypoint, runtime.workDir, "lint"], {
    cwd: runtime.sdkPath,
    env: options.javaHome ? { JAVA_HOME: path.resolve(options.javaHome) } : undefined,
    onProgress: options.onProgress,
  });
  options.onProgress?.(`Собираем ${extension === ".aab" ? "Android App Bundle" : "Android APK"}…\n`);
  const args = [runtime.renpyEntrypoint, "launcher", "android_build", runtime.workDir, "--destination", runtime.outputDir];
  if (extension === ".aab") args.push("--bundle");
  await runProcess(runtime.python, args, {
    cwd: runtime.sdkPath,
    env: options.javaHome ? { JAVA_HOME: path.resolve(options.javaHome) } : undefined,
    onProgress: options.onProgress,
  });

  const built = await newestPackage(runtime.outputDir, [extension]);
  if (!built) throw new Error(`Ren’Py завершил работу, но файл ${extension.toUpperCase()} не найден.`);
  return {
    platform: "android",
    packagePath: built.packagePath,
    size: built.stat.size,
    projectDir: runtime.workDir,
    keyDir: keyInfo.keyDir,
    generatedKey: keyInfo.generatedKey,
  };
}

export async function buildGame(project, platform, options) {
  const target = BUILD_TARGETS[platform];
  if (!target) throw new Error("Эта платформа пока не поддерживается установленным модулем сборки.");
  const sdkPath = path.resolve(options.sdkPath);
  const outputDir = path.resolve(options.outputDir);
  const workDir = path.resolve(options.workDir);
  const python = path.join(sdkPath, "lib", "py3-windows-x86_64", "python.exe");
  const renpyEntrypoint = path.join(sdkPath, "renpy.py");
  await Promise.all([fs.access(python), fs.access(renpyEntrypoint)]).catch(() => {
    throw new Error("Компонент сборки Ren’Py не найден. Переустановите приложение «История».");
  });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(workDir, { recursive: true });
  await compileProject(project, workDir, { sdkPath, assetsRoot: options.assetsRoot });

  if (target.kind === "android") {
    return buildAndroidGame(project, options, { sdkPath, outputDir, workDir, python, renpyEntrypoint });
  }

  options.onProgress?.("Проверяем проект…\n");
  await runProcess(python, [renpyEntrypoint, workDir, "lint"], { cwd: sdkPath, onProgress: options.onProgress });
  options.onProgress?.(`Собираем игру для ${target.label}…\n`);
  await runProcess(python, [renpyEntrypoint, "launcher", "distribute", workDir, "--destination", outputDir, "--package", target.packageName, "--no-update"], { cwd: sdkPath, onProgress: options.onProgress });

  const packages = (await fs.readdir(outputDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(target.fileSuffix))
    .map((entry) => path.join(outputDir, entry.name));
  if (!packages.length) throw new Error(`Ren’Py завершил работу, но пакет для ${target.label} не найден.`);
  const withStats = await Promise.all(packages.map(async (packagePath) => ({ packagePath, stat: await fs.stat(packagePath) })));
  withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return { platform, packagePath: withStats[0].packagePath, size: withStats[0].stat.size, projectDir: workDir };
}

export async function runPreview(project, options) {
  const sdkPath = path.resolve(options.sdkPath);
  const workDir = path.resolve(options.workDir);
  const python = path.join(sdkPath, "lib", "py3-windows-x86_64", "python.exe");
  const renpyEntrypoint = path.join(sdkPath, "renpy.py");
  await Promise.all([fs.access(python), fs.access(renpyEntrypoint)]).catch(() => { throw new Error("Компонент предпросмотра Ren’Py не найден."); });
  await fs.mkdir(workDir, { recursive: true });
  await compileProject(project, workDir, { sdkPath, assetsRoot: options.assetsRoot, startSceneId: options.startSceneId, startActionId: options.startActionId });
  await runProcess(python, [renpyEntrypoint, workDir, "lint"], { cwd: sdkPath });
  const child = spawn(python, [renpyEntrypoint, workDir], { cwd: sdkPath, detached: true, windowsHide: false, stdio: "ignore", shell: false });
  child.unref();
  return { projectDir: workDir, sceneId: options.startSceneId };
}

export function buildWindowsGame(project, options) {
  return buildGame(project, "windows", options);
}

export const builderInternals = { runProcess };
