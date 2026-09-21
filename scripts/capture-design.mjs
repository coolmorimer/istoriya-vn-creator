import { app, BrowserWindow, session } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("design");

app.whenReady().then(async () => {
  await session.defaultSession.clearStorageData();
  const window = new BrowserWindow({ show: false, width: 1440, height: 1024, webPreferences: { contextIsolation: true } });
  await window.loadURL("http://127.0.0.1:4173/");
  await new Promise((resolve) => setTimeout(resolve, 700));
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "implementation-home.png"), (await window.capturePage()).toPNG());
  await window.webContents.executeJavaScript("document.querySelector('.project-card')?.click()");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await window.webContents.executeJavaScript("[...document.querySelectorAll('.sidebar-scene')].find((node) => node.textContent.includes('Первая встреча'))?.click()");
  await new Promise((resolve) => setTimeout(resolve, 300));
  await fs.writeFile(path.join(outputDir, "implementation-editor.png"), (await window.capturePage()).toPNG());
  window.destroy();
  app.quit();
});
