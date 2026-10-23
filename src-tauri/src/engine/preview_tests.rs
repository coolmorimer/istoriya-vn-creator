use super::*;
use std::{
    process::Stdio,
    thread,
    time::{Duration, Instant},
};

fn fixture(mode: &str, root: &Path) -> Command {
    let mut c = Command::new(std::env::current_exe().unwrap());
    c.args([
        "--exact",
        "engine::preview::tests::fixture_process",
        "--nocapture",
    ])
    .env("ISTORIYA_PREVIEW_FIXTURE", mode)
    .env("ISTORIYA_PREVIEW_FIXTURE_ROOT", root)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    super::super::process::hidden(&mut c);
    c
}
fn until(mut check: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(8);
    while !check() {
        assert!(Instant::now() < deadline, "owned fixture timed out");
        thread::sleep(Duration::from_millis(20));
    }
}
#[test]
fn fixture_process() {
    let mode = std::env::var("ISTORIYA_PREVIEW_FIXTURE").unwrap_or_default();
    if mode.is_empty() {
        return;
    }
    let root = PathBuf::from(std::env::var_os("ISTORIYA_PREVIEW_FIXTURE_ROOT").unwrap());
    if mode == "hold" {
        let data = root.join("sentinel");
        fs::write(root.join("child-ready"), "ready").unwrap();
        let deadline = Instant::now() + Duration::from_secs(20);
        while !root.join("stop-child").exists() && Instant::now() < deadline {
            if !data.is_file() {
                fs::write(root.join("child-lost-files"), "missing").unwrap();
                std::process::exit(9);
            }
            thread::sleep(Duration::from_millis(10));
        }
    } else if mode == "creator" {
        let mut lease = Lease::new(&root).unwrap();
        fs::write(lease.path().join("sentinel"), "keep while alive").unwrap();
        let child = fixture("hold", &lease.path()).spawn().unwrap();
        lease.record.player = Some(Identity::child(&child).unwrap());
        lease.phase(Phase::Running).unwrap();
        write(&root.join("creator.json"), &lease.record).unwrap();
        // Simulate editor termination without dropping its monitoring objects.
        std::mem::forget(lease);
        drop(child);
    }
}

