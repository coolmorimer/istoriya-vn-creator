use std::{collections::{HashMap,HashSet},fs,path::{Path,PathBuf},io::{Read,Write},time::SystemTime};
use base64::{engine::general_purpose::STANDARD,Engine};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};

const KEYS:[&str;3]=["istoriya-project-v2","istoriya-project-library-v1","istoriya-project-recovery-v1"];
const MEDIA:[&str;9]=["source","portrait","background","icon","cursor","dialogueBackground","mainMenuBackground","choiceButton","choiceButtonHover"];
pub fn safe_id(project:&Value)->String {let id:String=project["id"].as_str().unwrap_or("project").chars().filter(|c|c.is_ascii_alphanumeric()||*c=='-'||*c=='_').take(100).collect();if id.is_empty(){"project".into()}else{id}}
pub fn validate(p:&Value)->Result<(),String>{
    if !p["scenes"].is_object()||!p["meta"].is_object(){return Err("Повреждённый файл проекта".into());}
    if p["schemaVersion"].as_u64().unwrap_or(2)>6{return Err("Нужна более новая версия редактора".into());}
    for s in p["scenes"].as_object().unwrap().values(){if !s.is_object()||!s["actions"].is_array(){return Err("Повреждена сцена проекта".into());}}
    Ok(())
}
fn read_json(file:&Path)->Result<Value,String>{
    match fs::read(file).ok().and_then(|b|serde_json::from_slice(&b).ok()){
        Some(v)=>Ok(v),None=>fs::read(file.with_extension("json.bak")).ok().and_then(|b|serde_json::from_slice(&b).ok()).ok_or_else(||format!("Не удалось прочитать {} и резервную копию. Файлы сохранены.",file.display()))
    }
}
fn atomic(file:&Path,value:&Value)->Result<(),String>{
    atomic_bytes(file,&serde_json::to_vec(value).map_err(|e|e.to_string())?)
}
fn writable_backup(file:&Path)->Result<(),String>{
    let mut permissions=fs::metadata(file).map_err(|e|e.to_string())?.permissions();
    #[cfg(unix)] {use std::os::unix::fs::PermissionsExt;permissions.set_mode(permissions.mode()|0o200);}
    #[cfg(not(unix))] permissions.set_readonly(false);
    fs::set_permissions(file,permissions).map_err(|e|e.to_string())
}
fn atomic_bytes(file:&Path,bytes:&[u8])->Result<(),String>{
    atomic_bytes_checked(file,bytes,|_|Ok(()))
}
// Checkpoints are a private test seam, not an RPC/environment fault switch.
// Both documents are staged and synced before replacing either visible file.
fn atomic_bytes_checked(file:&Path,bytes:&[u8],mut checkpoint:impl FnMut(&str)->Result<(),String>)->Result<(),String>{
    let root=file.parent().ok_or("Не задана папка")?;fs::create_dir_all(root).map_err(|e|e.to_string())?;
    let mut temp=tempfile::NamedTempFile::new_in(root).map_err(|e|e.to_string())?;
    temp.write_all(bytes).map_err(|e|e.to_string())?;
    temp.as_file().sync_all().map_err(|e|e.to_string())?;
    checkpoint("primary-staged")?;
    if let Ok(previous)=fs::read(file){if serde_json::from_slice::<Value>(&previous).is_ok(){
        let backup=file.with_extension("json.bak");
        // Older fs::copy inherited the source's read-only flag. Repair only an
        // identical managed duplicate when the current file is now writable;
        // never override a distinct deliberately protected previous revision.
        if fs::metadata(&backup).map(|m|m.permissions().readonly()).unwrap_or(false)&&!fs::metadata(file).map_err(|e|e.to_string())?.permissions().readonly()&&fs::read(&backup).map(|b|b==previous).unwrap_or(false){writable_backup(&backup)?;}
        let mut staged_backup=tempfile::NamedTempFile::new_in(root).map_err(|e|e.to_string())?;
        staged_backup.write_all(&previous).map_err(|e|e.to_string())?;
        staged_backup.as_file().sync_all().map_err(|e|e.to_string())?;
        checkpoint("backup-staged")?;
        staged_backup.persist(&backup).map_err(|e|e.to_string())?;
        checkpoint("backup-replaced")?;
    }}
    temp.persist(file).map_err(|e|e.to_string())?;checkpoint("primary-replaced")?;Ok(())
}
pub fn write_recovery_copy(file:&Path,bytes:&[u8])->Result<(),String>{atomic_bytes(file,bytes)}
pub fn reference_project(project:&Value)->Result<Value,String>{
    validate(project)?;
    fn check(value:&Value,field:&str)->Result<(),String>{match value{
        Value::String(source) if MEDIA.contains(&field)=>{if source.starts_with("asset:")||source.starts_with("http://asset.localhost/")||source.starts_with("https://asset.localhost/"){return Err("Не удалось восстановить файловые ссылки. Повторите резервное копирование.".into());}},
        Value::Array(values)=>for value in values{check(value,"")?;},Value::Object(values)=>for(key,value)in values{check(value,key)?;},_=>{}
    }Ok(())}check(project,"")?;Ok(project.clone())
}
fn mime(path:&Path)->&'static str {match path.extension().and_then(|s|s.to_str()).unwrap_or("").to_lowercase().as_str(){"png"=>"image/png","jpg"|"jpeg"=>"image/jpeg","webp"=>"image/webp","svg"=>"image/svg+xml","gif"=>"image/gif","bmp"=>"image/bmp","ico"=>"image/x-icon","avif"=>"image/avif","mp3"=>"audio/mpeg","ogg"=>"audio/ogg","wav"=>"audio/wav","ttf"=>"font/ttf","otf"=>"font/otf","woff"=>"font/woff","woff2"=>"font/woff2","mp4"=>"video/mp4",_=>"application/octet-stream"}}
fn media_mime(path:&Path)->Option<&'static str>{
    let known=mime(path);if known!="application/octet-stream"{return Some(known);}
    // Old native releases wrote some supported MIME types as .bin. Inspect at
    // most 1024 bytes, never hydrate the whole legacy file during library load.
    if path.extension().and_then(|s|s.to_str())!=Some("bin"){return None;}
    let mut header=[0_u8;1024];let n=fs::File::open(path).ok()?.read(&mut header).ok()?;let b=&header[..n];
    if b.starts_with(b"\x89PNG\r\n\x1a\n"){Some("image/png")}
    else if b.starts_with(b"\xff\xd8\xff"){Some("image/jpeg")}
    else if b.starts_with(b"GIF87a")||b.starts_with(b"GIF89a"){Some("image/gif")}
    else if b.starts_with(b"BM"){Some("image/bmp")}
    else if b.starts_with(b"\0\0\x01\0"){Some("image/x-icon")}
    else if b.starts_with(b"RIFF")&&b.get(8..12)==Some(b"WEBP"){Some("image/webp")}
    else if b.starts_with(b"RIFF")&&b.get(8..12)==Some(b"WAVE"){Some("audio/wav")}
    else if b.starts_with(b"OggS"){Some("audio/ogg")}
    else if b.starts_with(b"ID3")||(b.len()>1&&b[0]==255&&b[1]&224==224){Some("audio/mpeg")}
    else if b.starts_with(b"\0\x01\0\0"){Some("font/ttf")}
    else if b.starts_with(b"OTTO"){Some("font/otf")}
    else if b.starts_with(b"wOFF"){Some("font/woff")}
    else if b.starts_with(b"wOF2"){Some("font/woff2")}
    else if b.get(4..12)==Some(b"ftypavif"){Some("image/avif")}
    else if b.get(4..8)==Some(b"ftyp"){Some("video/mp4")}
    else if String::from_utf8_lossy(b).trim_start().starts_with("<svg"){Some("image/svg+xml")}
    else{None}
}
fn asset_path(s:&str,base:&Path)->Option<PathBuf>{if s.starts_with("file:"){url::Url::parse(s).ok()?.to_file_path().ok()}else if s.starts_with("./assets/"){Some(base.join(s))}else{None}}
fn within(file:&Path,root:&Path)->bool {
    #[cfg(windows)] {
      let file:Vec<_>=file.components().collect();let root:Vec<_>=root.components().collect();
      file.len()>=root.len()&&file.iter().zip(root.iter()).all(|(a,b)|a.as_os_str().to_string_lossy().to_lowercase()==b.as_os_str().to_string_lossy().to_lowercase())
    }
    #[cfg(not(windows))] {file.starts_with(root)}
}
fn resolve_media(source:&str,base:&Path,allowed:&[PathBuf],public:Option<&Path>)->Result<Option<PathBuf>,String>{
    if source.is_empty()||source.starts_with("data:"){return Ok(None);}
    let file=asset_path(source,base).ok_or("Неизвестная ссылка на ресурс. Загрузите файл заново.")?;
    let resolved=file.canonicalize().or_else(|error|if source.starts_with("./assets/"){public.map(|p|p.join(source).canonicalize()).unwrap_or(Err(error))}else{Err(error)})
      .map_err(|_|format!("Ресурс не найден: {}. Загрузите файл заново.",file.display()))?;
    if !allowed.iter().any(|p|within(&resolved,p)){return Err("Ресурс находится вне папок проекта. Импортируйте файл заново.".into());}
    if !resolved.is_file()||media_mime(&resolved).is_none(){return Err("Неподдерживаемый файл ресурса. Выберите изображение, звук или шрифт.".into());}
    Ok(Some(resolved))
}
fn link_media(value:&mut Value,field:&str,base:&Path,allowed:&[PathBuf],public:Option<&Path>,files:&mut HashSet<PathBuf>,cache:&mut HashMap<String,Option<PathBuf>>){
    match value {
      Value::String(source) if MEDIA.contains(&field)=>{
        let resolved=cache.entry(source.clone()).or_insert_with(||resolve_media(source,base,allowed,public).ok().flatten());
        if let Some(file)=resolved {if let Ok(url)=url::Url::from_file_path(dunce::simplified(file)){*source=url.to_string();files.insert(file.clone());}}
      },
      Value::Array(a)=>for v in a{link_media(v,"",base,allowed,public,files,cache);},
      Value::Object(o)=>for(k,v)in o{link_media(v,k,base,allowed,public,files,cache);},_=>{}
    }
}
fn file_digest(file:&Path)->Result<String,String>{let mut input=fs::File::open(file).map_err(|e|e.to_string())?;let mut hasher=Sha256::new();let mut buffer=[0_u8;65536];loop{let n=input.read(&mut buffer).map_err(|e|e.to_string())?;if n==0{break;}hasher.update(&buffer[..n]);}Ok(format!("{:x}",hasher.finalize()))}
fn verify_managed(file:&Path,base:&Path,verified:&mut HashSet<PathBuf>)->Result<(),String>{
    if verified.contains(file){return Ok(());}
    let Ok(cache)=base.join("assets").canonicalize() else{return Ok(());};
    let stem=file.file_stem().and_then(|s|s.to_str()).unwrap_or("");
    if within(file,&cache)&&file.components().count()==cache.components().count()+1&&stem.len()==64&&stem.chars().all(|c|c.is_ascii_hexdigit()){
        if !file_digest(file)?.eq_ignore_ascii_case(stem){return Err(format!("Кэш ресурса повреждён: {}. Откройте «Ресурсы → Проверить и восстановить файлы» и выберите исходный файл заново.",file.display()));}
        verified.insert(file.into());
    }Ok(())
}
fn prepare_media(value:&mut Value,field:&str,base:&Path,allowed:&[PathBuf],public:Option<&Path>,verified:&mut HashSet<PathBuf>)->Result<(),String>{
    match value {
      Value::String(source) if MEDIA.contains(&field)=>{
        if let Some(file)=resolve_media(source,base,allowed,public)?{verify_managed(&file,base,verified)?;*source=url::Url::from_file_path(dunce::simplified(&file)).map_err(|_|"Неизвестный путь ресурса")?.to_string();}
      },
      Value::Array(a)=>for v in a{prepare_media(v,"",base,allowed,public,verified)?;},
      Value::Object(o)=>for(k,v)in o{prepare_media(v,k,base,allowed,public,verified)?;},_=>{}
    }Ok(())
}
fn hydrate(value:&mut Value,field:&str,base:&Path,allowed:&[PathBuf])->Result<(),String>{
    match value {
      Value::String(s) if MEDIA.contains(&field)=>{if let Some(file)=asset_path(s,base){
        // A missing or out-of-scope image must not make the whole library unusable.
        // Retain its original reference without reading it or replacing it with null.
        if let Ok(resolved)=file.canonicalize(){if allowed.iter().any(|p|within(&resolved,p)){if let Ok(bytes)=fs::read(&resolved){*s=format!("data:{};base64,{}",mime(&file),STANDARD.encode(bytes));}}}
      }},
      Value::Array(a)=>for v in a{hydrate(v,"",base,allowed)?;},
      Value::Object(o)=>for(k,v)in o{hydrate(v,k,base,allowed)?;},_=>{}
    }Ok(())
}
fn embed_portable(value:&mut Value,field:&str)->Result<(),String>{
    match value {
      Value::String(source) if MEDIA.contains(&field)&&source.starts_with("file:")=>{
        let file=asset_path(source,Path::new("")).ok_or("Не удалось прочитать путь ресурса")?;
        let bytes=fs::read(&file).map_err(|_|format!("Не удалось прочитать ресурс: {}. Проверьте доступ к файлу.",file.display()))?;
        *source=format!("data:{};base64,{}",media_mime(&file).ok_or("Неизвестный формат ресурса")?,STANDARD.encode(bytes));
      },
      Value::Array(a)=>for v in a{embed_portable(v,"")?;},
      Value::Object(o)=>for(k,v)in o{embed_portable(v,k)?;},_=>{}
    }Ok(())
}
type MediaChecks=HashMap<PathBuf,(u64,Option<SystemTime>)>;
fn fingerprint(file:&Path)->Result<(u64,Option<SystemTime>),String>{let m=fs::metadata(file).map_err(|e|e.to_string())?;Ok((m.len(),m.modified().ok()))}
fn cache_asset(file:&Path,bytes:&[u8],expected:&str,checks:&mut MediaChecks)->Result<(),String>{
    let mut rewrite=!file.exists();
    if !rewrite {
        let mark=fingerprint(file)?;
        if checks.get(file)==Some(&mark){return Ok(());}
        rewrite=file_digest(file)?!=expected;
        if rewrite {
            // Preserve the damaged managed cache file before atomic replacement.
            // Never rewrite an original file outside workspace/assets.
            let backup=tempfile::Builder::new().prefix("corrupt-").suffix(".bak").tempfile_in(file.parent().ok_or("Нет папки кэша")?).map_err(|e|e.to_string())?;
            fs::copy(file,backup.path()).map_err(|e|e.to_string())?;backup.keep().map_err(|e|e.to_string())?;
        }
    }
    if rewrite {let mut temp=tempfile::NamedTempFile::new_in(file.parent().ok_or("Нет папки кэша")?).map_err(|e|e.to_string())?;temp.write_all(bytes).map_err(|e|e.to_string())?;temp.as_file().sync_all().map_err(|e|e.to_string())?;temp.persist(file).map_err(|e|e.to_string())?;}
    checks.insert(file.into(),fingerprint(file)?);Ok(())
}
#[cfg(test)] fn externalize(value:&mut Value,field:&str,root:&Path)->Result<(),String>{externalize_checked(value,field,root,&mut HashMap::new())}
fn externalize_checked(value:&mut Value,field:&str,root:&Path,checks:&mut MediaChecks)->Result<(),String>{
    match value {
      Value::String(s) if MEDIA.contains(&field)&&(s.starts_with("http://asset.localhost/")||s.starts_with("https://asset.localhost/")||s.starts_with("asset://"))=>return Err("Временная ссылка на ресурс не может быть сохранена. Повторно откройте проект.".into()),
      Value::String(s) if MEDIA.contains(&field)&&s.starts_with("data:")=>{
        let (header,data)=s.split_once(',').ok_or("Повреждённый ресурс")?;
        if !header.ends_with(";base64"){return Err("Неизвестный формат ресурса".into());}
        let bytes=STANDARD.decode(data).map_err(|e|e.to_string())?;
        let extension=match header.trim_start_matches("data:").trim_end_matches(";base64"){"image/png"=>"png","image/jpeg"=>"jpg","image/webp"=>"webp","image/svg+xml"=>"svg","image/gif"=>"gif","image/bmp"=>"bmp","image/x-icon"=>"ico","image/avif"=>"avif","audio/mpeg"=>"mp3","audio/ogg"=>"ogg","audio/wav"=>"wav","font/ttf"=>"ttf","font/otf"=>"otf","font/woff"=>"woff","font/woff2"=>"woff2","video/mp4"=>"mp4",_=>"bin"};
        let dir=root.join("assets");fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
        let canonical=dir.canonicalize().map_err(|e|e.to_string())?;let root=root.canonicalize().map_err(|e|e.to_string())?;
        if !within(&canonical,&root){return Err("Кэш ресурсов находится вне папки редактора. Верните папку assets и повторите запись.".into());}
        let digest=format!("{:x}",Sha256::digest(&bytes));let file=canonical.join(format!("{digest}.{extension}"));
        if file.exists()&&!within(&file.canonicalize().map_err(|e|e.to_string())?,&canonical){return Err("Файл кэша указывает за пределы assets. Запись остановлена.".into());}
        cache_asset(&file,&bytes,&digest,checks)?;
        *s=url::Url::from_file_path(dunce::simplified(&file)).map_err(|_|"Неизвестный путь")?.to_string();
      },Value::Array(a)=>for v in a{externalize_checked(v,"",root,checks)?;},Value::Object(o)=>for(k,v)in o{externalize_checked(v,k,root,checks)?;},_=>{}
    }Ok(())
}

