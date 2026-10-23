//! Owned preview staging, detached-child lifetime and conservative crash recovery.
//! Never adopts legacy engine-* folders or accepts a cleanup path from the UI.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command},
    time::{SystemTime, UNIX_EPOCH},
};

const KIND: &str = "istoriya-preview-cache-v1";
const CACHE: &str = ".engine-preview-cache-v1";
const MAX_RECORD: u64 = 4096;
const SCAN_LIMIT: usize = 256;

fn error() -> String {
    "Не удалось безопасно проверить временную папку предпросмотра. Посторонние файлы не удалены."
        .into()
}
fn real(path: &Path) -> Result<PathBuf, String> {
    Ok(dunce::simplified(&path.canonicalize().map_err(|_| error())?).to_path_buf())
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn valid_id(id: &str) -> bool {
    id.len() == 24
        && id.starts_with("preview-")
        && id[8..].bytes().all(|c| c.is_ascii_alphanumeric())
}
fn plain(path: &Path, directory: bool) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|_| error())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err(error());
        }
    }
    if meta.file_type().is_symlink()
        || meta.is_dir() != directory
        || (!directory && !meta.is_file())
    {
        return Err(error());
    }
    Ok(())
}
fn read<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    plain(path, false)?;
    let mut bytes = Vec::new();
    fs::File::open(path)
        .and_then(|f| f.take(MAX_RECORD + 1).read_to_end(&mut bytes))
        .map_err(|_| error())?;
    if bytes.len() as u64 > MAX_RECORD {
        return Err(error());
    }
    serde_json::from_slice(&bytes).map_err(|_| error())
}
fn write<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if path.try_exists().map_err(|_| error())? {
        plain(path, false)?;
    }
    let mut staged =
        tempfile::NamedTempFile::new_in(path.parent().ok_or_else(error)?).map_err(|_| error())?;
    staged
        .write_all(&serde_json::to_vec(value).map_err(|_| error())?)
        .map_err(|_| error())?;
    staged.as_file().sync_all().map_err(|_| error())?;
    staged.persist(path).map_err(|_| error())?;
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Identity {
    pid: u32,
    created: String,
}
#[derive(PartialEq, Debug)]
enum Presence {
    Alive,
    Gone,
    Unknown,
}

