#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod storage;
mod qa_profile;
mod diagnostics;
mod diagnostics_system;
mod profile;
mod engine;
use std::{path::PathBuf, sync::{Arc, Mutex}};
use serde_json::{json, Value};
use tauri::{Manager, State};
use storage::Workspace;

struct Backend { workspace: Arc<Mutex<Workspace>>, runtime: PathBuf, qa_root:Option<PathBuf>, diagnostics:Arc<diagnostics::Diagnostics>,profile:Arc<profile::ProfileManager>,compilers:Arc<std::sync::atomic::AtomicUsize> }
struct CompilerJob(Arc<std::sync::atomic::AtomicUsize>);
impl Drop for CompilerJob{fn drop(&mut self){self.0.fetch_sub(1,std::sync::atomic::Ordering::SeqCst);}}

// Only a validated isolated QA profile bypasses the native folder dialog.
// Ordinary launches retain the real folder picker; payload cannot set this path.
fn qa_build_output(operation:&str,root:Option<&PathBuf>)->Option<PathBuf>{
    if operation=="build" {root.map(|root|root.join("ui-build"))} else {None}
}
fn qa_backup_directory(operation:&str,root:Option<&PathBuf>)->Option<PathBuf>{if matches!(operation,"backup"|"backup-raw"){root.map(|root|root.join("backups"))}else{None}}

#[cfg(test)]
mod build_qa_tests {
    use super::*;
    #[test]
    fn output_override_is_only_for_isolated_qa_builds(){
        let root=PathBuf::from("bounded-qa");
        assert_eq!(qa_build_output("build",Some(&root)),Some(root.join("ui-build")));
        assert_eq!(qa_build_output("build",None),None);
        assert_eq!(qa_build_output("preview",Some(&root)),None);
        assert_eq!(qa_build_output("load",Some(&root)),None);
    }
    #[test] fn backup_override_is_only_for_explicit_qa_backups(){let root=PathBuf::from("bounded-qa");assert_eq!(qa_backup_directory("backup",Some(&root)),Some(root.join("backups")));assert_eq!(qa_backup_directory("backup",None),None);assert_eq!(qa_backup_directory("export",Some(&root)),None);assert_eq!(qa_backup_directory("load",Some(&root)),None);}
    #[test]
    #[cfg(windows)]
    fn worker_paths_use_node_compatible_disk_paths_without_reinterpreting_reserved_names(){
        let normal=PathBuf::from(r"E:\Игры с пробелами\native");
        let extended=PathBuf::from(r"\\?\E:\Игры с пробелами\native");
        assert_eq!(dunce::simplified(&extended),normal.as_path());
        assert_eq!(dunce::simplified(&normal),normal.as_path());
        let reserved=PathBuf::from(r"\\?\C:\COM1");
        assert_eq!(dunce::simplified(&reserved),reserved.as_path());
    }
}

fn compiler(runtime: &PathBuf, root: &PathBuf, operation: &str, payload: &Value, target_output:Option<PathBuf>) -> Result<Value,String> {
    storage::validate(&payload["project"])?;
    let platform=payload["platform"].as_str().unwrap_or("windows");
    if !["windows","linux","macos","android"].contains(&platform) { return Err("Неизвестная платформа сборки".into()); }
    let output=if let Some(output)=target_output {dunce::simplified(&output).to_path_buf()} else if operation=="build" {
        match rfd::FileDialog::new().set_title("Папка готовой игры").pick_folder() { Some(p)=>p,None=>return Ok(json!({"canceled":true})) }
    } else {root.join("preview")};
    engine::execute(runtime, root, operation, payload, &output)
}

