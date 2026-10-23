use std::{fs, io::Read, path::Path, process::{Command, Stdio}, thread, time::{Duration, Instant}};

const LOG_LIMIT: u64 = 4 * 1024 * 1024;
const ERROR_TAIL: usize = 3000;

pub fn runtime_exception(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    ["full traceback:", "traceback (most recent call last):", "while running game code:",
     "an exception has occurred", "uncaught exception", "modulenotfounderror:"]
        .iter().any(|pattern| lower.contains(pattern))
}

fn tail(text: &str) -> String {
    text.chars().rev().take(ERROR_TAIL).collect::<String>().chars().rev().collect()
}

pub fn hidden(command: &mut Command) {
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(not(windows))] let _ = command;
}

#[cfg(windows)]
struct ProcessGroup(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl ProcessGroup {
    fn new(child: &std::process::Child) -> Result<Self, String> {
        use std::{mem::{size_of, zeroed}, os::windows::io::AsRawHandle, ptr::null};
        use windows_sys::Win32::{Foundation::CloseHandle, System::JobObjects::*};
        unsafe {
            let handle = CreateJobObjectW(null(), null());
            if handle.is_null() { return Err("Не удалось создать изолированную группу сборки.".into()); }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(handle, JobObjectExtendedLimitInformation,
                &limits as *const _ as _, size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle()) == 0 {
                CloseHandle(handle);
                return Err("Не удалось включить контроль процессов сборки.".into());
            }
            Ok(Self(handle))
        }
    }
}

#[cfg(windows)]
impl Drop for ProcessGroup {
    fn drop(&mut self) { unsafe { windows_sys::Win32::Foundation::CloseHandle(self.0); } }
}

/// No shell, no unbounded in-memory pipe capture. A child cannot turn a
/// recovered init traceback into success by printing PASSED or exiting zero.
pub fn run(command: &mut Command, directory: &Path, stage: &str, timeout: Duration) -> Result<String, String> {
    let log = tempfile::NamedTempFile::new_in(directory).map_err(|_| "Не удалось создать журнал сборки.")?;
    command.stdin(Stdio::null())
        .stdout(log.as_file().try_clone().map_err(|e| e.to_string())?)
        .stderr(log.as_file().try_clone().map_err(|e| e.to_string())?);
    hidden(command);
    let mut child = command.spawn().map_err(|e| format!("{stage}: не удалось запустить компонент: {e}"))?;
    #[cfg(windows)]
    let group = match ProcessGroup::new(&child) {
        Ok(group) => group,
        Err(error) => { let _ = child.kill(); let _ = child.wait(); return Err(error); }
    };
    let started = Instant::now();
    let status = loop {
        let size = log.as_file().metadata().map(|m| m.len());
        let reason = if started.elapsed() >= timeout { Some("превышено время ожидания") }
            else if size.as_ref().is_ok_and(|n| *n > LOG_LIMIT) { Some("слишком большой вывод компонента") }
            else if size.is_err() { Some("не удалось проверить журнал компонента") } else { None };
        if let Some(reason) = reason {
            #[cfg(windows)] drop(group);
            let _ = child.kill(); let _ = child.wait();
            return Err(format!("{stage}: {reason}. Сборка остановлена."));
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(error) => {
                #[cfg(windows)] drop(group);
                let _ = child.kill(); let _ = child.wait();
                return Err(format!("{stage}: не удалось дождаться компонента: {error}"));
            }
        }
    };
    // Successful foreground tools must not leave background build children.
    #[cfg(windows)] drop(group);
    let mut bytes = Vec::new();
    fs::File::open(log.path()).and_then(|file| file.take(LOG_LIMIT + 1).read_to_end(&mut bytes))
        .map_err(|_| format!("{stage}: не удалось прочитать результат компонента."))?;
    let text = String::from_utf8_lossy(&bytes);
    if bytes.len() as u64 > LOG_LIMIT { return Err(format!("{stage}: слишком большой вывод компонента.")); }
    if !status.success() || runtime_exception(&text) {
        return Err(format!("{stage}: компонент завершился с ошибкой ({}). {}", status.code().unwrap_or(-1), tail(&text)));
    }
    Ok(text.into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_process() {
        match std::env::var("ISTORIYA_ENGINE_PROCESS_FIXTURE").unwrap_or_default().as_str() {
            "wait" => thread::sleep(Duration::from_secs(10)),
            "traceback" => { println!("Traceback (most recent call last):"); println!("{}", "ok ".repeat(3000)); },
            "fail" => std::process::exit(7),
            "flood" => { for _ in 0..10000 { println!("{}", "x".repeat(1024)); } },
            "success" => println!("ГОТОВО"),
            "descendant" => {
                let child = fixture("wait").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap();
                println!("OWNED_CHILD={}", child.id());
            }
            _ => (),
        }
    }

    fn fixture(mode: &str) -> Command {
        let mut command = Command::new(std::env::current_exe().unwrap());
        command.args(["--exact", "engine::process::tests::fixture_process", "--nocapture"])
            .env("ISTORIYA_ENGINE_PROCESS_FIXTURE", mode);
        command
    }

    #[test]
    fn successful_output_is_collected() {
        let dir = tempfile::tempdir().unwrap();
        assert!(run(&mut fixture("success"), dir.path(), "Тест", Duration::from_secs(5)).unwrap().contains("ГОТОВО"));
    }
    #[test]
    fn traceback_before_retained_error_tail_still_fails_zero_exit() {
        let dir = tempfile::tempdir().unwrap();
        assert!(run(&mut fixture("traceback"), dir.path(), "Тест", Duration::from_secs(5)).is_err());
    }
    #[test]
    fn exit_code_cannot_be_hidden_by_output() {
        let dir = tempfile::tempdir().unwrap();
        assert!(run(&mut fixture("fail"), dir.path(), "Тест", Duration::from_secs(5)).unwrap_err().contains("7"));
    }
    #[test]
    fn timeout_reaps_the_owned_process() {
        let dir = tempfile::tempdir().unwrap(); let started = Instant::now();
        assert!(run(&mut fixture("wait"), dir.path(), "Тест", Duration::from_millis(100)).unwrap_err().contains("время"));
        assert!(started.elapsed() < Duration::from_secs(4));
    }
    #[test]
    fn output_limit_does_not_require_a_pipe_reader_or_unbounded_ram() {
        let dir = tempfile::tempdir().unwrap();
        assert!(run(&mut fixture("flood"), dir.path(), "Тест", Duration::from_secs(5)).unwrap_err().contains("вывод"));
    }
    #[test]
    fn exception_markers_match_the_existing_runtime_contract() {
        for marker in ["FULL TRACEBACK:", "An exception has occurred", "ModuleNotFoundError: gui7", "While running game code:", "uncaught exception"] {
            assert!(runtime_exception(marker));
        }
        assert!(!runtime_exception("Lint finished. No errors."));
    }
    #[test]
    #[cfg(windows)]
    fn completion_also_reaps_the_owned_background_descendant() {
        use windows_sys::Win32::{Foundation::{CloseHandle, WAIT_OBJECT_0}, System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION, SYNCHRONIZATION_SYNCHRONIZE}};
        let dir = tempfile::tempdir().unwrap();
        let output = run(&mut fixture("descendant"), dir.path(), "Тест", Duration::from_secs(5)).unwrap();
        let pid: u32 = output.lines().find_map(|l| l.strip_prefix("OWNED_CHILD=")).unwrap().parse().unwrap();
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZATION_SYNCHRONIZE, 0, pid);
            if !handle.is_null() { let result = WaitForSingleObject(handle, 2000); CloseHandle(handle); assert_eq!(result, WAIT_OBJECT_0); }
        }
    }
}