#[cfg(windows)]
fn creation(handle: windows_sys::Win32::Foundation::HANDLE) -> Option<String> {
    use windows_sys::Win32::{Foundation::FILETIME, System::Threading::GetProcessTimes};
    unsafe {
        let mut c: FILETIME = std::mem::zeroed();
        let mut e = c;
        let mut k = c;
        let mut u = c;
        if GetProcessTimes(handle, &mut c, &mut e, &mut k, &mut u) == 0 {
            None
        } else {
            Some(format!("{:08x}{:08x}", c.dwHighDateTime, c.dwLowDateTime))
        }
    }
}
impl Identity {
    fn valid(&self) -> bool {
        self.pid > 0
            && (self.created.len() == 16 && self.created.bytes().all(|c| c.is_ascii_hexdigit())
                || cfg!(not(windows)) && self.created == "unknown")
    }
    fn current() -> Result<Self, String> {
        #[cfg(windows)]
        {
            let created =
                creation(unsafe { windows_sys::Win32::System::Threading::GetCurrentProcess() })
                    .ok_or_else(error)?;
            return Ok(Self {
                pid: std::process::id(),
                created,
            });
        }
        #[cfg(not(windows))]
        Ok(Self {
            pid: std::process::id(),
            created: "unknown".into(),
        })
    }
    fn child(child: &Child) -> Result<Self, String> {
        #[cfg(windows)]
        {
            use std::os::windows::io::AsRawHandle;
            return Ok(Self {
                pid: child.id(),
                created: creation(child.as_raw_handle()).ok_or_else(error)?,
            });
        }
        #[cfg(not(windows))]
        Ok(Self {
            pid: child.id(),
            created: "unknown".into(),
        })
    }
    fn presence(&self) -> Presence {
        #[cfg(windows)]
        {
            use windows_sys::Win32::{
                Foundation::{
                    CloseHandle, GetLastError, ERROR_INVALID_PARAMETER, WAIT_OBJECT_0, WAIT_TIMEOUT,
                },
                System::Threading::{
                    OpenProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION,
                    SYNCHRONIZATION_SYNCHRONIZE,
                },
            };
            unsafe {
                let handle = OpenProcess(
                    PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZATION_SYNCHRONIZE,
                    0,
                    self.pid,
                );
                if handle.is_null() {
                    return if GetLastError() == ERROR_INVALID_PARAMETER {
                        Presence::Gone
                    } else {
                        Presence::Unknown
                    };
                }
                let wait = WaitForSingleObject(handle, 0);
                let stamp = creation(handle);
                CloseHandle(handle);
                if wait == WAIT_OBJECT_0 {
                    Presence::Gone
                } else if wait != WAIT_TIMEOUT || stamp.is_none() {
                    Presence::Unknown
                } else if stamp.as_deref() == Some(self.created.as_str()) {
                    Presence::Alive
                } else {
                    Presence::Gone
                }
            }
        }
        #[cfg(not(windows))]
        {
            Presence::Unknown
        }
    }
}

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Phase {
    Preparing,
    Launching,
    Running,
    Finished,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Marker {
    kind: String,
    id: String,
    token: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    marker: Marker,
    owner: Identity,
    phase: Phase,
    player: Option<Identity>,
    checksum: String,
}
impl Record {
    fn digest(&self) -> String {
        let value = serde_json::json!({"marker": self.marker, "owner": self.owner, "phase": self.phase, "player": self.player});
        format!("{:x}", Sha256::digest(value.to_string().as_bytes()))
    }
    fn valid(&self) -> bool {
        self.marker.valid(&self.marker.id)
            && self.owner.valid()
            && self.player.as_ref().is_none_or(Identity::valid)
            && (self.phase != Phase::Running || self.player.is_some())
            && self.checksum == self.digest()
    }
    fn save(&mut self, cache: &Cache) -> Result<(), String> {
        self.checksum = self.digest();
        write(&cache.record_path(&self.marker.id), self)
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Outcome {
    kind: String,
    id: String,
    closed_at: u64,
    exit_code: Option<i32>,
    runtime_exception: Option<bool>,
    log_state: String,
    staging_removed: bool,
    local_saves_retained: Option<bool>,
}
impl Marker {
    fn valid(&self, id: &str) -> bool {
        self.kind == KIND
            && self.id == id
            && valid_id(id)
            && self.token.len() == 64
            && self.token.bytes().all(|c| c.is_ascii_hexdigit())
    }
}

struct Cache {
    root: PathBuf,
}
impl Cache {
    fn open(workspace: &Path, create: bool) -> Result<Option<Self>, String> {
        let base = real(workspace)?;
        let root = base.join(CACHE);
        if !root.try_exists().map_err(|_| error())? {
            if !create {
                return Ok(None);
            }
            match fs::create_dir(&root) {
                Ok(()) => {
                    let mut f = fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(root.join("owner"))
                        .map_err(|_| error())?;
                    f.write_all(KIND.as_bytes())
                        .and_then(|_| f.sync_all())
                        .map_err(|_| error())?;
                }
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => (),
                Err(_) => return Err(error()),
            }
        }
        let cache = Self { root };
        plain(&cache.root, true)?;
        plain(&cache.root.join("owner"), false)?;
        if fs::metadata(cache.root.join("owner"))
            .map_err(|_| error())?
            .len()
            != KIND.len() as u64
            || fs::read(cache.root.join("owner")).map_err(|_| error())? != KIND.as_bytes()
        {
            return Err(error());
        }
        for name in ["jobs", "records", "outcomes"] {
            let p = cache.root.join(name);
            if create {
                match fs::create_dir(&p) {
                    Ok(()) => (),
                    Err(e) if e.kind() == io::ErrorKind::AlreadyExists => (),
                    Err(_) => return Err(error()),
                }
            }
            plain(&p, true)?;
        }
        cache.check()?;
        Ok(Some(cache))
    }
    fn check(&self) -> Result<(), String> {
        plain(&self.root, true)?;
        if real(&self.root)? != self.root {
            return Err(error());
        }
        plain(&self.root.join("owner"), false)?;
        if fs::metadata(self.root.join("owner"))
            .map_err(|_| error())?
            .len()
            != KIND.len() as u64
            || fs::read(self.root.join("owner")).map_err(|_| error())? != KIND.as_bytes()
        {
            return Err(error());
        }
        for name in ["jobs", "records", "outcomes"] {
            plain(&self.root.join(name), true)?;
        }
        Ok(())
    }
    fn record_path(&self, id: &str) -> PathBuf {
        self.root.join("records").join(format!("{id}.json"))
    }
    fn outcome_path(&self, id: &str) -> PathBuf {
        self.root.join("outcomes").join(format!("{id}.json"))
    }
    fn job_path(&self, id: &str) -> PathBuf {
        self.root.join("jobs").join(id)
    }
    fn retain_local_saves(&self, record: &Record, job: &Path) -> Result<bool, String> {
        let saves = job.join("game-project/game/saves");
        if !saves.try_exists().map_err(|_| error())? {
            return Ok(false);
        }
        plain(&saves, true)?;
        if fs::read_dir(&saves).map_err(|_| error())?.next().is_none() {
            return Ok(false);
        }
        // Ren'Py writes to both config.savedir and game/saves. The local mirror
        // may be the only successful location. It is user data, never cache.
        let root = self
            .root
            .parent()
            .ok_or_else(error)?
            .join("preview-save-recovery-v1");
        const SAVE_KIND: &str = "istoriya-preview-save-recovery-v1";
        match fs::create_dir(&root) {
            Ok(()) => {
                let mut f = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(root.join("owner"))
                    .map_err(|_| error())?;
                f.write_all(SAVE_KIND.as_bytes())
                    .and_then(|_| f.sync_all())
                    .map_err(|_| error())?;
            }
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => (),
            Err(_) => return Err(error()),
        }
        plain(&root, true)?;
        if real(&root)?.parent() != self.root.parent() {
            return Err(error());
        }
        plain(&root.join("owner"), false)?;
        if fs::metadata(root.join("owner")).map_err(|_| error())?.len() != SAVE_KIND.len() as u64
            || fs::read(root.join("owner")).map_err(|_| error())? != SAVE_KIND.as_bytes()
        {
            return Err(error());
        }
        let archive = root.join(&record.marker.id);
        match fs::create_dir(&archive) {
            Ok(()) => write(&archive.join("owner.json"), &record.marker)?,
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
                plain(&archive, true)?;
                let marker: Marker = read(&archive.join("owner.json"))?;
                if !marker.valid(&record.marker.id) || marker.token != record.marker.token {
                    return Err(error());
                }
            }
            Err(_) => return Err(error()),
        }
        // Same canonical workspace/volume, no merging or overwriting old saves.
        if real(&archive)?.parent() != Some(root.as_path()) || !real(&saves)?.starts_with(job) {
            return Err(error());
        }
        let target = archive.join("saves");
        if target.try_exists().map_err(|_| error())? {
            return Err(error());
        }
        fs::rename(&saves, &target).map_err(|_| error())?;
        Ok(true)
    }
    fn remove_job(&self, record: &Record) -> Result<Option<bool>, String> {
        self.check()?;
        let id = &record.marker.id;
        if !record.valid() {
            return Err(error());
        }
        let job = self.job_path(id);
        if !job.try_exists().map_err(|_| error())? {
            return Ok(None);
        }
        plain(&job, true)?;
        if real(&job)?.parent() != Some(self.root.join("jobs").as_path()) {
            return Err(error());
        }
        let marker: Marker = read(&job.join("owner.json"))?;
        if !marker.valid(id) || marker.token != record.marker.token {
            return Err(error());
        }
        // Reject junctions/reparse points anywhere, before any recursive delete.
        let mut pending = vec![(job.clone(), 0)];
        let mut entries = 0;
        while let Some((dir, depth)) = pending.pop() {
            if depth > 64 {
                return Err(error());
            }
            for entry in fs::read_dir(dir).map_err(|_| error())? {
                entries += 1;
                if entries > 100_000 {
                    return Err(error());
                }
                let p = entry.map_err(|_| error())?.path();
                let meta = fs::symlink_metadata(&p).map_err(|_| error())?;
                plain(&p, meta.is_dir())?;
                if meta.is_dir() {
                    pending.push((p, depth + 1));
                }
            }
        }
        let retained = self.retain_local_saves(record, &job)?;
        // The exact canonical target is a marked child of the dedicated jobs root.
        match fs::remove_dir_all(&job) {
            Ok(()) => Ok(Some(retained)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Some(retained)),
            Err(_) => Err(error()),
        }
    }
    fn finish(&self, record: &Record, exit_code: Option<i32>, log: (Option<bool>, String)) -> bool {
        if self.check().is_err() {
            return false;
        }
        let removal = self.remove_job(record);
        let removed = removal.is_ok();
        let outcome = Outcome {
            kind: KIND.into(),
            id: record.marker.id.clone(),
            closed_at: now(),
            exit_code,
            runtime_exception: log.0,
            log_state: log.1,
            staging_removed: removed,
            local_saves_retained: removal.ok().flatten(),
        };
        if write(&self.outcome_path(&record.marker.id), &outcome).is_ok() && removed {
            let p = self.record_path(&record.marker.id);
            if read::<Record>(&p).is_ok_and(|r| r.valid() && r.marker.token == record.marker.token)
            {
                let _ = fs::remove_file(p);
            }
        }
        let _ = self.prune_outcomes();
        removed
    }
    fn prune_outcomes(&self) -> Result<(), String> {
        self.check()?;
        let mut files = Vec::new();
        for e in fs::read_dir(self.root.join("outcomes"))
            .map_err(|_| error())?
            .take(SCAN_LIMIT)
        {
            let p = e.map_err(|_| error())?.path();
            if let Ok(o) = read::<Outcome>(&p) {
                if o.kind == KIND && valid_id(&o.id) && p == self.outcome_path(&o.id) {
                    files.push((o.closed_at, p));
                }
            }
        }
        files.sort();
        let remove = files.len().saturating_sub(32);
        for (_, p) in files.into_iter().take(remove) {
            plain(&p, false)?;
            fs::remove_file(p).map_err(|_| error())?;
        }
        Ok(())
    }
}

pub struct Lease {
    cache: Cache,
    record: Record,
}
impl Lease {
    pub fn new(workspace: &Path) -> Result<Self, String> {
        let cache = Cache::open(workspace, true)?.ok_or_else(error)?;
        let temp = tempfile::Builder::new()
            .prefix("preview-")
            .rand_bytes(16)
            .tempdir_in(cache.root.join("jobs"))
            .map_err(|_| error())?;
        let id = temp
            .path()
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(error)?
            .to_owned();
        if !valid_id(&id) {
            return Err(error());
        }
        let owner = Identity::current()?;
        let token = format!(
            "{:x}",
            Sha256::digest(
                format!(
                    "{}:{}:{}:{:?}",
                    id,
                    owner.pid,
                    owner.created,
                    SystemTime::now()
                )
                .as_bytes()
            )
        );
        let marker = Marker {
            kind: KIND.into(),
            id,
            token,
        };
        let mut record = Record {
            marker,
            owner,
            phase: Phase::Preparing,
            player: None,
            checksum: String::new(),
        };
        write(&temp.path().join("owner.json"), &record.marker)?;
        record.save(&cache)?;
        let _ = temp.keep();
        Ok(Self { cache, record })
    }
    pub fn path(&self) -> PathBuf {
        self.cache.job_path(&self.record.marker.id)
    }
    fn phase(&mut self, phase: Phase) -> Result<(), String> {
        self.record.phase = phase;
        self.record.save(&self.cache)
    }
}
impl Drop for Lease {
    fn drop(&mut self) {
        if self.record.phase == Phase::Preparing {
            self.cache
                .finish(&self.record, None, (None, "not-started".into()));
        }
    }
}

fn runtime_log(job: &Path) -> (Option<bool>, String) {
    let work = job.join("game-project");
    if work.join("traceback.txt").is_file() {
        return (Some(true), "exception".into());
    }
    let file = work.join("log.txt");
    if plain(&file, false).is_err() {
        return (None, "unavailable".into());
    }
    let mut bytes = Vec::new();
    if fs::File::open(&file)
        .and_then(|f| f.take(1024 * 1024 + 1).read_to_end(&mut bytes))
        .is_err()
    {
        return (None, "unavailable".into());
    }
    if bytes.len() > 1024 * 1024 {
        return (None, "too-large".into());
    }
    (
        Some(super::process::runtime_exception(&String::from_utf8_lossy(
            &bytes,
        ))),
        "checked".into(),
    )
}

// Guard exists before any fallible registration/thread creation. Dropping a
// failed spawn closure cannot abandon a live game while deleting its files.
struct Running {
    child: Option<Child>,
    lease: Lease,
}
impl Running {
    fn observe(mut self) {
        let status = self.child.as_mut().unwrap().wait();
        if let Ok(status) = status {
            self.child.take();
            self.finish(status.code());
        }
    }
    fn finish(&mut self, code: Option<i32>) {
        let log = runtime_log(&self.lease.path());
        let _ = self.lease.phase(Phase::Finished);
        self.lease.cache.finish(&self.lease.record, code, log);
    }
}
impl Drop for Running {
    fn drop(&mut self) {
        if let Some(child) = self.child.as_mut() {
            let ended = child.try_wait().ok().flatten().is_some()
                || (child.kill().is_ok() && child.wait().is_ok());
            if ended {
                self.child.take();
                self.finish(None);
            }
            // Unknown exit -> retain registered staging; never delete live files.
        }
    }
}

pub fn launch(mut command: Command, mut lease: Lease) -> Result<serde_json::Value, String> {
    lease.phase(Phase::Launching)?;
    let child = match command.spawn() {
        Ok(child) => child,
        Err(e) => {
            let _ = lease.phase(Phase::Preparing);
            return Err(format!("Не удалось запустить игру: {e}"));
        }
    };
    let mut running = Running {
        child: Some(child),
        lease,
    };
    let identity = Identity::child(running.child.as_ref().unwrap())?;
    let pid = identity.pid;
    running.lease.record.player = Some(identity);
    running.lease.phase(Phase::Running)?;
    let id = running.lease.record.marker.id.clone();
    let outcome = running.lease.cache.outcome_path(&id);
    std::thread::Builder::new()
        .name("preview-lifetime".into())
        .spawn(move || running.observe())
        .map_err(|_| "Не удалось включить контроль предпросмотра.")?;
    Ok(serde_json::json!({"processId":pid,"previewId":id,"outcomePath":outcome}))
}

/// Called only after a usable profile opens. No recursive scan of the workspace.
/// Ambiguous preparation/launch crash windows are retained, not guessed safe.
pub fn reap_abandoned(workspace: &Path) -> Result<usize, String> {
    let Some(cache) = Cache::open(workspace, false)? else {
        return Ok(0);
    };
    let mut removed = 0;
    for e in fs::read_dir(cache.root.join("records"))
        .map_err(|_| error())?
        .take(SCAN_LIMIT)
    {
        let p = e.map_err(|_| error())?.path();
        let Ok(record) = read::<Record>(&p) else {
            continue;
        };
        if !record.valid()
            || p != cache.record_path(&record.marker.id)
            || record.owner.presence() != Presence::Gone
        {
            continue;
        }
        let safe = record.phase == Phase::Finished
            || (record.phase == Phase::Running
                && record
                    .player
                    .as_ref()
                    .is_some_and(|p| p.presence() == Presence::Gone));
        if safe && cache.finish(&record, None, (None, "recovered-after-restart".into())) {
            removed += 1;
        }
    }
    cache.prune_outcomes()?;
    Ok(removed)
}

#[cfg(test)]
#[path = "preview_tests.rs"]
mod tests;