#[tauri::command]
async fn desktop(app:tauri::AppHandle,state:State<'_,Backend>,operation:String,payload:Value)->Result<Value,String>{
    if operation=="qa-context" {return state.qa_root.as_ref().map(|root|json!({"isolatedQa":true,"root":root,"runtimePath":state.runtime,"workerRuntimePath":dunce::simplified(&state.runtime)})).ok_or("QA mode is not enabled".into());}
    let workspace=state.workspace.clone();let runtime=state.runtime.clone();let qa_root=state.qa_root.clone();let diagnostics=state.diagnostics.clone();let profile=state.profile.clone();let compilers=state.compilers.clone();
    #[cfg(windows)]let owner=app.get_webview_window("main").and_then(|w|w.hwnd().ok()).map(|hwnd|hwnd.0 as isize).unwrap_or(0);
    #[cfg(not(windows))]let owner=0_isize;
    let log=diagnostics.clone();let logged_operation=operation.clone();let started=std::time::Instant::now();
    let result=tauri::async_runtime::spawn_blocking(move||{
        if operation=="profile-status"{return Ok(profile.status());}
        if operation=="profile-ui-state"{return Ok(profile.pending_ui()?.unwrap_or(Value::Null));}
        if operation=="profile-ui-ack"{return profile.acknowledge_ui(payload["id"].as_str().ok_or("Нет идентификатора профиля")?);}
        if operation=="profile-cancel"{return profile.cancel();}
        if operation=="profile-rollback"{return profile.rollback();}
        if operation=="profile-restart"{
            if profile.status()["phase"]=="copying"{return Err("Сначала дождитесь переноса или отмените его.".into());}
            if profile.status()["restartRequired"]!=true&&profile.boot_error.is_none()&&profile.pending_ui()?.is_none(){return Err("Перезапуск профиля сейчас не требуется.".into());}
            if let Some(root)=qa_root.as_ref(){std::fs::write(root.join("profile-restart-request.json"),json!({"isolatedQa":true,"restartRequired":true}).to_string()).map_err(|e|e.to_string())?;return Ok(json!({"isolatedQa":true,"restartRequired":true}));}
            app.restart();
        }
        if operation=="profile-choose"{
            let parent=if let Some(root)=qa_root.as_ref(){let parent=root.join("profile-destinations");std::fs::create_dir_all(&parent).map_err(|e|e.to_string())?;parent}else{match rfd::FileDialog::new().set_title("Где хранить библиотеку и кэш Истории").pick_folder(){Some(parent)=>parent,None=>return Ok(json!({"canceled":true}))}};
            return profile.choose(&parent);
        }
        if operation=="profile-start"{
            let guard=workspace.lock().map_err(|e|e.to_string())?;
            if compilers.load(std::sync::atomic::Ordering::SeqCst)>0{return Err("Дождитесь завершения сборки игры, затем повторите перенос.".into());}
            return profile.transfer(&guard,payload["planId"].as_str().ok_or("Папка не выбрана")?,&payload["ui"]);
        }
        if operation=="renderer-error"{diagnostics.renderer(&payload);return Ok(json!({"recorded":true}));}
        if operation=="diagnostics"{return Ok(diagnostics.snapshot(&runtime));}
        if operation=="copy-diagnostics"{
            let report=diagnostics.snapshot(&runtime);let text=report["report"].as_str().ok_or("Отчёт недоступен")?;
            if let Some(root)=qa_root.as_ref(){
                // Own QA must not overwrite the owner's OS clipboard.
                std::fs::write(root.join("diagnostics-copy.txt"),text).map_err(|_|"Не удалось записать QA-копию отчёта")?;
                return Ok(json!({"copied":true,"isolatedQa":true}));
            }
            diagnostics_system::copy_report(text,owner)?;return Ok(json!({"copied":true}));
        }
        if operation=="open-logs"{
            let path=diagnostics.logs()?;
            if let Some(root)=qa_root.as_ref(){
                // Verify exact dispatch without opening an owner Explorer window.
                std::fs::write(root.join("diagnostics-open.json"),json!({"isolatedQa":true,"path":dunce::simplified(&path)}).to_string()).map_err(|_|"Не удалось записать QA-путь журнала")?;
                return Ok(json!({"opened":true,"isolatedQa":true}));
            }
            diagnostics_system::open_logs(&path,owner)?;return Ok(json!({"opened":true}));
        }
        if operation=="audit-media" {
            // File system checks run without holding the save/library mutex.
            let audit=workspace.lock().map_err(|e|e.to_string())?.audit_snapshot();
            let (result,files)=audit.run(&payload)?;
            for file in files{app.asset_protocol_scope().allow_file(file).map_err(|e|e.to_string())?;}
            return Ok(result);
        }
        if operation=="backup"||operation=="backup-raw" {
            let raw=operation=="backup-raw";
            let bytes=if raw {payload["raw"].as_str().ok_or("Нет исходного черновика")?.as_bytes().to_vec()}else{
                let guard=workspace.lock().map_err(|e|e.to_string())?;
                let project=if payload["referencesOnly"].as_bool().unwrap_or(false){storage::reference_project(&payload["project"])?}else{guard.portable_project(&payload["project"])?};
                serde_json::to_vec_pretty(&project).map_err(|e|e.to_string())?
            };
            let name=if raw{"istoriya-draft-original.json"}else{"istoriya-recovery.vnproject"};
            let file=if let Some(directory)=qa_backup_directory(&operation,qa_root.as_ref()){
                std::fs::create_dir_all(&directory).map_err(|e|e.to_string())?;
                tempfile::Builder::new().prefix("copy-").tempdir_in(&directory).map_err(|e|e.to_string())?.keep().join(name)
            }else{match rfd::FileDialog::new().set_title("Сохранить резервную копию").set_file_name(name).add_filter(if raw{"Исходный черновик"}else{"Проект История"},&[if raw{"json"}else{"vnproject"}]).save_file(){Some(file)=>file,None=>return Ok(json!({"canceled":true}))}};
            storage::write_recovery_copy(&file,&bytes)?;
            let result=json!({"canceled":false,"filePath":dunce::simplified(&file),"referencesOnly":payload["referencesOnly"].as_bool().unwrap_or(false),"raw":raw});
            if let Some(qa)=&qa_root {std::fs::write(qa.join("ui-backup-result.json"),serde_json::to_vec_pretty(&result).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;}
            return Ok(result);
        }
        if operation=="build"||operation=="preview" {
            let guard=workspace.lock().map_err(|e|e.to_string())?;
            if profile.locked(){return Err("Завершите перенос профиля: перезапустите редактор или отмените перенос.".into());}
            compilers.fetch_add(1,std::sync::atomic::Ordering::SeqCst);let _job=CompilerJob(compilers.clone());
            let root=guard.root.clone();let mut payload=payload;payload["project"]=guard.compiler_project(&payload["project"])?;drop(guard);
            let result=compiler(&runtime,&root,&operation,&payload,qa_build_output(&operation,qa_root.as_ref()))?;
            if operation=="build" {if let Some(qa)=&qa_root {
                std::fs::write(qa.join("ui-build-result.json"),serde_json::to_vec_pretty(&json!({"isolatedQa":true,"projectId":payload["project"]["id"],"build":result})).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
            }}
            return Ok(result);
        }
        let mut guard=workspace.lock().map_err(|e|e.to_string())?;
        if profile.locked()&&!matches!(operation.as_str(),"load"|"portable"|"confirm-close"){return Err("Завершите перенос профиля: перезапустите редактор или отмените перенос.".into());}
        if profile.boot_error.is_some(){return Err("Выбранный профиль недоступен. Повторите запуск или выберите предыдущий профиль.".into());}
        let result=guard.dispatch(&operation,payload)?;
        if operation=="load"||operation=="open" {
            // No wildcard directories: only canonical declared media files.
            for file in &guard.media_files {app.asset_protocol_scope().allow_file(file).map_err(|e|e.to_string())?;}
        }
        Ok(result)
    }).await.map_err(|e|e.to_string()).and_then(|result|result);
    if !["renderer-error","diagnostics","profile-status","profile-ui-state"].contains(&logged_operation.as_str()) {log.record(&logged_operation,started.elapsed().as_millis().min(u64::MAX as u128) as u64,&result);}
    result
}

fn main(){
    let args:Vec<_>=std::env::args().collect();
    let mut context:tauri::Context<tauri::Wry>=tauri::generate_context!();
    if args.get(1).map(String::as_str)==Some("--verify-bundle") {
        let checked=(||->Result<(),String>{
            let output=PathBuf::from(args.get(2).ok_or("Не указан файл проверки сборки")?);
            if tauri::is_dev(){return Err("Release EXE использует devUrl: собирайте через npm run desktop".into());}
            if context.assets().get(&"index.html".into()).is_none(){return Err("В EXE не встроен интерфейс".into());}
            let runtime=std::env::current_exe().map_err(|e|e.to_string())?.parent().ok_or("Нет папки приложения")?.join("native");
            for file in ["node.exe","runtime/native-worker.mjs","runtime/compiler.mjs","renpy-sdk/renpy.py"]{if !runtime.join(file).is_file(){return Err(format!("Нет компонента сборки: {file}"));}}
            std::fs::write(output,serde_json::to_vec_pretty(&json!({"standalone":true,"embeddedUi":true,"runtimeReady":true,"version":env!("CARGO_PKG_VERSION")})).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
            Ok(())
        })();
        if let Err(error)=checked{if let Some(output)=args.get(2){let _=std::fs::write(output,json!({"standalone":false,"error":error}).to_string());}std::process::exit(2);}
        return;
    }
    if args.get(1).map(String::as_str)==Some("--verify-native") {
        let result=(||->Result<(),String>{
            let fixture=PathBuf::from(args.get(2).ok_or("Не указан тестовый проект")?);
            let output=PathBuf::from(args.get(3).ok_or("Не указана папка результатов")?);
            std::fs::create_dir_all(&output).map_err(|e|e.to_string())?;
            let project:Value=serde_json::from_slice(&std::fs::read(&fixture).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
            storage::validate(&project)?;
            let profile=tempfile::Builder::new().prefix("native-test-").tempdir_in(&output).map_err(|e|e.to_string())?;
            let mut workspace=Workspace::open(profile.path().into(),false).map_err(|e|e.to_string())?;
            workspace.dispatch("flush",json!({"istoriya-project-v2":serde_json::to_string(&project).map_err(|e|e.to_string())?,"istoriya-project-library-v1":serde_json::to_string(&json!([project])).map_err(|e|e.to_string())?}))?;
            let mut reopened=Workspace::open(profile.path().into(),false).map_err(|e|e.to_string())?;
            let runtime=std::env::current_exe().map_err(|e|e.to_string())?.parent().ok_or("Нет папки приложения")?.join("native");
            reopened.set_public_assets(runtime.join("public"));
            let loaded=reopened.dispatch("load",Value::Null)?;
            let restored:Value=serde_json::from_str(loaded["istoriya-project-v2"].as_str().ok_or("Проект не восстановлен")?).map_err(|e|e.to_string())?;
            // Explicit verification hydrates only this project's copy, not load.
            if reopened.portable_project(&restored)?!=project{return Err("Проект изменился после сохранения и открытия".into());}
            let prepared=reopened.compiler_project(&restored)?;
            let built=compiler(&runtime,&profile.path().into(),"build",&json!({"project":prepared,"platform":"windows"}),Some(output.join("game")))?;
            std::fs::write(output.join("result.json"),serde_json::to_vec_pretty(&json!({"nativeStorage":true,"reopenEqualsOriginal":true,"lazyMediaLoad":true,"loadPayloadBytes":loaded.to_string().len(),"build":built})).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
            Ok(())
        })();
        if let Err(error)=result {
            if let Some(folder)=args.get(3){let _=std::fs::write(PathBuf::from(folder).join("error.txt"),error);}
            std::process::exit(1);
        }
        return;
    }
    let qa=match qa_profile::QaProfile::from_args(&args){Ok(qa)=>qa,Err(error)=>{eprintln!("{error}");std::process::exit(2);}};
    if let Some(qa)=&qa {qa.prepare_environment();}
    // Resolve the profile before creating any WebView/cache, including ordinary
    // launches. Preserve the original default data directory when not migrated.
    for window in &mut context.config_mut().app.windows{window.create=false;}
    let mut builder=tauri::Builder::default();
    // QA must not contact or activate an already running owner instance.
    if qa.is_none(){builder=builder.plugin(tauri_plugin_single_instance::init(|app,_,_|{if let Some(w)=app.get_webview_window("main"){let _=w.unminimize();let _=w.set_focus();}}));}
    builder.setup(move |app|{
          let default=if let Some(qa)=&qa{qa.workspace()}else{app.path().app_data_dir()?};
          let default_view=if let Some(qa)=&qa{qa.webview()}else{std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").map(PathBuf::from).unwrap_or(app.path().app_local_data_dir()?)};
          let locator=if let Some(qa)=&qa{qa.profile.join("profile-location.json")}else{default.join("profile-location.json")};
          let external=if qa.is_some(){None}else{std::env::var_os("ISTORIYA_DATA_DIR").map(PathBuf::from)};
          let profile=Arc::new(profile::ProfileManager::boot(default,default_view,locator,external));let root=profile.workspace.clone();
          // Process-local only, never registry/user environment modification.
          std::env::set_var("WEBVIEW2_USER_DATA_FOLDER",&profile.webview);
          let runtime=if cfg!(debug_assertions){PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.artifacts/native-resources")}else{app.path().resource_dir()?.join("native")};
          let diagnostics=Arc::new(diagnostics::Diagnostics::new(root.clone()));
          diagnostics.record("startup",0,&Ok(Value::Null));
          let panic_diagnostics=diagnostics.clone();let previous_hook=std::panic::take_hook();
          std::panic::set_hook(Box::new(move|info|{panic_diagnostics.panic();previous_hook(info);}));
          let opened=if qa.is_some()||profile.boot_error.is_some(){Workspace::open(root,false)}else{Workspace::new(root)};
          if let Err(error)=&opened{diagnostics.record("startup",0,&Err(error.to_string()));}
          let mut workspace=opened?;
          workspace.set_public_assets(runtime.join("public"));
          if profile.boot_error.is_none(){
            let preview_root=profile.workspace.clone();
            let preview_diagnostics=diagnostics.clone();
            // Auxiliary cache housekeeping must not hold the author-save mutex
            // or make a readable library unavailable if cache validation fails.
            let _=std::thread::Builder::new().name("preview-recovery".into()).spawn(move||{
              let started=std::time::Instant::now();
              let result=engine::reap_abandoned(&preview_root).map(|n|json!({"removed":n}));
              preview_diagnostics.record("preview-cleanup",started.elapsed().as_millis().min(u64::MAX as u128) as u64,&result);
            });
          }
          app.manage(Backend{workspace:Arc::new(Mutex::new(workspace)),runtime,qa_root:qa.as_ref().map(|qa|qa.root.clone()),diagnostics,profile:profile.clone(),compilers:Arc::new(std::sync::atomic::AtomicUsize::new(0))});
          let window=tauri::WebviewWindowBuilder::from_config(app,&app.config().app.windows[0])?.data_directory(profile.webview.clone());
          if qa.is_some(){window.title("История · QA (изолированный профиль)").build()?;}else{window.build()?;}
          Ok(())
      })
      .on_window_event(|window,event|{if matches!(event,tauri::WindowEvent::Destroyed){if let Some(backend)=window.try_state::<Backend>(){backend.diagnostics.record("shutdown",0,&Ok(Value::Null));}}})
      .invoke_handler(tauri::generate_handler![desktop])
      .run(context).expect("Не удалось запустить Историю");
}
