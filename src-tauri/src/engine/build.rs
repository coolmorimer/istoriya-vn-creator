use super::{process, preview};
use serde_json::{json, Value};
use std::{ffi::OsStr, fs, io, path::{Path, PathBuf}, process::{Command, Stdio}, time::Duration};

const TOOL_TIMEOUT: Duration = Duration::from_secs(20 * 60);
const GUI_TIMEOUT: Duration = Duration::from_secs(90);

fn preview_save_environment(command: &mut Command, inherited: Option<&OsStr>) {
    // Preserve the old Ren'Py save-directory semantics, including an explicit
    // caller override. Compiler/generator staging saves must not leak here.
    if let Some(path) = inherited { command.env("RENPY_PATH_TO_SAVES", path); }
    else { command.env_remove("RENPY_PATH_TO_SAVES"); }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Target { Windows, Linux, Macos, Android }

impl Target {
    fn parse(value: &str) -> Result<Self, String> {
        match value { "windows" => Ok(Self::Windows), "linux" => Ok(Self::Linux),
            "macos" => Ok(Self::Macos), "android" => Ok(Self::Android),
            _ => Err("Неизвестная платформа сборки.".into()) }
    }
    fn package(self) -> &'static str { match self { Self::Windows => "win", Self::Linux => "linux", Self::Macos => "mac", Self::Android => "" } }
    fn suffix(self, bundle: bool) -> &'static str { match self {
        Self::Windows => "-win.zip", Self::Linux => "-linux.tar.bz2", Self::Macos => "-mac.zip",
        Self::Android if bundle => ".aab", Self::Android => ".apk",
    } }
}

struct Tools { runtime: PathBuf, root: PathBuf, sdk: PathBuf, python: PathBuf, entry: PathBuf }

impl Tools {
    fn new(runtime: &Path, root: &Path) -> Result<Self, String> {
        let sdk = runtime.join("renpy-sdk");
        let tools = Self { runtime: runtime.into(), root: root.into(), python: sdk.join("lib/py3-windows-x86_64/python.exe"), entry: sdk.join("renpy.py"), sdk };
        for file in [&tools.python, &tools.entry, &tools.runtime.join("node.exe"), &tools.runtime.join("runtime/native-worker.mjs")] {
            if !file.is_file() { return Err("Компонент сборки не найден. Переустановите приложение «История».".into()); }
        }
        fs::create_dir_all(tools.root.join("temp")).map_err(|e| e.to_string())?;
        Ok(tools)
    }
    fn environment(&self, command: &mut Command, saves: &Path) {
        command.current_dir(&self.sdk).env("TEMP", self.root.join("temp"))
            .env("TMP", self.root.join("temp")).env("RENPY_PATH_TO_SAVES", saves);
    }
    fn sdk_command(&self, saves: &Path) -> Command {
        let mut command = Command::new(&self.python);
        command.arg(&self.entry); self.environment(&mut command, saves); command
    }
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() { return Err("Генератор интерфейса вернул ссылку вместо файла.".into()); }
        let target = destination.join(entry.file_name());
        if kind.is_dir() { copy_tree(&entry.path(), &target)?; }
        else if kind.is_file() { fs::copy(entry.path(), target).map_err(|e| e.to_string())?; }
        else { return Err("Генератор интерфейса вернул неподдерживаемый файл.".into()); }
    }
    Ok(())
}

fn dimension(project: &Value, name: &str, default: u32) -> Result<u32, String> {
    let value = &project["meta"]["resolution"][name];
    if value.is_null() { return Ok(default); }
    let n = value.as_f64().or_else(|| value.as_str().and_then(|s| s.parse::<f64>().ok()))
        .ok_or("Некорректное разрешение игры.")?;
    if n == 0.0 { return Ok(default); }
    if !n.is_finite() || n < 1.0 || n > u32::MAX as f64 || n.fract() != 0.0 {
        return Err("Разрешение игры должно состоять из положительных целых чисел.".into());
    }
    Ok(n as u32)
}

