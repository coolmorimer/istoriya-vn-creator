//! Bounded local diagnostics. Never serialize RPC payloads or error messages:
//! those can contain story text, media, credentials and owner paths.
use std::{collections::VecDeque,fs,io::{Read,Write},path::{Path,PathBuf},sync::Mutex,time::{SystemTime,UNIX_EPOCH}};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};

const FILE_BYTES:u64=256*1024;
const EVENTS:usize=64;
const OPERATIONS:&[&str]=&["load","flush","folder","create","open","export","portable","audit-media","backup","backup-raw","build","preview","preview-cleanup","confirm-close","startup","shutdown","panic","renderer","copy-diagnostics","open-logs","profile-choose","profile-start","profile-cancel","profile-rollback","profile-restart","profile-ui-ack"];
fn now()->u64{SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis().min(u64::MAX as u128) as u64}
fn fingerprint(message:&str)->String{format!("{:x}",Sha256::digest(message.as_bytes()))}
fn category(message:&str)->&'static str{
 let m=message.chars().take(8192).collect::<String>().to_lowercase();
 if m.contains("os error 112")||m.contains("no space")||m.contains("недостаточно места"){"disk-full"}
 else if m.contains("os error 5")||m.contains("permission")||m.contains("доступ запрещ")||m.contains("read-only"){"permission"}
 else if m.contains("checksum")||m.contains("контрольн")||m.contains("поврежд")||m.contains("json"){"invalid-data"}
 else if m.contains("не найден")||m.contains("not found")||m.contains("ссылк")||m.contains("нет компонента"){"missing-reference"}
 else if m.contains("компонент сборки")||m.contains("worker")||m.contains("ren'py"){"compiler"}
 else{"operation-failed"}
}
fn regular(file:&Path)->Result<(),String>{match fs::symlink_metadata(file){Ok(m) if m.file_type().is_symlink()||!m.is_file()||m.len()>FILE_BYTES=>Err("unsafe-log-file".into()),Ok(_)=>Ok(()),Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(()),Err(e)=>Err(e.to_string())}}
fn prepare(root:&Path)->Result<PathBuf,String>{
 fs::create_dir_all(root).map_err(|e|e.to_string())?;
 let root=root.canonicalize().map_err(|e|e.to_string())?;let logs=root.join("logs");
 if let Ok(meta)=fs::symlink_metadata(&logs){if meta.file_type().is_symlink()||!meta.is_dir(){return Err("unsafe-log-directory".into());}}
 fs::create_dir_all(&logs).map_err(|e|e.to_string())?;
 if logs.canonicalize().map_err(|e|e.to_string())?.parent()!=Some(root.as_path()){return Err("unsafe-log-directory".into());}
 for name in ["editor.jsonl","editor.1.jsonl","editor.2.jsonl"]{regular(&logs.join(name))?;}
 Ok(logs)
}
fn append(root:&Path,line:&[u8])->Result<(),String>{
 let logs=prepare(root)?;let file=logs.join("editor.jsonl");
 if fs::metadata(&file).map(|m|m.len()).unwrap_or(0)+line.len() as u64>FILE_BYTES{
  let older=logs.join("editor.2.jsonl");let previous=logs.join("editor.1.jsonl");
  if older.exists(){fs::remove_file(&older).map_err(|e|e.to_string())?;}
  if previous.exists(){fs::rename(&previous,&older).map_err(|e|e.to_string())?;}
  if file.exists(){fs::rename(&file,&previous).map_err(|e|e.to_string())?;}
 }
 let mut output=fs::OpenOptions::new().create(true).append(true).open(file).map_err(|e|e.to_string())?;
 // Logs are auxiliary OS-buffered writes, not authoring durability checkpoints.
 // A hardware fsync per autosave made a rotation stress-test need minutes on D:.
 output.write_all(line).map_err(|e|e.to_string())
}
fn error_type(value:&Value)->&str{match value.as_str(){Some("TypeError")=>"TypeError",Some("ReferenceError")=>"ReferenceError",Some("SyntaxError")=>"SyntaxError",Some("RangeError")=>"RangeError",Some("DOMException")=>"DOMException",_=>"Error"}}
fn renderer_details(value:&Value)->Value{
 let kind=match value["kind"].as_str(){Some("render")=>"render",Some("bootstrap")=>"bootstrap",Some("unhandled-rejection")=>"unhandled-rejection",_=>"window-error"};
 let frames:Vec<Value>=value["frames"].as_array().into_iter().flatten().take(8).filter_map(|frame|{
  let line=frame["line"].as_u64()?;let column=frame["column"].as_u64()?;
  if line>10_000_000||column>10_000_000{return None;}Some(json!({"source":"app","line":line,"column":column}))
 }).collect();
 let hash=value["fingerprint"].as_str().filter(|s|s.len()==64&&s.bytes().all(|c|c.is_ascii_hexdigit())).unwrap_or("");
 json!({"kind":kind,"errorType":error_type(&value["errorType"]),"frames":frames,"fingerprint":hash})
}
fn safe_event(value:&Value)->Option<Value>{
 let op=value["operation"].as_str()?;
 if !OPERATIONS.contains(&op){return None;}
 let outcome=value["outcome"].as_str()?;if !["ok","error","canceled"].contains(&outcome){return None;}
 let mut event=json!({"at":value["at"].as_u64()?,"operation":op,"outcome":outcome,"durationMs":value["durationMs"].as_u64().unwrap_or(0)});
 if let Some(v)=value.get("renderer"){event["renderer"]=renderer_details(v);}
 if let Some(error)=value.get("error"){
  let kind=match error["category"].as_str(){Some("disk-full")=>"disk-full",Some("permission")=>"permission",Some("invalid-data")=>"invalid-data",Some("missing-reference")=>"missing-reference",Some("compiler")=>"compiler",_=>"operation-failed"};
  let hash=error["fingerprint"].as_str().filter(|s|s.len()==64&&s.bytes().all(|c|c.is_ascii_hexdigit())).unwrap_or("");
  event["error"]=json!({"category":kind,"fingerprint":hash});
 }
 Some(event)
}
struct Journal{events:VecDeque<Value>,write_error:bool}
pub struct Diagnostics{root:PathBuf,journal:Mutex<Journal>}
impl Diagnostics{
 pub fn new(root:PathBuf)->Self{
  let mut events=VecDeque::new();
  if let Ok(logs)=prepare(&root){for name in ["editor.2.jsonl","editor.1.jsonl","editor.jsonl"]{
   let file=logs.join(name);
   if let Ok(input)=fs::File::open(&file){if fs::metadata(&file).map(|m|m.len()<=FILE_BYTES).unwrap_or(false){
    let mut text=String::new();if input.take(FILE_BYTES).read_to_string(&mut text).is_ok(){for line in text.lines(){if let Some(event)=serde_json::from_str(line).ok().and_then(|v|safe_event(&v)){events.push_back(event);while events.len()>EVENTS{events.pop_front();}}}}
   }}
  }}
  Self{root,journal:Mutex::new(Journal{events,write_error:false})}
 }
 pub fn record(&self,operation:&str,duration_ms:u64,result:&Result<Value,String>){
  let operation=if OPERATIONS.contains(&operation){operation}else{"unknown"};
  let outcome=match result{Err(_)=>"error",Ok(v) if v["canceled"].as_bool()==Some(true)=>"canceled",_=>"ok"};
  let mut event=json!({"at":now(),"operation":operation,"outcome":outcome,"durationMs":duration_ms});
  if let Err(error)=result{event["error"]=json!({"category":category(error),"fingerprint":fingerprint(error)});}
  self.push(event);
 }
 pub fn renderer(&self,payload:&Value){self.push(json!({"at":now(),"operation":"renderer","outcome":"error","durationMs":0,"renderer":renderer_details(payload)}));}
 pub fn panic(&self){
  // A panic raised while logging must not recursively wait for its own mutex.
  if let Ok(mut journal)=self.journal.try_lock(){let event=json!({"at":now(),"operation":"panic","outcome":"error","durationMs":0});journal.events.push_back(event.clone());while journal.events.len()>EVENTS{journal.events.pop_front();}let mut line=event.to_string().into_bytes();line.push(b'\n');journal.write_error=append(&self.root,&line).is_err();}
 }
 fn push(&self,event:Value){
  // Poisoned logging state must never poison project saving/recovery.
  let mut journal=self.journal.lock().unwrap_or_else(|e|e.into_inner());
  journal.events.push_back(event.clone());while journal.events.len()>EVENTS{journal.events.pop_front();}
  let mut line=event.to_string().into_bytes();line.push(b'\n');journal.write_error=append(&self.root,&line).is_err();
 }
 pub fn logs(&self)->Result<PathBuf,String>{prepare(&self.root).map_err(|_|"Не удалось открыть журнал. Проверьте свободное место и права на папку профиля.".into())}
 pub fn snapshot(&self,runtime:&Path)->Value{
  let journal=self.journal.lock().unwrap_or_else(|e|e.into_inner());
  let events:Vec<_>=journal.events.iter().cloned().collect();
  let ready=prepare(&self.root).is_ok();
  let components=json!({"node":runtime.join("node.exe").is_file(),"compiler":runtime.join("runtime/native-worker.mjs").is_file(),"renpy":runtime.join("renpy-sdk/renpy.py").is_file()});
  let free=super::diagnostics_system::free_bytes(&self.root);
  let report=json!({"format":"istoriya-diagnostics-1","version":env!("CARGO_PKG_VERSION"),"os":std::env::consts::OS,"architecture":std::env::consts::ARCH,"collectedAt":now(),"journal":{"persisted":ready&&!journal.write_error,"maxFileBytes":FILE_BYTES,"maxFiles":3,"recentEvents":events.len()},"storage":{"freeBytes":free},"runtime":components,"events":events});
  json!({"version":env!("CARGO_PKG_VERSION"),"os":std::env::consts::OS,"architecture":std::env::consts::ARCH,"storagePath":dunce::simplified(&self.root),"freeBytes":free,"journalAvailable":ready&&!journal.write_error,"logsAvailable":ready,"runtime":components,"report":serde_json::to_string_pretty(&report).unwrap_or_default()})
 }
}

