import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import { assertProjectShape } from '../runtime/project-format.mjs';
import { ASSET_FIELDS } from '../runtime/asset-fields.mjs';

export function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.pending`;
  const descriptor = fs.openSync(temporary, 'w');
  try { fs.writeFileSync(descriptor, content, 'utf8'); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  if (fs.existsSync(file)) {
    // Do not replace a healthy backup with malformed JSON after a failed read.
    const previous = fs.readFileSync(file, 'utf8');
    try { JSON.parse(previous); fs.copyFileSync(file, `${file}.bak`); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  fs.renameSync(temporary, file);
}

export function createDiskStorage(root) {
  const assetDir = path.join(root, "assets");
  const allowedKeys = new Set(["istoriya-project-v2", "istoriya-project-library-v1", "istoriya-project-recovery-v1"]);
  const itemPath = (key) => {
    if (!allowedKeys.has(key)) throw new Error("Неизвестное хранилище проекта");
    return path.join(root, `${key}.json`);
  };
  const externalize = (value, field) => {
    if (ASSET_FIELDS.has(field) && typeof value === "string" && /^data:[^;,]+(?:;charset=[^;,]+)?;base64,/.test(value)) {
      const [, mime, encoded] = value.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.*)$/s);
      const bytes = Buffer.from(encoded, "base64");
      const suffix = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "video/mp4": "mp4", "font/ttf": "ttf", "font/otf": "otf" })[mime] ?? "bin";
      fs.mkdirSync(assetDir, { recursive: true });
      const file = path.join(assetDir, `${createHash("sha256").update(bytes).digest("hex")}.${suffix}`);
      if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
      return pathToFileURL(file).href;
    }
    if (Array.isArray(value)) return value.map(externalize);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, externalize(child, key)]));
    return value;
  };
  return {
    getItem(key) {
      const file = itemPath(key);
      if (!fs.existsSync(file) && !fs.existsSync(`${file}.bak`)) return null;
      try { const raw = fs.readFileSync(file, 'utf8'); JSON.parse(raw); return raw; }
      catch {
        try { const raw = fs.readFileSync(`${file}.bak`, 'utf8'); JSON.parse(raw); return raw; }
        catch { throw new Error(`Не удалось прочитать ${key}.json и резервную копию. Файлы оставлены без изменений.`); }
      }
    },
    setItem(key, value) { atomicWrite(itemPath(key), JSON.stringify(externalize(JSON.parse(value)))); },
    removeItem(key) { const file = itemPath(key); for (const target of [file, `${file}.bak`]) if (fs.existsSync(target)) fs.unlinkSync(target); },
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
  const convert = (value, field) => {
    if (ASSET_FIELDS.has(field) && typeof value === "string" && (value.startsWith("file:") || /^\.?\/assets\//.test(value))) {
      const file = value.startsWith("file:") ? fileURLToPath(value) : path.join(assetsRoot, value.replace(/^\.?\//, ""));
      const ext = path.extname(file).slice(1).toLowerCase();
      const mime = ({png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",svg:"image/svg+xml",mp3:"audio/mpeg",ogg:"audio/ogg",wav:"audio/wav",ttf:"font/ttf",otf:"font/otf",mp4:"video/mp4"})[ext] ?? "application/octet-stream";
      return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
    }
    if (Array.isArray(value)) return value.map(convert);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, convert(child, key)]));
    return value;
  };
  return convert(project);
}

export function writeFolderProject(project, file, assetsRoot) {
  const root = path.dirname(file);
  const disk = createDiskStorage(root);
  const copy = (value, field) => {
    if (ASSET_FIELDS.has(field) && typeof value === "string") {
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
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child, key)]));
    return value;
  };
  atomicWrite(file, JSON.stringify(copy(project), null, 2));
}

export function readFolderProject(file) {
  const project = JSON.parse(fs.readFileSync(file, "utf8"));
  assertProjectShape(project);
  const root = path.dirname(file);
  const resolveAssets = (value, field) => {
    if (ASSET_FIELDS.has(field) && typeof value === "string" && /^\.\/assets\//.test(value)) {
      const resolved = path.resolve(root, value);
      if (!resolved.startsWith(path.join(root, "assets") + path.sep)) throw new Error("Недопустимый путь ресурса");
      return pathToFileURL(resolved).href;
    }
    if (Array.isArray(value)) return value.map(resolveAssets);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolveAssets(child, key)]));
    return value;
  };
  return resolveAssets(project);
}