fn prepare_gui(tools: &Tools, job: &Path, work: &Path, project: &Value) -> Result<Value, String> {
    let staging = job.join("gui-template"); let saves = job.join("generator-saves");
    fs::create_dir_all(staging.join("game")).map_err(|e| e.to_string())?;
    let mut command = tools.sdk_command(&saves);
    command.args([OsStr::new("launcher"), OsStr::new("generate_gui"), staging.as_os_str(),
        OsStr::new("--template"), tools.sdk.join("gui").as_os_str()])
        .arg("--width").arg(dimension(project, "width", 1920)?.to_string())
        .arg("--height").arg(dimension(project, "height", 1080)?.to_string()).arg("--start");
    process::run(&mut command, job, "Подготовка интерфейса", GUI_TIMEOUT)?;
    let mut images = tools.sdk_command(&saves); images.arg(&staging).arg("gui_images");
    process::run(&mut images, job, "Подготовка изображений интерфейса", GUI_TIMEOUT)?;
    let generated = staging.join("game");
    let gui = fs::read_to_string(generated.join("gui.rpy")).map_err(|_| "Генератор не создал gui.rpy.")?;
    let screens = fs::read_to_string(generated.join("screens.rpy")).map_err(|_| "Генератор не создал screens.rpy.")?;
    if gui.contains("gui7") || gui.contains("gui.scale(") || gui.is_empty() || screens.is_empty() {
        return Err("Генератор вернул служебный шаблон вместо игрового интерфейса.".into());
    }
    copy_tree(&generated.join("gui"), &work.join("game/gui"))?;
    Ok(json!({"gui":gui,"screens":screens}))
}

fn compile_sources(tools: &Tools, job: &Path, work: &Path, project: &Value, payload: &Value, gui: Value) -> Result<(), String> {
    let request = job.join("request.json"); let response = job.join("response.json");
    let mut options = json!({"sdkPath": tools.sdk, "assetsRoot": tools.runtime.join("public"), "preparedGui":gui});
    for key in ["startSceneId", "startActionId"] {
        let input = if key == "startSceneId" {"sceneId"} else {"actionId"};
        if let Some(value) = payload.get(input) { options[key] = value.clone(); }
    }
    fs::write(&request, serde_json::to_vec(&json!({"operation":"compile","project":project,"destination":work,"options":options})).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let mut command = Command::new(tools.runtime.join("node.exe"));
    tools.environment(&mut command, &job.join("compiler-saves"));
    command.current_dir(&tools.runtime).arg(tools.runtime.join("runtime/native-worker.mjs")).arg(&request).arg(&response);
    if let Err(error) = process::run(&mut command, job, "Генерация сценария", TOOL_TIMEOUT) {
        if let Ok(bytes) = fs::read(&response) {
            if let Ok(reply) = serde_json::from_slice::<Value>(&bytes) {
                if let Some(reason) = reply["error"].as_str() { return Err(format!("Генерация сценария: {reason}")); }
            }
        }
        return Err(error);
    }
    let raw = fs::read(&response).map_err(|_| "Компонент сценария не вернул результат.")?;
    let reply: Value = serde_json::from_slice(&raw).map_err(|_| "Компонент сценария вернул неверный ответ.")?;
    if let Some(error) = reply["error"].as_str() { return Err(error.into()); }
    if !reply["result"].is_object() || !work.join("game/script.rpy").is_file() {
        return Err("Компонент сценария не создал игру.".into());
    }
    Ok(())
}

fn package_candidates(root: &Path, suffix: &str, result: &mut Vec<PathBuf>, depth: usize) -> Result<(), String> {
    if depth > 16 || result.len() > 1000 { return Err("Неожиданная структура результатов сборки.".into()); }
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() { return Err("Пакет сборки содержит файловую ссылку.".into()); }
        if kind.is_dir() { package_candidates(&entry.path(), suffix, result, depth + 1)?; }
        else if kind.is_file() && entry.file_name().to_string_lossy().to_lowercase().ends_with(suffix) {
            if entry.metadata().map_err(|e| e.to_string())?.len() == 0 { return Err("Компонент сборки создал пустой пакет.".into()); }
            result.push(entry.path());
        }
    }
    Ok(())
}

