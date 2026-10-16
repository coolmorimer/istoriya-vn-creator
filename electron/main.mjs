import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_TARGETS, buildGame, runPreview } from "../runtime/builder.mjs";
import { atomicWrite, createDiskStorage, portableProject, writeFolderProject, readFolderProject } from "./project-storage.mjs";
import { safeProjectId } from '../runtime/project-path.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let mainWindow;
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
});
const storage = createDiskStorage(path.join(app.getPath("userData"), "projects"));
const locationsFile = path.join(app.getPath("userData"), "project-locations.json");
let locations = {};
try { locations = JSON.parse(fsSync.readFileSync(locationsFile, "utf8")); } catch {}
const chosenFolders = new Set();
ipcMain.on("storage:call", (event, method, key, value) => {
  try {
    if (!["getItem", "setItem", "removeItem"].includes(method)) throw new Error("Неизвестная операция");
    const result = storage[method](key, value);
    if (method === "setItem" && key === "istoriya-project-v2") {
      const project = JSON.parse(storage.getItem(key));
      if (locations[project.id]) writeFolderProject(project, locations[project.id], runtimePaths().assetsRoot);
    }
    event.returnValue = { value: result ?? null };
  } catch (error) { event.returnValue = { error: error.message }; }
});
ipcMain.handle("resource:import", (_event, file) => storage.importFile(file));
ipcMain.handle("project:folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: "Папка для нового проекта", properties: ["openDirectory", "createDirectory"] });
  if (result.canceled) return null;
  chosenFolders.add(result.filePaths[0]);
  return result.filePaths[0];
});
ipcMain.handle("project:create-on-disk", (_event, project) => {
  const folder = project.meta.projectFolder;
  if (!chosenFolders.has(folder)) throw new Error("Выберите папку проекта через кнопку выбора папки.");
  const destination = path.join(folder, safeProjectId(project), "project.vnproject");
  writeFolderProject(project, destination, runtimePaths().assetsRoot);
  locations[project.id] = destination;
  atomicWrite(locationsFile, JSON.stringify(locations));
  return destination;
});
ipcMain.handle("project:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: "Открыть проект", properties: ["openFile"], filters: [{ name: "Проект История", extensions: ["vnproject"] }] });
  if (result.canceled) return null;
  const project = readFolderProject(result.filePaths[0]);
  if (!project.id || !project.scenes || !project.meta) throw new Error("Это не файл проекта «История».");
  locations[project.id] = result.filePaths[0];
  atomicWrite(locationsFile, JSON.stringify(locations));
  return project;
});

function runtimePaths() {
  if (app.isPackaged) {
    return { sdkPath: path.join(process.resourcesPath, "renpy-sdk"), assetsRoot: path.join(process.resourcesPath, "public") };
  }
  return { sdkPath: path.resolve(appRoot, "..", "renpy-8.5.3-sdk"), assetsRoot: path.join(appRoot, "public") };
}

async function detectJavaHome() {
  const candidates = [process.env.JAVA_HOME];
  if (process.platform === "win32") {
    const adoptiumRoot = "C:\\Program Files\\Eclipse Adoptium";
    try {
      const entries = await fs.readdir(adoptiumRoot, { withFileTypes: true });
      candidates.push(...entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("jdk-21")).map((entry) => path.join(adoptiumRoot, entry.name)));
    } catch {
      // JDK can still be available through JAVA_HOME or PATH.
    }
  }
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await fs.access(path.join(candidate, "bin", process.platform === "win32" ? "keytool.exe" : "keytool"));
      return candidate;
    } catch {
      // Try the next known location.
    }
  }
  return null;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1180,
    minHeight: 760,
    title: "История",
    backgroundColor: "#090d18",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(appRoot, "electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  window.on("closed", () => { mainWindow = null; });
  window.webContents.on("console-message", (details) => {
    if (["error", "warning"].includes(details.level)) {
      fs.appendFile(path.join(app.getPath("userData"), "renderer.log"), `${new Date().toISOString()} ${details.level}: ${details.message}\n`).catch(() => {});
    }
  });
  window.webContents.on("did-fail-load", (_event, code, description) => {
    dialog.showErrorBox("Не удалось открыть редактор", `${description} (${code})`);
  });
  const devUrl = process.env.ISTORIYA_DEV_URL;
  if (devUrl) window.loadURL(devUrl);
  else window.loadFile(path.join(appRoot, "dist", "client", "index.html"));
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    // This is a local SPA. No document navigation should inherit the preload bridge.
    event.preventDefault();
  });
}

ipcMain.handle("project:save", async (_event, project) => {
  const result = await dialog.showSaveDialog({
    title: "Сохранить проект",
    defaultPath: `${project.meta.title.replace(/[\\/:*?\"<>|]+/g, "-")}.vnproject`,
    filters: [{ name: "Проект История", extensions: ["vnproject"] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  atomicWrite(result.filePath, JSON.stringify(portableProject(project, runtimePaths().assetsRoot), null, 2));
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle("game:build", async (_event, { project, platform }) => {
  const target = BUILD_TARGETS[platform];
  if (!target) throw new Error("Эта платформа пока не поддерживается установленным модулем сборки.");
  const selection = await dialog.showOpenDialog({ title: `Выберите папку для сборки ${target.label}`, properties: ["openDirectory", "createDirectory"] });
  if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const workDir = path.join(app.getPath("userData"), "build-work", `${safeProjectId(project)}-${platform}-${stamp}`);
  const androidKeyDir = path.join(app.getPath("userData"), "android-keys", safeProjectId(project));
  const javaHome = platform === "android" ? await detectJavaHome() : null;
  const result = await buildGame(project, platform, { ...runtimePaths(), outputDir: selection.filePaths[0], workDir, androidKeyDir, javaHome });
  return { canceled: false, ...result };
});

ipcMain.handle("game:preview", async (_event, { project, sceneId, actionId }) => {
  const workDir = path.join(app.getPath("userData"), "preview-work", `${safeProjectId(project)}-${Date.now()}`);
  return runPreview(project, { ...runtimePaths(), workDir, startSceneId: sceneId, startActionId: actionId });
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