#[test]
fn only_strict_internal_ids_can_address_cache_files() {
    for id in [
        "..",
        "preview-../../outside",
        "preview-0000000000000000/",
        "preview-000000000000000.",
        "preview-000000000000000_",
        "preview-000000000000000а",
    ] {
        assert!(!valid_id(id));
    }
    assert!(valid_id("preview-aB0123456789CDxy"));
}
#[test]
fn failed_preparation_removes_only_its_fresh_marked_job() {
    let root = tempfile::tempdir().unwrap();
    let old = root.path().join("engine-legacy");
    fs::create_dir(&old).unwrap();
    fs::write(old.join("keep"), "legacy").unwrap();
    let saves = root.path().join("persistent-saves");
    fs::create_dir(&saves).unwrap();
    fs::write(saves.join("persistent"), "save").unwrap();
    let lease = Lease::new(root.path()).unwrap();
    let dir = lease.path();
    fs::create_dir_all(dir.join("game-project/game")).unwrap();
    fs::write(
        dir.join("game-project/game/script.rpy"),
        "private author text",
    )
    .unwrap();
    drop(lease);
    assert!(!dir.exists());
    assert_eq!(fs::read(old.join("keep")).unwrap(), b"legacy");
    assert_eq!(fs::read(saves.join("persistent")).unwrap(), b"save");
}
#[test]
fn normal_child_exit_removes_staging_and_keeps_only_technical_outcome() {
    let root = tempfile::tempdir().unwrap();
    let lease = Lease::new(root.path()).unwrap();
    let job = lease.path();
    fs::create_dir(job.join("game-project")).unwrap();
    fs::write(
        job.join("game-project/log.txt"),
        "PRIVATE-STORY-CANARY\nNo errors",
    )
    .unwrap();
    let result = launch(fixture("quick", root.path()), lease).unwrap();
    let outcome = PathBuf::from(result["outcomePath"].as_str().unwrap());
    until(|| outcome.is_file());
    let data: Outcome = read(&outcome).unwrap();
    assert!(data.staging_removed);
    assert_eq!(data.exit_code, Some(0));
    assert_eq!(data.runtime_exception, Some(false));
    assert!(!job.exists());
    assert!(!fs::read_to_string(outcome)
        .unwrap()
        .contains("PRIVATE-STORY-CANARY"));
}
#[test]
fn recovered_runtime_exception_is_not_hidden_by_zero_exit() {
    let root = tempfile::tempdir().unwrap();
    let lease = Lease::new(root.path()).unwrap();
    let job = lease.path();
    fs::create_dir(job.join("game-project")).unwrap();
    fs::write(
        job.join("game-project/log.txt"),
        "Traceback (most recent call last):\nSECRET STORY",
    )
    .unwrap();
    let result = launch(fixture("quick", root.path()), lease).unwrap();
    let output = PathBuf::from(result["outcomePath"].as_str().unwrap());
    until(|| output.exists());
    let data: Outcome = read(&output).unwrap();
    assert_eq!(data.exit_code, Some(0));
    assert_eq!(data.runtime_exception, Some(true));
    assert!(!job.exists());
    assert!(!fs::read_to_string(output).unwrap().contains("SECRET STORY"));
}
#[test]
fn launch_failure_cleans_its_job_instead_of_pinning_it_forever() {
    let root = tempfile::tempdir().unwrap();
    let lease = Lease::new(root.path()).unwrap();
    let job = lease.path();
    assert!(launch(Command::new(job.join("does-not-exist.exe")), lease).is_err());
    assert!(!job.exists());
}
#[test]
fn missing_logs_and_large_logs_are_unknown_not_fabricated_success() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("game-project")).unwrap();
    assert_eq!(runtime_log(root.path()).0, None);
    fs::write(
        root.path().join("game-project/log.txt"),
        vec![b'x'; 1024 * 1024 + 1],
    )
    .unwrap();
    assert_eq!(runtime_log(root.path()), (None, "too-large".into()));
}
#[test]
fn guard_drop_stops_owned_child_before_deleting_files() {
    let root = tempfile::tempdir().unwrap();
    let mut lease = Lease::new(root.path()).unwrap();
    let job = lease.path();
    fs::write(job.join("sentinel"), "keep").unwrap();
    lease.phase(Phase::Launching).unwrap();
    let child = fixture("hold", &job).spawn().unwrap();
    let identity = Identity::child(&child).unwrap();
    let running = Running {
        child: Some(child),
        lease,
    };
    until(|| job.join("child-ready").is_file());
    drop(running);
    #[cfg(windows)]
    assert_eq!(identity.presence(), Presence::Gone);
    assert!(!job.exists());
}
#[test]
fn mismatched_markers_and_unregistered_folders_are_not_deleted() {
    let root = tempfile::tempdir().unwrap();
    let lease = Lease::new(root.path()).unwrap();
    let job = lease.path();
    let unknown = job.parent().unwrap().join("preview-unregistered000");
    fs::create_dir(&unknown).unwrap();
    fs::write(unknown.join("keep"), "unknown").unwrap();
    let mut wrong = lease.record.marker.clone();
    wrong.token = "f".repeat(64);
    write(&job.join("owner.json"), &wrong).unwrap();
    drop(lease);
    assert!(job.exists());
    assert!(unknown.join("keep").exists());
    assert_eq!(reap_abandoned(root.path()).unwrap(), 0);
}
#[test]
fn existing_unowned_cache_is_not_adopted_or_emptied() {
    let root = tempfile::tempdir().unwrap();
    let cache = root.path().join(CACHE);
    fs::create_dir(&cache).unwrap();
    fs::write(cache.join("personal"), "keep").unwrap();
    assert!(Lease::new(root.path()).is_err());
    assert_eq!(fs::read(cache.join("personal")).unwrap(), b"keep");
}
#[test]
fn history_prunes_only_valid_technical_outcomes() {
    let root = tempfile::tempdir().unwrap();
    let cache = Cache::open(root.path(), true).unwrap().unwrap();
    for i in 0..45 {
        let id = format!("preview-{i:016}");
        let o = Outcome {
            kind: KIND.into(),
            id: id.clone(),
            closed_at: i,
            exit_code: Some(0),
            runtime_exception: Some(false),
            log_state: "checked".into(),
            staging_removed: true,
            local_saves_retained: Some(false),
        };
        fs::write(cache.outcome_path(&id), serde_json::to_vec(&o).unwrap()).unwrap();
    }
    let personal = cache.root.join("outcomes/unknown.json");
    fs::write(&personal, "personal").unwrap();
    cache.prune_outcomes().unwrap();
    assert_eq!(
        fs::read_dir(cache.root.join("outcomes")).unwrap().count(),
        33
    );
    assert_eq!(fs::read(personal).unwrap(), b"personal");
}