/// Publish only a newly generated artifact, never a stale file already present
/// in the author's destination. Existing packages are never overwritten.
fn publish_package(source: &Path, destination: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(destination).map_err(|e| e.to_string())?;
    let mut staged = tempfile::NamedTempFile::new_in(destination).map_err(|e| e.to_string())?;
    let mut input = fs::File::open(source).map_err(|e| e.to_string())?;
    io::copy(&mut input, staged.as_file_mut()).map_err(|e| e.to_string())?;
    staged.as_file().sync_all().map_err(|e| e.to_string())?;
    let name = source.file_name().ok_or("Пакет не имеет имени.")?.to_string_lossy();
    let stem = source.file_stem().ok_or("Пакет не имеет имени.")?.to_string_lossy();
    let extension = source.extension().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    for index in 0..1000 {
        let target = destination.join(if index == 0 { name.to_string() }
            else if extension.is_empty() { format!("{stem} ({index})") }
            else { format!("{stem} ({index}).{extension}") });
        match staged.persist_noclobber(&target) {
            Ok(file) => { file.sync_all().map_err(|e| e.to_string())?; return Ok(target); }
            Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists => staged = error.file,
            Err(error) => return Err(format!("Не удалось сохранить готовую игру: {}", error.error)),
        }
    }
    Err("В папке уже слишком много одноимённых сборок. Выберите другую папку.".into())
}

fn android_keys(tools: &Tools, job: &Path, work: &Path, project: &Value) -> Result<(PathBuf, bool), String> {
    if !tools.sdk.join("rapt").is_dir() { return Err("Модуль Android (RAPT) не найден. Переустановите компоненты сборки.".into()); }
    let key_dir = tools.root.join("android-keys").join(crate::storage::safe_id(project));
    fs::create_dir_all(&key_dir).map_err(|e| e.to_string())?;
    // A project-scoped lock prevents two builds generating/replacing one key.
    let lock = fs::OpenOptions::new().read(true).write(true).create(true).truncate(false).open(key_dir.join("generating.lock"))
        .map_err(|_| "Не удалось открыть блокировку ключа Android.")?;
    lock.try_lock().map_err(|_| "Ключ Android занят другой сборкой. Дождитесь её завершения.")?;
    let key = key_dir.join("android.keystore"); let bundle = key_dir.join("bundle.keystore");
    let generated = !key.exists();
    if generated {
        // Generate in job staging, publish no-clobber: an interrupted keytool
        // can never leave a partial permanent signing key.
        let staging = job.join("android-key"); fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
        let candidate = staging.join("android.keystore");
        let java = std::env::var_os("JAVA_HOME").map(PathBuf::from);
        let mut command = Command::new(java.as_ref().map(|p| p.join("bin/keytool.exe")).unwrap_or_else(|| PathBuf::from("keytool.exe")));
        tools.environment(&mut command, &job.join("keytool-saves"));
        command.arg("-genkeypair").arg("-keystore").arg(&candidate).args(["-alias","android","-keyalg","RSA","-keysize","2048","-validity","20000",
            "-storepass","android","-keypass","android","-dname","CN=Istoriya, OU=Creator, O=Istoriya, L=Moscow, ST=Moscow, C=RU","-noprompt"]);
        process::run(&mut command, job, "Создание ключа Android: проверьте JDK 21", GUI_TIMEOUT)?;
        if fs::metadata(&candidate).map_err(|e| e.to_string())?.len() == 0 { return Err("Создан пустой ключ Android.".into()); }
        let saved = publish_package(&candidate, &key_dir)?;
        if saved != key { return Err("Ключ Android появился во время генерации. Существующий ключ не заменён.".into()); }
    }
    if !bundle.exists() {
        // Reuse the same stable signing identity, never generate a new bundle key.
        let staging = job.join("bundle-key"); fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
        let candidate = staging.join("bundle.keystore"); fs::copy(&key, &candidate).map_err(|e| e.to_string())?;
        let saved = publish_package(&candidate, &key_dir)?;
        if saved != bundle { return Err("Ключ App Bundle появился во время копирования. Повторите сборку.".into()); }
    }
    for file in [&key, &bundle] {
        if !file.is_file() || fs::metadata(file).map_err(|e| e.to_string())?.len() == 0 { return Err("Ключ Android повреждён или пуст. Восстановите резервную копию ключа.".into()); }
        fs::copy(file, work.join(file.file_name().unwrap())).map_err(|e| e.to_string())?;
    }
    Ok((key_dir, generated))
}