fn declare_media(value:&Value,field:&str,declared:&mut HashSet<String>){match value{Value::String(s)if MEDIA.contains(&field)&&!s.is_empty()&&!s.starts_with("data:")=>{declared.insert(s.clone());},Value::Array(a)=>for v in a{declare_media(v,"",declared);},Value::Object(o)=>for(k,v)in o{declare_media(v,k,declared);},_=>{}}}
pub struct MediaAudit {root:PathBuf,allowed:Vec<PathBuf>,public:Option<PathBuf>,declared:HashSet<String>}
impl MediaAudit {
 pub fn run(&self,rows:&Value)->Result<(Value,Vec<PathBuf>),String>{
    let rows=rows.as_array().ok_or("Ожидался список файлов")?;if rows.len()>10000{return Err("Слишком много файлов для одной проверки. Разделите проект.".into());}
    let mut results=Vec::new();let mut files=Vec::new();
    for row in rows {
      let source=row["source"].as_str().ok_or("Не указан путь файла")?;if source.len()>32768{return Err("Слишком длинная ссылка на файл".into());}
      if !self.declared.contains(source){results.push(json!({"source":source,"status":"denied","message":"Файл не объявлен в сохранённом проекте. Сначала сохраните изменения."}));continue;}
      match resolve_media(source,&self.root,&self.allowed,self.public.as_deref()) {
        Ok(Some(file))=>{match fs::File::open(&file).and_then(|f|f.metadata()){
          Ok(meta)if meta.len()>0=>{results.push(json!({"source":source,"status":"available","size":meta.len(),"mime":media_mime(&file),"message":"Файл доступен. Проверка содержимого выполняется при замене."}));files.push(file);},
          _=>results.push(json!({"source":source,"status":"unavailable","message":"Файл пустой или недоступен для чтения. Выберите исправный файл."})),
        }},
        Ok(None)=>results.push(json!({"source":source,"status":"embedded","message":"Данные находятся в проекте."})),
        Err(message)=>results.push(json!({"source":source,"status":"unavailable","message":message})),
      }
    }Ok((json!(results),files))
 }
}
pub struct Workspace {pub root:PathBuf,values:HashMap<String,String>,locations:HashMap<String,PathBuf>,folders:HashSet<PathBuf>,blocked:Option<String>,allowed:Vec<PathBuf>,public:Option<PathBuf>,pub media_files:HashSet<PathBuf>,declared:HashSet<String>,checks:MediaChecks}
impl Workspace {
 pub fn migration_snapshot(&self)->Result<Value,String>{
    if let Some(error)=&self.blocked{return Err(error.clone());}
    if self.values.contains_key(KEYS[2]){return Err("Сначала восстановите или отклоните черновик, затем перенесите данные.".into());}
    for (key,raw) in &self.values{let value:Value=serde_json::from_str(raw).map_err(|_|"Не удалось прочитать библиотеку для переноса")?;if key==KEYS[0]{validate(&value)?;}if key==KEYS[1]{for project in value.as_array().ok_or("Повреждена библиотека проектов")?{validate(project)?;}}}
    Ok(json!({"values":self.values,"locations":self.locations}))
 }
 pub fn migration_media(&self,snapshot:&Value)->Result<Vec<PathBuf>,String>{
    fn walk(value:&Value,field:&str,workspace:&Workspace,files:&mut HashSet<PathBuf>,verified:&mut HashSet<PathBuf>)->Result<(),String>{match value{
      Value::String(source) if MEDIA.contains(&field)=>{if let Some(file)=resolve_media(source,&workspace.root,&workspace.allowed,workspace.public.as_deref())?{verify_managed(&file,&workspace.root,verified)?;files.insert(file);}},
      Value::Array(values)=>for value in values{walk(value,"",workspace,files,verified)?;},Value::Object(values)=>for(key,value)in values{walk(value,key,workspace,files,verified)?;},_=>{}
    }Ok(())}
    let mut files=HashSet::new();let mut verified=HashSet::new();for raw in snapshot["values"].as_object().ok_or("Нет библиотеки")?.values(){let value:Value=serde_json::from_str(raw.as_str().ok_or("Повреждена запись проекта")?).map_err(|e|e.to_string())?;walk(&value,"",self,&mut files,&mut verified)?;}Ok(files.into_iter().collect())
 }
 pub fn new(root:PathBuf)->Result<Self,Box<dyn std::error::Error>>{Self::open(root,true)}
 pub fn open(root:PathBuf,migrate:bool)->Result<Self,Box<dyn std::error::Error>>{
    fs::create_dir_all(&root)?;let file=root.join("workspace.json");
    let mut values:HashMap<String,String>=HashMap::new();let mut locations:HashMap<String,PathBuf>=HashMap::new();let mut blocked=None;
    let legacy=std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_default().join("vn-creator");
    if file.exists()||file.with_extension("json.bak").exists(){match read_json(&file){Ok(v)=>{
      match (serde_json::from_value(v["values"].clone()),serde_json::from_value(v["locations"].clone())) {
        (Ok(v),Ok(l))=>{values=v;locations=l;},_=>blocked=Some("Повреждена структура библиотеки. Запись остановлена, исходный файл сохранён.".into())
      }
    },Err(e)=>blocked=Some(e)}}
    else if migrate {
      for key in KEYS {let file=legacy.join("projects").join(format!("{key}.json"));if file.exists(){match read_json(&file){Ok(v)=>{values.insert(key.into(),serde_json::to_string(&v)?);},Err(e)=>blocked=Some(e)}}}
      if let Ok(v)=read_json(&legacy.join("project-locations.json")){locations=serde_json::from_value(v).unwrap_or_default();}
    }
    let mut allowed=vec![root.canonicalize()?];if let Ok(p)=legacy.canonicalize(){allowed.push(p);}
    for p in locations.values(){if let Some(parent)=p.parent(){if let Ok(p)=parent.canonicalize(){allowed.push(p);}}}
    Ok(Self{root,values,locations,folders:HashSet::new(),blocked,allowed,public:None,media_files:HashSet::new(),declared:HashSet::new(),checks:HashMap::new()})
 }
 pub fn set_public_assets(&mut self,public:PathBuf){if let Ok(public)=public.canonicalize(){self.allowed.push(public.clone());self.public=Some(public);}}
 pub fn audit_snapshot(&self)->MediaAudit{MediaAudit{root:self.root.clone(),allowed:self.allowed.clone(),public:self.public.clone(),declared:self.declared.clone()}}
 pub fn compiler_project(&self,project:&Value)->Result<Value,String>{
    validate(project)?;let mut project=project.clone();prepare_media(&mut project,"",&self.root,&self.allowed,self.public.as_deref(),&mut HashSet::new())?;Ok(project)
 }
 pub fn portable_project(&self,project:&Value)->Result<Value,String>{
    let mut project=self.compiler_project(project)?;embed_portable(&mut project,"")?;Ok(project)
 }
 pub fn dispatch(&mut self,op:&str,payload:Value)->Result<Value,String>{match op {
   "load"=>{
     if let Some(error)=&self.blocked{return Err(error.clone());}
     let mut values=self.values.clone();
     let mut cache=HashMap::new();self.media_files.clear();
     for (key,raw) in values.iter_mut(){let mut v:Value=match serde_json::from_str(raw){Ok(v)=>v,Err(_) if key==KEYS[2]=>continue,Err(e)=>return Err(e.to_string())};declare_media(&v,"",&mut self.declared);link_media(&mut v,"",&self.root,&self.allowed,self.public.as_deref(),&mut self.media_files,&mut cache);declare_media(&v,"",&mut self.declared);*raw=serde_json::to_string(&v).map_err(|e|e.to_string())?;}
     Ok(json!(values))
   },
   "flush"=>{
     if let Some(error)=&self.blocked{return Err(error.clone());}
     let mut next=self.values.clone();
     for (key,value) in payload.as_object().ok_or("Неизвестный формат записи")? {
       if !KEYS.contains(&key.as_str()){return Err("Неизвестный ключ хранилища".into());}
       if value.is_null(){next.remove(key);}else{let mut v:Value=serde_json::from_str(value.as_str().ok_or("Ожидался JSON")?).map_err(|e|e.to_string())?;
         if key==KEYS[0]{let old:Value=self.values.get(key).and_then(|s|serde_json::from_str(s).ok()).unwrap_or(Value::Null);if old["meta"]["mediaRevision"]!=v["meta"]["mediaRevision"]{self.checks.clear();}}
         externalize_checked(&mut v,"",&self.root,&mut self.checks)?;next.insert(key.clone(),serde_json::to_string(&v).map_err(|e|e.to_string())?);}
     }
     // Export registered projects first; a failed folder write must not report a successful save.
     if let Some(raw)=next.get(KEYS[0]){let p:Value=serde_json::from_str(raw).map_err(|e|e.to_string())?;if let Some(file)=self.locations.get(p["id"].as_str().unwrap_or("")){let mut portable=p;hydrate(&mut portable,"",&self.root,&self.allowed)?;atomic(file,&portable).map_err(|e|format!("Не удалось сохранить файл проекта. Проверьте свободное место и доступ к папке. Подробности: {e}"))?;}}
     atomic(&self.root.join("workspace.json"),&json!({"values":next,"locations":self.locations})).map_err(|e|format!("Не удалось сохранить библиотеку. Проверьте свободное место и доступ к папке. Подробности: {e}"))?;for raw in next.values(){if let Ok(v)=serde_json::from_str(raw){declare_media(&v,"",&mut self.declared);}}self.values=next;Ok(Value::Null)
   },
   "folder"=>{match rfd::FileDialog::new().set_title("Папка проекта").pick_folder(){Some(p)=>{self.folders.insert(p.clone());Ok(json!(p))},None=>Ok(Value::Null)}},
   "create"=>{validate(&payload)?;let folder=PathBuf::from(payload["meta"]["projectFolder"].as_str().ok_or("Выберите папку")?);if !self.folders.contains(&folder){return Err("Выберите папку через диалог".into());}let root=folder.join(safe_id(&payload));let file=root.join("project.vnproject");if file.exists(){return Err("Проект с таким идентификатором уже существует".into());}atomic(&file,&payload)?;self.allowed.push(root.canonicalize().map_err(|e|e.to_string())?);self.locations.insert(payload["id"].as_str().ok_or("Нет ID проекта")?.into(),file.clone());Ok(json!(file))},
   "open"=>{match rfd::FileDialog::new().add_filter("Проект История",&["vnproject"]).pick_file(){None=>Ok(Value::Null),Some(file)=>{let mut p:Value=serde_json::from_slice(&fs::read(&file).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;validate(&p)?;let root=file.parent().ok_or("Нет папки проекта")?.canonicalize().map_err(|e|e.to_string())?;let mut allowed=self.allowed.clone();allowed.push(root.clone());link_media(&mut p,"",&root,&allowed,self.public.as_deref(),&mut self.media_files,&mut HashMap::new());self.allowed.push(root);self.locations.insert(p["id"].as_str().ok_or("Нет ID проекта")?.into(),file);Ok(p)}}},
   "portable"=>self.portable_project(&payload),
   "export"=>{let p=self.portable_project(&payload)?;let name=p["meta"]["title"].as_str().unwrap_or("История").replace(['\\','/',':','*','?','"','<','>','|'],"-");match rfd::FileDialog::new().set_file_name(format!("{name}.vnproject")).add_filter("Проект История",&["vnproject"]).save_file(){None=>Ok(json!({"canceled":true})),Some(file)=>{atomic(&file,&p)?;Ok(json!({"canceled":false,"filePath":file}))}}},
   "confirm-close"=>Ok(json!(rfd::MessageDialog::new().set_title("Не удалось сохранить изменения").set_description("Закрыть редактор без сохранения последних изменений? Чтобы сохранить резервную копию, выберите «Нет» и нажмите «Резервная копия» в редакторе.").set_buttons(rfd::MessageButtons::YesNo).set_level(rfd::MessageLevel::Warning).show()==rfd::MessageDialogResult::Yes)),
   _=>Err("Неизвестная операция приложения".into())
 }}
}

// Profile transfer changes only declared media fields, never literal story text
// or registered external project destinations. It must not use ordinary flush,
// which would also write the owner's external .vnproject files.
pub fn prepare_migration_snapshot(snapshot:&Value,workspace:&Workspace,target:&Path,aliases:&HashMap<PathBuf,PathBuf>)->Result<Value,String>{
 fn rebase(value:&mut Value,field:&str,workspace:&Workspace,target:&Path,aliases:&HashMap<PathBuf,PathBuf>)->Result<(),String>{match value{
  Value::String(uri) if MEDIA.contains(&field)=>{if let Some(file)=resolve_media(uri,&workspace.root,&workspace.allowed,workspace.public.as_deref())?{let source=workspace.root.canonicalize().map_err(|e|e.to_string())?;let next=if let Some(next)=aliases.get(&file){next.clone()}else if within(&file,&source){target.join(file.strip_prefix(&source).map_err(|_|"Не удалось перенести путь")?)}else{return Err("Ресурс не включён в проверенную копию".into());};*uri=url::Url::from_file_path(dunce::simplified(&next)).map_err(|_|"Не удалось записать новый путь")?.to_string();}},
  Value::Array(values)=>for value in values{rebase(value,"",workspace,target,aliases)?;},Value::Object(values)=>for(key,value)in values{rebase(value,key,workspace,target,aliases)?;},_=>{}
 }Ok(())}
 let mut snapshot=snapshot.clone();let values=snapshot["values"].as_object_mut().ok_or("Нет библиотеки для переноса")?;let mut checks=HashMap::new();
 for raw in values.values_mut(){let mut value:Value=serde_json::from_str(raw.as_str().ok_or("Некорректная запись проекта")?).map_err(|e|e.to_string())?;rebase(&mut value,"",workspace,target,aliases)?;externalize_checked(&mut value,"",target,&mut checks)?;*raw=json!(serde_json::to_string(&value).map_err(|e|e.to_string())?);}
 Ok(snapshot)
}

#[cfg(test)] mod tests {
 use super::*;
 #[test]fn staged_primary_and_backup_survive_failures_at_each_commit_boundary(){
  for boundary in ["primary-staged","backup-staged","backup-replaced","primary-replaced"]{
   let dir=tempfile::tempdir().unwrap();let file=dir.path().join("workspace.json");let backup=file.with_extension("json.bak");
   atomic(&file,&json!({"version":0})).unwrap();atomic(&file,&json!({"version":1})).unwrap();
   let result=atomic_bytes_checked(&file,&serde_json::to_vec(&json!({"version":2})).unwrap(),|stage|if stage==boundary{Err("QA interrupted commit".into())}else{Ok(())});assert!(result.is_err());
   assert_eq!(read_json(&file).unwrap()["version"],if boundary=="primary-replaced"{2}else{1});assert_eq!(read_json(&backup).unwrap()["version"],if boundary=="primary-staged"||boundary=="backup-staged"{0}else{1});
   assert_eq!(fs::read_dir(dir.path()).unwrap().count(),2,"Staged files must be cleaned on handled error");
   fs::write(&file,b"QA damaged primary").unwrap();assert!(read_json(&file).is_ok(),"A complete fallback survives every boundary");
  }
 }
 #[test]fn blocked_backup_replacement_keeps_primary_exact(){
  let dir=tempfile::tempdir().unwrap();let file=dir.path().join("workspace.json");atomic(&file,&json!({"version":1})).unwrap();let before=fs::read(&file).unwrap();fs::create_dir(file.with_extension("json.bak")).unwrap();assert!(atomic(&file,&json!({"version":2})).is_err());assert_eq!(fs::read(&file).unwrap(),before);assert!(file.with_extension("json.bak").is_dir());assert_eq!(fs::read_dir(dir.path()).unwrap().count(),2);
 }
 #[cfg(windows)] #[test] fn read_only_write_failure_keeps_current_and_does_not_poison_backup_retry(){
   let dir=tempfile::tempdir().unwrap();let file=dir.path().join("workspace.json");let backup=file.with_extension("json.bak");atomic(&file,&json!({"version":1})).unwrap();let mut permissions=fs::metadata(&file).unwrap().permissions();permissions.set_readonly(true);fs::set_permissions(&file,permissions).unwrap();assert!(atomic(&file,&json!({"version":2})).is_err());assert_eq!(read_json(&file).unwrap()["version"],1);assert!(fs::metadata(&file).unwrap().permissions().readonly());assert!(!fs::metadata(&backup).unwrap().permissions().readonly());writable_backup(&file).unwrap();let mut old_permissions=fs::metadata(&backup).unwrap().permissions();old_permissions.set_readonly(true);fs::set_permissions(&backup,old_permissions).unwrap();atomic(&file,&json!({"version":2})).unwrap();assert_eq!(read_json(&file).unwrap()["version"],2);assert_eq!(read_json(&backup).unwrap()["version"],1);assert!(!fs::metadata(&backup).unwrap().permissions().readonly());let mut protected=fs::metadata(&backup).unwrap().permissions();protected.set_readonly(true);fs::set_permissions(&backup,protected).unwrap();assert!(atomic(&file,&json!({"version":3})).is_err());assert_eq!(read_json(&file).unwrap()["version"],2);writable_backup(&backup).unwrap();
 }
 #[test] fn reference_backup_preserves_missing_sources_and_literal_story_text_without_reading_them(){
   let dir=tempfile::tempdir().unwrap();let source=url::Url::from_file_path(dir.path().join("missing.png")).unwrap().to_string();let p=json!({"meta":{},"scenes":{},"resources":[{"source":source}],"text":"asset://localhost/literal-dialogue"});let w=Workspace::open(dir.path().into(),false).unwrap();assert!(w.portable_project(&p).is_err());let refs=reference_project(&p).unwrap();assert_eq!(refs,p);let file=dir.path().join("backup.vnproject");write_recovery_copy(&file,&serde_json::to_vec(&refs).unwrap()).unwrap();assert_eq!(read_json(&file).unwrap(),p);let mut bad=p;bad["resources"][0]["source"]=json!("asset://localhost/file");assert!(reference_project(&bad).is_err());
 }
 #[test] fn malformed_draft_does_not_hide_saved_projects_and_can_be_cleared_atomically(){
   let dir=tempfile::tempdir().unwrap();let p=json!({"id":"saved","meta":{},"scenes":{}});let values=json!({KEYS[0]:p.to_string(),KEYS[1]:json!([p]).to_string(),KEYS[2]:"{broken"});fs::write(dir.path().join("workspace.json"),json!({"values":values,"locations":{}}).to_string()).unwrap();let mut w=Workspace::open(dir.path().into(),false).unwrap();let loaded=w.dispatch("load",Value::Null).unwrap();assert_eq!(loaded[KEYS[2]],"{broken");assert!(loaded[KEYS[0]].as_str().unwrap().contains("saved"));assert!(w.media_files.is_empty());w.dispatch("flush",json!({KEYS[2]:null})).unwrap();assert!(!w.values.contains_key(KEYS[2]));let mut reopened=Workspace::open(dir.path().into(),false).unwrap();assert!(reopened.dispatch("load",Value::Null).unwrap().get(KEYS[2]).is_none());assert_eq!(reopened.values[KEYS[0]],p.to_string());
 }
 #[test] fn media_audit_reports_only_declared_scoped_files_and_can_restore_a_missing_file(){
   let dir=tempfile::tempdir().unwrap();let outside=tempfile::tempdir().unwrap();let file=dir.path().join("voice.wav");let other=dir.path().join("unlisted.png");let secret=outside.path().join("outside.png");fs::write(&other,b"png").unwrap();fs::write(&secret,b"png").unwrap();
   let source=url::Url::from_file_path(&file).unwrap().to_string();let p=json!({"meta":{},"scenes":{},"resources":[{"source":source}]});let mut w=Workspace::open(dir.path().into(),false).unwrap();w.dispatch("flush",json!({KEYS[0]:p.to_string()})).unwrap();
   let rows=json!([{"source":source},{"source":url::Url::from_file_path(other).unwrap().to_string()},{"source":url::Url::from_file_path(secret).unwrap().to_string()}]);let snapshot=w.audit_snapshot();
   let (report,files)=snapshot.run(&rows).unwrap();assert_eq!(report[0]["status"],"unavailable");assert_eq!(report[1]["status"],"denied");assert_eq!(report[2]["status"],"denied");assert!(files.is_empty());
   fs::write(&file,b"wave bytes").unwrap();let (report,files)=snapshot.run(&rows).unwrap();assert_eq!(report[0]["status"],"available");assert_eq!(report[0]["size"],10);assert_eq!(files.len(),1);fs::write(&file,b"").unwrap();assert_eq!(snapshot.run(&rows).unwrap().0[0]["status"],"unavailable");assert!(snapshot.run(&json!([{"source":"x".repeat(32769)}])).is_err());
 }
 #[test] fn reimport_repairs_corrupt_managed_cache_and_keeps_the_old_bytes(){
   let dir=tempfile::tempdir().unwrap();let mut w=Workspace::open(dir.path().into(),false).unwrap();let p=json!({"meta":{},"scenes":{},"source":"data:image/png;base64,YWJj"});w.dispatch("flush",json!({KEYS[0]:p.to_string()})).unwrap();let stored:Value=serde_json::from_str(&w.values[KEYS[0]]).unwrap();let file=asset_path(stored["source"].as_str().unwrap(),dir.path()).unwrap();fs::write(&file,b"bad").unwrap();
   let mut repaired=p.clone();repaired["meta"]["mediaRevision"]=json!(1);w.dispatch("flush",json!({KEYS[0]:repaired.to_string()})).unwrap();assert_eq!(fs::read(&file).unwrap(),b"abc");let backups:Vec<_>=fs::read_dir(dir.path().join("assets")).unwrap().flatten().filter(|e|e.file_name().to_string_lossy().starts_with("corrupt-")).collect();assert_eq!(backups.len(),1);assert_eq!(fs::read(backups[0].path()).unwrap(),b"bad");
   let canonical=file.canonicalize().unwrap();let mark=w.checks.get(&canonical).cloned();assert!(mark.is_some());w.dispatch("flush",json!({KEYS[0]:repaired.to_string()})).unwrap();assert_eq!(w.checks.get(&canonical).cloned(),mark);
 }
 #[test] fn compiler_and_portable_reject_corrupt_managed_cache_without_slowing_load(){
   let dir=tempfile::tempdir().unwrap();let mut w=Workspace::open(dir.path().into(),false).unwrap();let p=json!({"meta":{},"scenes":{},"source":"data:image/png;base64,YWJj"});w.dispatch("flush",json!({KEYS[0]:p.to_string()})).unwrap();let stored:Value=serde_json::from_str(&w.values[KEYS[0]]).unwrap();let file=asset_path(stored["source"].as_str().unwrap(),dir.path()).unwrap();fs::write(&file,b"bad").unwrap();assert!(w.dispatch("load",Value::Null).is_ok());assert!(w.compiler_project(&stored).unwrap_err().contains("повреждён"));assert!(w.portable_project(&stored).is_err());assert_eq!(fs::read(&file).unwrap(),b"bad");
 }
 #[test] fn transaction_and_recovery(){let dir=tempfile::tempdir().unwrap();let mut w=Workspace::new(dir.path().into()).unwrap();w.dispatch("flush",json!({"istoriya-project-recovery-v1":"{\"v\":1}"})).unwrap();w.dispatch("flush",json!({"istoriya-project-recovery-v1":"{\"v\":2}"})).unwrap();fs::write(dir.path().join("workspace.json"),b"broken").unwrap();let w=Workspace::new(dir.path().into()).unwrap();assert_eq!(w.values[KEYS[2]],"{\"v\":1}");}
 #[test] fn invalid_batch_does_not_commit(){let dir=tempfile::tempdir().unwrap();let mut w=Workspace::new(dir.path().into()).unwrap();assert!(w.dispatch("flush",json!({"other":"{}"})).is_err());assert!(!dir.path().join("workspace.json").exists());}
 #[test] fn literal_dialogue_is_not_a_file(){let mut value=json!({"text":"file:///secret","source":"data:image/png;base64,YWJj"});let dir=tempfile::tempdir().unwrap();externalize(&mut value,"",dir.path()).unwrap();assert_eq!(value["text"],"file:///secret");assert!(value["source"].as_str().unwrap().starts_with("file:"));hydrate(&mut value,"",dir.path(),&[dir.path().canonicalize().unwrap()]).unwrap();assert_eq!(value["source"],"data:image/png;base64,YWJj");}
 #[test] fn missing_and_untrusted_assets_keep_library_open(){let allowed=tempfile::tempdir().unwrap();let other=tempfile::tempdir().unwrap();let file=other.path().join("outside.png");fs::write(&file,b"private").unwrap();let source=url::Url::from_file_path(&file).unwrap().to_string();let mut value=json!({"source":source,"portrait":"file:///missing/file.png"});hydrate(&mut value,"",allowed.path(),&[allowed.path().canonicalize().unwrap()]).unwrap();assert_eq!(value["source"],source);assert_eq!(value["portrait"],"file:///missing/file.png");}
 #[test] #[cfg(windows)] fn windows_paths_are_case_insensitive_and_bounded(){assert!(within(Path::new("C:\\Users\\Author\\assets\\a.png"),Path::new("c:\\users\\author")));assert!(!within(Path::new("C:\\Users\\Author-other\\a.png"),Path::new("c:\\users\\author")));}
 #[test] fn lazy_load_links_large_media_without_embedding_and_keeps_text(){
   let dir=tempfile::tempdir().unwrap();let file=dir.path().join("large.png");fs::File::create(&file).unwrap().set_len(32*1024*1024).unwrap();
   let source=url::Url::from_file_path(&file).unwrap().to_string();let p=json!({"meta":{},"scenes":{},"source":source,"text":source});
   let mut w=Workspace::open(dir.path().into(),false).unwrap();w.dispatch("flush",json!({KEYS[0]:p.to_string(),KEYS[1]:json!([p,p]).to_string()})).unwrap();
   let loaded=w.dispatch("load",Value::Null).unwrap();assert!(loaded.to_string().len()<3000);assert_eq!(w.media_files.len(),1);let p:Value=serde_json::from_str(loaded[KEYS[0]].as_str().unwrap()).unwrap();assert_eq!(p["source"],source);assert_eq!(p["text"],source);assert!(!loaded.to_string().contains("base64"));
 }
 #[test] fn compiler_and_portable_resolve_scoped_files_and_reject_escapes(){
   let dir=tempfile::tempdir().unwrap();let outside=tempfile::tempdir().unwrap();let mut w=Workspace::open(dir.path().into(),false).unwrap();
   let p=json!({"meta":{},"scenes":{},"source":"data:image/png;base64,YWJj","text":"file:///secret.txt"});w.dispatch("flush",json!({KEYS[0]:p.to_string()})).unwrap();let loaded=w.dispatch("load",Value::Null).unwrap();let linked:Value=serde_json::from_str(loaded[KEYS[0]].as_str().unwrap()).unwrap();assert!(linked["source"].as_str().unwrap().starts_with("file:"));assert_eq!(w.portable_project(&linked).unwrap(),p);
   let secret=outside.path().join("secret.png");fs::write(&secret,b"secret").unwrap();let malicious=json!({"meta":{},"scenes":{},"source":url::Url::from_file_path(&secret).unwrap().to_string()});assert!(w.compiler_project(&malicious).unwrap_err().contains("вне папок"));
   let mut text=p.clone();text["source"]=json!("http://asset.localhost/private");assert!(w.compiler_project(&text).is_err());assert!(w.dispatch("flush",json!({KEYS[0]:text.to_string()})).is_err());
   text["source"]=json!("./assets/../../missing.png");assert!(w.compiler_project(&text).is_err());
   fs::create_dir_all(dir.path().join("assets")).unwrap();fs::write(dir.path().join("assets/private.txt"),b"secret").unwrap();text["source"]=json!("./assets/private.txt");assert!(w.compiler_project(&text).is_err());
 }
 #[test] fn missing_media_is_read_only_but_does_not_block_other_projects_and_backup_reads_on_write_failure(){
   let dir=tempfile::tempdir().unwrap();let mut w=Workspace::open(dir.path().into(),false).unwrap();let p=json!({"meta":{},"scenes":{},"source":"file:///missing/image.png"});w.dispatch("flush",json!({KEYS[0]:p.to_string()})).unwrap();
   assert!(w.dispatch("load",Value::Null).is_ok());assert!(w.media_files.is_empty());assert!(w.portable_project(&p).is_err());
   let empty=json!({"meta":{},"scenes":{}});w.dispatch("flush",json!({KEYS[0]:empty.to_string()})).unwrap();w.blocked=Some("disk failure".into());assert!(w.dispatch("flush",json!({KEYS[0]:p.to_string()})).is_err());assert_eq!(w.dispatch("portable",empty.clone()).unwrap(),empty);
 }
 #[test] fn bundled_assets_are_linked_with_exact_scopes_and_no_media_bytes_in_load(){
   let dir=tempfile::tempdir().unwrap();let public=tempfile::tempdir().unwrap();fs::create_dir_all(public.path().join("assets")).unwrap();fs::write(public.path().join("assets/bg.png"),b"png").unwrap();let mut w=Workspace::open(dir.path().into(),false).unwrap();w.set_public_assets(public.path().into());
   let p=json!({"meta":{},"scenes":{},"source":"./assets/bg.png"});w.dispatch("flush",json!({KEYS[0]:p.to_string()})).unwrap();let loaded=w.dispatch("load",Value::Null).unwrap();assert!(!loaded.to_string().contains("base64"));assert_eq!(w.media_files.len(),1);assert!(w.portable_project(&p).unwrap()["source"].as_str().unwrap().starts_with("data:image/png;base64,"));
 }
 #[test] fn legacy_bin_media_keeps_working_without_allowing_arbitrary_bin_documents(){
   let dir=tempfile::tempdir().unwrap();let mut w=Workspace::open(dir.path().into(),false).unwrap();let legacy=dir.path().join("old.bin");fs::write(&legacy,b"GIF89a\x01\x00\x01\x00").unwrap();let source=url::Url::from_file_path(&legacy).unwrap().to_string();let p=json!({"meta":{},"scenes":{},"source":source});
   w.dispatch("flush",json!({KEYS[0]:p.to_string()})).unwrap();assert!(w.dispatch("load",Value::Null).is_ok());assert_eq!(w.media_files.len(),1);assert!(w.portable_project(&p).unwrap()["source"].as_str().unwrap().starts_with("data:image/gif;base64,"));
   fs::write(&legacy,b"not a media file").unwrap();assert!(w.compiler_project(&p).is_err());w.dispatch("load",Value::Null).unwrap();assert!(w.media_files.is_empty());assert_eq!(media_mime(Path::new("sprite.gif")),Some("image/gif"));assert_eq!(media_mime(Path::new("font.woff")),Some("font/woff"));
 }
}