#[test]
#[cfg(windows)]
fn process_creation_stamp_distinguishes_reused_pid_and_unknown_presence() {
    let actual = Identity::current().unwrap();
    assert_eq!(actual.presence(), Presence::Alive);
    let reused = Identity {
        pid: actual.pid,
        created: "0000000000000000".into(),
    };
    assert_eq!(reused.presence(), Presence::Gone);
    let inaccessible = Identity {
        pid: 0,
        created: "0000000000000000".into(),
    };
    assert_ne!(inaccessible.presence(), Presence::Alive);
}
#[test]
#[cfg(windows)]
fn restart_keeps_live_game_then_reaps_after_its_creator_and_player_exit() {
    let root = tempfile::tempdir().unwrap();
    let status = fixture("creator", root.path()).status().unwrap();
    assert!(status.success());
    let record: Record = read(&root.path().join("creator.json")).unwrap();
    let cache = Cache::open(root.path(), false).unwrap().unwrap();
    let job = cache.job_path(&record.marker.id);
    struct Stop(PathBuf);
    impl Drop for Stop {
        fn drop(&mut self) {
            let _ = fs::write(self.0.join("stop-child"), "stop own fixture");
        }
    }
    let stop = Stop(job.clone());
    until(|| job.join("child-ready").exists());
    assert_eq!(record.owner.presence(), Presence::Gone);
    assert_eq!(record.player.as_ref().unwrap().presence(), Presence::Alive);
    assert_eq!(reap_abandoned(root.path()).unwrap(), 0);
    assert!(job.join("sentinel").exists());
    fs::write(job.join("stop-child"), "stop own fixture").unwrap();
    until(|| record.player.as_ref().unwrap().presence() == Presence::Gone);
    assert!(!job.join("child-lost-files").exists());
    assert_eq!(reap_abandoned(root.path()).unwrap(), 1);
    assert!(!job.exists());
    drop(stop);
}
#[test]
#[cfg(windows)]
fn ambiguous_launch_crashes_and_live_owner_records_are_retained() {
    let root = tempfile::tempdir().unwrap();
    let mut lease = Lease::new(root.path()).unwrap();
    let job = lease.path();
    assert_eq!(reap_abandoned(root.path()).unwrap(), 0);
    assert!(job.exists());
    lease.record.owner.created = "0000000000000000".into();
    lease.phase(Phase::Launching).unwrap();
    assert_eq!(reap_abandoned(root.path()).unwrap(), 0);
    assert!(job.exists());
    lease.phase(Phase::Preparing).unwrap(); // Normal in-process failure may safely release its own job.
}
#[test]
#[cfg(windows)]
fn changed_but_parseable_process_identity_fails_integrity_instead_of_deleting_a_live_game() {
    let root = tempfile::tempdir().unwrap();
    let mut lease = Lease::new(root.path()).unwrap();
    let job = lease.path();
    lease.record.owner.created = "0000000000000000".into();
    lease.record.player = Some(Identity::current().unwrap());
    lease.phase(Phase::Running).unwrap();
    let mut damaged = lease.record.clone();
    damaged.player.as_mut().unwrap().created = "0000000000000000".into();
    write(&lease.cache.record_path(&damaged.marker.id), &damaged).unwrap();
    assert_eq!(reap_abandoned(root.path()).unwrap(), 0);
    assert!(job.exists());
    lease.phase(Phase::Preparing).unwrap();
}
#[test]
fn game_local_saves_are_preserved_outside_the_disposable_project_even_if_they_are_the_only_copy() {
    let root = tempfile::tempdir().unwrap();
    let lease = Lease::new(root.path()).unwrap();
    let job = lease.path();
    let id = lease.record.marker.id.clone();
    let saves = job.join("game-project/game/saves");
    fs::create_dir_all(&saves).unwrap();
    fs::write(saves.join("persistent"), "unique permanent data").unwrap();
    fs::write(saves.join("1-1.save"), "only copy of player save").unwrap();
    drop(lease);
    assert!(!job.exists());
    let backup = root
        .path()
        .join("preview-save-recovery-v1")
        .join(id)
        .join("saves");
    assert_eq!(
        fs::read(backup.join("persistent")).unwrap(),
        b"unique permanent data"
    );
    assert_eq!(
        fs::read(backup.join("1-1.save")).unwrap(),
        b"only copy of player save"
    );
    assert_eq!(reap_abandoned(root.path()).unwrap(), 0);
    assert!(backup.join("1-1.save").exists());
}
#[test]
fn blocked_save_recovery_keeps_the_entire_project_instead_of_deleting_player_data() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("preview-save-recovery-v1")).unwrap(); // deliberately unowned
    let lease = Lease::new(root.path()).unwrap();
    let job = lease.path();
    let saves = job.join("game-project/game/saves");
    fs::create_dir_all(&saves).unwrap();
    fs::write(saves.join("persistent"), "only copy").unwrap();
    drop(lease);
    assert_eq!(fs::read(saves.join("persistent")).unwrap(), b"only copy");
    assert!(job.exists());
}
#[test]
#[cfg(windows)]
fn junctions_inside_owned_jobs_never_delete_their_targets() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("keep"), "outside").unwrap();
    let lease = Lease::new(root.path()).unwrap();
    let job = lease.path();
    let link = job.join("junction");
    // mklink /J needs no elevated symlink privilege. These are fresh test paths;
    // reject shell metacharacters before passing the two explicit arguments.
    for p in [&link, outside.path()] {
        assert!(!p
            .to_string_lossy()
            .contains(['&', '|', '<', '>', '^', '%', '!', '"', '\r', '\n']));
    }
    let mut command = Command::new("cmd.exe");
    command
        .args(["/d", "/c", "mklink", "/J"])
        .arg(&link)
        .arg(outside.path())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    super::super::process::hidden(&mut command);
    assert!(command.status().unwrap().success());
    drop(lease);
    assert!(job.exists());
    assert_eq!(fs::read(outside.path().join("keep")).unwrap(), b"outside");
}
