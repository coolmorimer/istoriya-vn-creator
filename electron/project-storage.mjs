import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";

export function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.pending`;
  fs.writeFileSync(temporary, content, "utf8");
  fs.renameSync(temporary, file);
}

export function createDiskStorage(root) {
  const assetDir = path.join(root, "assets");
  const allowedKeys = new Set(["istoriya-project-v2", "istoriya-project-library-v1", "istoriya-project-recovery-v1"]);
  const itemPath = (key) => {
    if (!allowedKeys.has(key)) throw new Error("Неизвестное хранилище проекта");
    return path.join(root, `${key}.json`);
  };
  const externalize = (value) => {
    if (typeof value === "string" && /^data:[^;,]+(?:;charset=[^;,]+)?;base64,/.test(value)) {
      const [, mime, encoded] = value.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.*)$/s);
      const bytes = Buffer.from(encoded, "base64");
      const suffix = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "video/mp4": "mp4", "font/ttf": "ttf", "font/otf": "otf" })[mime] ?? "bin";
      fs.mkdirSync(assetDir, { recursive: true });
      const file = path.join(assetDir, `${createHash("sha256").update(bytes).digest("hex")}.${suffix}`);
      if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
      return pathToFileURL(file).href;
    }
    if (Array.isArray(value)) return value.map(externalize);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, externalize(child)]));
    return value;
  };
  return {
    getItem(key) { const file = itemPath(key); return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null; },
    setItem(key, value) { atomicWrite(itemPath(key), JSON.stringify(externalize(JSON.parse(value)))); },
    removeItem(key) { const file = itemPath(key); if (fs.existsSync(file)) fs.unlinkSync(file); },
    importFile(file) {
      const bytes = fs.readFileSync(file);
      const ext = path.extname(file).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
      fs.mkdirSync(assetDir, { recursive: true });
      const dest = path.join(assetDir, `${createHash("sha256").update(bytes).digest("hex")}${ext}`);
      if (!fs.existsSync(dest)) fs.writeFileSync(dest, bytes);
      return pathToFileURL(dest).href;
    },
  };
}

export function portableProject(project, assetsRoot) {
  const convert = (value) => {
    if (typeof value === "string" && (value.startsWith("file:") || /^\.?\/assets\//.test(value))) {
      const file = value.startsWith("file:") ? fileURLToPath(value) : path.join(assetsRoot, value.replace(/^\.?\//, ""));
      const ext = path.extname(file).slice(1).toLowerCase();
      const mime = ({png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",svg:"image/svg+xml",mp3:"audio/mpeg",ogg:"audio/ogg",wav:"audio/wav",ttf:"font/ttf",otf:"font/otf",mp4:"video/mp4"})[ext] ?? "application/octet-stream";
      return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
    }
    if (Array.isArray(value)) return value.map(convert);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, convert(child)]));
    return value;
  };
  return convert(project);
}

export function writeFolderProject(project, file, assetsRoot) {
  const root = path.dirname(file);
  const disk = createDiskStorage(root);
  const copy = (value) => {
    if (typeof value === "string") {
      if (value.startsWith("file:")) return `./assets/${path.basename(fileURLToPath(disk.importFile(fileURLToPath(value))))}`;
      if (/^\.?\/assets\//.test(value)) return `./assets/${path.basename(fileURLToPath(disk.importFile(path.join(assetsRoot, value.replace(/^\.?\//, "")))))}`;
      if (value.startsWith("data:")) {
        disk.setItem("istoriya-project-recovery-v1", JSON.stringify({ source: value }));
        const source = JSON.parse(disk.getItem("istoriya-project-recovery-v1")).source;
        disk.removeItem("istoriya-project-recovery-v1");
        return source.startsWith("file:") ? `./assets/${path.basename(fileURLToPath(source))}` : source;
      }
    }
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]));
    return value;
  };
  atomicWrite(file, JSON.stringify(copy(project), null, 2));
}

export function readFolderProject(file) {
  const project = JSON.parse(fs.readFileSync(file, "utf8"));
  const root = path.dirname(file);
  const resolveAssets = (value) => {
    if (typeof value === "string" && /^\.\/assets\//.test(value)) {
      const resolved = path.resolve(root, value);
      if (!resolved.startsWith(path.join(root, "assets") + path.sep)) throw new Error("Недопустимый путь ресурса");
      return pathToFileURL(resolved).href;
    }
    if (Array.isArray(value)) return value.map(resolveAssets);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolveAssets(child)]));
    return value;
  };
  return resolveAssets(project);
}