#[cfg(test)]mod tests{
 use super::*;
 #[test]fn errors_are_fingerprinted_not_saved_and_report_survives_reopen(){
  let dir=tempfile::tempdir().unwrap();let diagnostics=Diagnostics::new(dir.path().into());let secret="SECRET STORY data:image/png;base64,abc C:\\Users\\private token=123";
  diagnostics.record("flush",12,&Err(format!("Permission denied {secret}")));
  diagnostics.renderer(&json!({"kind":"render","errorType":"TypeError","message":secret,"frames":[{"line":12,"column":7,"source":secret}],"extra":secret}));
  let raw=fs::read_to_string(dir.path().join("logs/editor.jsonl")).unwrap();assert!(!raw.contains(secret));assert!(!raw.contains("private"));assert!(raw.contains("permission"));assert!(raw.contains("TypeError"));
  let reopened=Diagnostics::new(dir.path().into()).snapshot(dir.path());let report=reopened["report"].as_str().unwrap();assert!(!report.contains(secret));assert!(!report.contains(dir.path().to_str().unwrap()));assert_eq!(serde_json::from_str::<Value>(report).unwrap()["events"].as_array().unwrap().len(),2);
 }
 #[test]fn logging_failure_is_visible_and_recoverable_without_losing_memory(){
  let dir=tempfile::tempdir().unwrap();fs::write(dir.path().join("logs"),"not a directory").unwrap();let diagnostics=Diagnostics::new(dir.path().into());diagnostics.record("flush",0,&Ok(Value::Null));let report=diagnostics.snapshot(dir.path());assert_eq!(report["journalAvailable"],false);assert!(report["report"].as_str().unwrap().contains("flush"));fs::rename(dir.path().join("logs"),dir.path().join("blocked-log-backup")).unwrap();diagnostics.record("load",0,&Ok(Value::Null));assert_eq!(diagnostics.snapshot(dir.path())["journalAvailable"],true);
 }
 #[test]fn journals_rotate_with_fixed_size_and_ignore_tampered_fields(){
  let dir=tempfile::tempdir().unwrap();let diagnostics=Diagnostics::new(dir.path().into());
  for _ in 0..3{fs::write(dir.path().join("logs/editor.jsonl"),vec![b' ';FILE_BYTES as usize]).unwrap();diagnostics.record("flush",1,&Err("a".repeat(1024)));}
  let entries:Vec<_>=fs::read_dir(dir.path().join("logs")).unwrap().map(|v|v.unwrap()).collect();assert_eq!(entries.len(),3);for e in entries{assert!(e.metadata().unwrap().len()<=FILE_BYTES);}
  let tampered=json!({"at":1,"operation":"flush","outcome":"error","durationMs":0,"secret":"DO NOT COPY","error":{"category":"SECRET","fingerprint":"SECRET"}}).to_string()+"\n";
  fs::write(dir.path().join("logs/editor.jsonl"),tampered.repeat(70)).unwrap();
  let reopened=Diagnostics::new(dir.path().into()).snapshot(dir.path());let report=reopened["report"].as_str().unwrap();assert!(!report.contains("DO NOT COPY"));assert!(!report.contains("SECRET"));assert_eq!(serde_json::from_str::<Value>(report).unwrap()["events"].as_array().unwrap().len(),64);
 }
 #[test]fn unsafe_log_file_is_not_overwritten(){let dir=tempfile::tempdir().unwrap();fs::create_dir(dir.path().join("logs")).unwrap();fs::create_dir(dir.path().join("logs/editor.jsonl")).unwrap();let diagnostics=Diagnostics::new(dir.path().into());diagnostics.record("load",0,&Ok(Value::Null));assert_eq!(diagnostics.snapshot(dir.path())["journalAvailable"],false);assert!(dir.path().join("logs/editor.jsonl").is_dir());}
 #[test]fn oversized_logs_are_preserved_without_unbounded_reads_or_truncation(){let dir=tempfile::tempdir().unwrap();fs::create_dir(dir.path().join("logs")).unwrap();let file=dir.path().join("logs/editor.jsonl");fs::write(&file,vec![b'x';FILE_BYTES as usize+1]).unwrap();let diagnostics=Diagnostics::new(dir.path().into());diagnostics.record("load",0,&Ok(Value::Null));assert_eq!(diagnostics.snapshot(dir.path())["journalAvailable"],false);assert_eq!(fs::metadata(file).unwrap().len(),FILE_BYTES+1);}
 #[test]fn renderer_fields_are_whitelisted_and_bounded(){let payload=json!({"kind":"secret","errorType":"secret","fingerprint":"secret","frames":(0..12).map(|_|json!({"line":1,"column":2,"secret":"x"})).collect::<Vec<_>>()});let v=renderer_details(&payload);assert_eq!(v["kind"],"window-error");assert_eq!(v["errorType"],"Error");assert_eq!(v["frames"].as_array().unwrap().len(),8);assert_eq!(v["fingerprint"],"");assert!(!v.to_string().contains("secret"));}
}
