const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("istoriya", {
  storage: Object.fromEntries(["getItem", "setItem", "removeItem"].map((method) => [method, (...args) => {
    const result = ipcRenderer.sendSync("storage:call", method, ...args);
    if (result.error) throw new Error(result.error);
    return result.value;
  }])),
  importFile: (file) => ipcRenderer.invoke("resource:import", webUtils.getPathForFile(file)),
  chooseProjectFolder: () => ipcRenderer.invoke("project:folder"),
  createProjectOnDisk: (project) => ipcRenderer.invoke("project:create-on-disk", project),
  openProject: () => ipcRenderer.invoke("project:open"),
  platform: process.platform,
  buildTargets: ["windows", "linux", "macos", "android"],
  buildGame: (project, platform) => ipcRenderer.invoke("game:build", { project, platform }),
  runPreview: (project, sceneId, actionId) => ipcRenderer.invoke("game:preview", { project, sceneId, actionId }),
  saveProject: (project) => ipcRenderer.invoke("project:save", project),
});
