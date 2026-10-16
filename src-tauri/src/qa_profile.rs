// Explicit developer-only launch mode. Never reuse the owner's app data or migrate it.
use std::{fs,io::Write,path::PathBuf};
use serde_json::{json,Value};

pub struct QaProfile {pub root:PathBuf,pub profile:PathBuf}
impl QaProfile {
 pub fn from_args(args:&[String])->Result<Option<Self>,String>{
    let mode=args.get(1).map(String::as_str);
    if !matches!(mode,Some("--verify-ui"|"--verify-ui-resume")){return Ok(None);}
    if args.len()!=3{return Err("QA: укажите одну существующую папку результатов".into());}
    let root=PathBuf::from(&args[2]).canonicalize().map_err(|e|format!("QA: {e}"))?;
    if !root.is_dir(){return Err("QA: нужна папка результатов".into());}
    let manifest=root.join("ui-profile.json");
    let profile=if mode==Some("--verify-ui-resume") {
      let value:Value=serde_json::from_slice(&fs::read(&manifest).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
      let profile=PathBuf::from(value["profile"].as_str().ok_or("QA: нет тестового профиля")?).canonicalize().map_err(|e|e.to_string())?;
      if profile.parent()!=Some(root.as_path())||!profile.file_name().unwrap_or_default().to_string_lossy().starts_with("ui-profile-") {return Err("QA: профиль вне папки результатов".into());}
      let marker=fs::read_to_string(profile.join("qa-profile-marker")).map_err(|e|e.to_string())?;
      if marker!=value["marker"].as_str().unwrap_or(""){return Err("QA: профиль не создан этим проверочным режимом".into());}
      profile
    } else {
      // create_new also prevents overwriting an earlier run's manifest.
      let mut output=fs::OpenOptions::new().write(true).create_new(true).open(&manifest).map_err(|e|e.to_string())?;
      let profile=tempfile::Builder::new().prefix("ui-profile-").tempdir_in(&root).map_err(|e|e.to_string())?.keep();
      let marker=profile.file_name().unwrap().to_string_lossy().to_string();
      fs::write(profile.join("qa-profile-marker"),&marker).map_err(|e|e.to_string())?;
      output.write_all(&serde_json::to_vec_pretty(&json!({"profile":profile,"marker":marker})).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
      output.sync_all().map_err(|e|e.to_string())?;
      profile
    };
    Ok(Some(Self{root,profile}))
 }
 pub fn workspace(&self)->PathBuf {self.profile.join("workspace")}
 pub fn webview(&self)->PathBuf {self.profile.join("webview")}
 pub fn prepare_environment(&self) {
    // Child-process environment only: no registry or system settings are changed.
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER",self.webview());
 }
}

#[cfg(test)] mod tests {
 use super::*;
 use std::path::Path;
 fn args(mode:&str,path:&Path)->Vec<String>{vec!["istoriya".into(),mode.into(),path.to_string_lossy().into()]}
 #[test] fn fresh_profile_and_explicit_resume_are_bounded_and_non_overwriting(){
  let dir=tempfile::tempdir().unwrap();let qa=QaProfile::from_args(&args("--verify-ui",dir.path())).unwrap().unwrap();
  assert_eq!(qa.profile.parent(),Some(dir.path().canonicalize().unwrap().as_path()));
  assert!(QaProfile::from_args(&args("--verify-ui",dir.path())).is_err());
  let resumed=QaProfile::from_args(&args("--verify-ui-resume",dir.path())).unwrap().unwrap();assert_eq!(qa.profile,resumed.profile);
  fs::write(qa.profile.join("qa-profile-marker"),"wrong").unwrap();assert!(QaProfile::from_args(&args("--verify-ui-resume",dir.path())).is_err());
 }
 #[test] fn normal_launch_does_not_activate_qa(){assert!(QaProfile::from_args(&["istoriya".into()]).unwrap().is_none());}
 #[test] fn resume_rejects_an_external_profile(){
  let root=tempfile::tempdir().unwrap();let outside=tempfile::tempdir().unwrap();fs::write(root.path().join("ui-profile.json"),json!({"profile":outside.path(),"marker":"x"}).to_string()).unwrap();
  assert!(QaProfile::from_args(&args("--verify-ui-resume",root.path())).is_err());
 }
}