enum WorkJob { Build(tempfile::TempDir), Preview(preview::Lease) }
impl WorkJob {
    fn path(&self) -> PathBuf { match self { Self::Build(temp) => temp.path().into(), Self::Preview(lease) => lease.path() } }
}

pub fn execute(runtime: &Path, root: &Path, operation: &str, payload: &Value, output: &Path) -> Result<Value, String> {
    if !matches!(operation, "build" | "preview") { return Err("Неизвестная операция движка.".into()); }
    let project = &payload["project"]; crate::storage::validate(project)?;
    let target = Target::parse(payload["platform"].as_str().unwrap_or("windows"))?;
    let tools = Tools::new(dunce::simplified(runtime), dunce::simplified(root))?;
    let job = if operation == "preview" { WorkJob::Preview(preview::Lease::new(&tools.root)?) }
        else { WorkJob::Build(tempfile::Builder::new().prefix("engine-").tempdir_in(&tools.root).map_err(|e| e.to_string())?) };
    let work = job.path().join("game-project"); fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let gui = prepare_gui(&tools, &job.path(), &work, project)?;
    compile_sources(&tools, &job.path(), &work, project, payload, gui)?;
    let saves = job.path().join("sdk-saves");
    let mut lint = tools.sdk_command(&saves); lint.arg(&work).arg("lint");
    process::run(&mut lint, &job.path(), "Проверка игры", TOOL_TIMEOUT)?;
    if operation == "preview" {
        let mut command = tools.sdk_command(&saves);
        preview_save_environment(&mut command, std::env::var_os("RENPY_PATH_TO_SAVES").as_deref());
        command.arg(&work).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        process::hidden(&mut command);
        let WorkJob::Preview(lease) = job else { return Err("Не удалось зарегистрировать предпросмотр.".into()); };
        let mut result = preview::launch(command, lease)?;
        result["projectDir"] = json!(work);
        result["sceneId"] = payload["sceneId"].clone();
        result["engine"] = json!({"orchestrator":"rust","sourceEmitter":"javascript","previewLifetime":"rust"});
        return Ok(result);
    }
    let packages = job.path().join("packages"); fs::create_dir_all(&packages).map_err(|e| e.to_string())?;
    let bundle = project["meta"]["android"]["buildFormat"].as_str() == Some("aab");
    let mut key_info = None;
    if target == Target::Android { key_info = Some(android_keys(&tools, &job.path(), &work, project)?); }
    let mut command = tools.sdk_command(&saves);
    command.arg("launcher").arg(if target == Target::Android { "android_build" } else { "distribute" })
        .arg(&work).arg("--destination").arg(&packages);
    if target == Target::Android { if bundle { command.arg("--bundle"); } }
    else { command.arg("--package").arg(target.package()).arg("--no-update"); }
    process::run(&mut command, &job.path(), "Упаковка игры", TOOL_TIMEOUT)?;
    let mut candidates = Vec::new(); package_candidates(&packages, target.suffix(bundle), &mut candidates, 0)?;
    if candidates.len() != 1 { return Err(format!("Компонент сборки должен создать один пакет, найдено: {}. Прежние файлы в папке назначения не использованы.", candidates.len())); }
    let package = publish_package(&candidates[0], output)?;
    let size = fs::metadata(&package).map_err(|e| e.to_string())?.len();
    let mut result = json!({"platform":payload["platform"].as_str().unwrap_or("windows"),"packagePath":package,"size":size,
        "engine":{"orchestrator":"rust","sourceEmitter":"javascript","guiGenerator":"rust","sdkRunner":"rust","isolatedPackageDiscovery":true}});
    if let Some((key_dir, generated)) = key_info { result["keyDir"] = json!(key_dir); result["generatedKey"] = json!(generated); }
    // No nonexistent projectDir: successful build staging is intentionally
    // removed; only the published standalone package is the durable result.
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_existing_targets_keep_their_package_contract() {
        assert_eq!(Target::parse("windows").unwrap().suffix(false), "-win.zip");
        assert_eq!(Target::Linux.package(), "linux"); assert_eq!(Target::Macos.package(), "mac");
        assert_eq!(Target::Android.suffix(true), ".aab"); assert_eq!(Target::Android.suffix(false), ".apk");
        assert!(Target::parse("windows; rm").is_err());
    }
    #[test]
    fn preview_keeps_legacy_default_and_explicit_save_override_not_compiler_staging() {
        let mut default = Command::new("python.exe");
        default.env("RENPY_PATH_TO_SAVES", "compiler-staging");
        preview_save_environment(&mut default, None);
        assert_eq!(default.get_envs().find(|(key,_)|*key==OsStr::new("RENPY_PATH_TO_SAVES")).unwrap().1, None);
        let mut custom = Command::new("python.exe");
        custom.env("RENPY_PATH_TO_SAVES", "compiler-staging");
        preview_save_environment(&mut custom, Some(OsStr::new("owned-qa-or-existing-custom-saves")));
        assert_eq!(custom.get_envs().find(|(key,_)|*key==OsStr::new("RENPY_PATH_TO_SAVES")).unwrap().1, Some(OsStr::new("owned-qa-or-existing-custom-saves")));
    }
    #[test]
    fn publishing_preserves_old_packages_and_never_returns_stale_bytes() {
        let root = tempfile::tempdir().unwrap(); let source = root.path().join("game-win.zip");
        let output = root.path().join("output"); fs::create_dir(&output).unwrap();
        fs::write(output.join("game-win.zip"), b"old").unwrap(); fs::write(&source, b"fresh").unwrap();
        let published = publish_package(&source, &output).unwrap();
        assert_ne!(published, output.join("game-win.zip")); assert_eq!(fs::read(published).unwrap(), b"fresh");
        assert_eq!(fs::read(output.join("game-win.zip")).unwrap(), b"old");
    }
    #[test]
    fn package_discovery_is_scoped_to_the_current_job_and_rejects_empty_output() {
        let root = tempfile::tempdir().unwrap(); let current = root.path().join("new"); fs::create_dir(&current).unwrap();
        fs::write(root.path().join("old-win.zip"), b"old").unwrap();
        let mut candidates=Vec::new(); package_candidates(&current,"-win.zip",&mut candidates,0).unwrap(); assert!(candidates.is_empty());
        fs::write(current.join("empty-win.zip"), []).unwrap();
        assert!(package_candidates(&current,"-win.zip",&mut candidates,0).is_err());
    }
    #[test]
    fn resolution_is_explicit_and_accepts_legacy_numeric_strings() {
        assert_eq!(dimension(&json!({}), "width", 1920).unwrap(),1920);
        assert_eq!(dimension(&json!({"meta":{"resolution":{"width":"1280"}}}),"width",1920).unwrap(),1280);
        assert!(dimension(&json!({"meta":{"resolution":{"width":-2}}}),"width",1920).is_err());
    }
}
