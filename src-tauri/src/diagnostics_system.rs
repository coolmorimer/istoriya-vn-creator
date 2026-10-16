//! Exact native actions only. No caller-supplied shell, path or clipboard body.
use std::path::Path;
#[cfg(windows)]mod win{
 use std::{ffi::c_void,os::windows::ffi::OsStrExt,path::Path,ptr};
 #[link(name="kernel32")]extern "system"{
  fn GetDiskFreeSpaceExW(path:*const u16,free:*mut u64,total:*mut u64,total_free:*mut u64)->i32;
  fn GlobalAlloc(flags:u32,bytes:usize)->*mut c_void;
  fn GlobalLock(handle:*mut c_void)->*mut c_void;
  fn GlobalUnlock(handle:*mut c_void)->i32;
  fn GlobalFree(handle:*mut c_void)->*mut c_void;
 }
 #[link(name="user32")]extern "system"{
  fn OpenClipboard(window:*mut c_void)->i32;
  fn EmptyClipboard()->i32;
  fn SetClipboardData(format:u32,memory:*mut c_void)->*mut c_void;
  fn CloseClipboard()->i32;
 }
 #[link(name="shell32")]extern "system"{fn ShellExecuteW(window:*mut c_void,operation:*const u16,file:*const u16,parameters:*const u16,directory:*const u16,show:i32)->isize;}
 pub fn free(path:&Path)->Option<u64>{let mut p:Vec<u16>=path.as_os_str().encode_wide().collect();p.push(0);let mut free=0;unsafe{if GetDiskFreeSpaceExW(p.as_ptr(),&mut free,ptr::null_mut(),ptr::null_mut())!=0{Some(free)}else{None}}}
 pub fn copy(text:&str,window:isize)->Result<(),String>{
  if window==0{return Err("Не удалось получить окно для копирования. Выделите отчёт и скопируйте его вручную.".into());}
  let text:Vec<u16>=text.encode_utf16().chain(Some(0)).collect();
  unsafe{
   let memory=GlobalAlloc(0x0002,text.len()*2);if memory.is_null(){return Err("Недостаточно памяти для копирования отчёта.".into());}
   let output=GlobalLock(memory);if output.is_null(){GlobalFree(memory);return Err("Не удалось подготовить отчёт к копированию.".into());}
   ptr::copy_nonoverlapping(text.as_ptr(),output as *mut u16,text.len());GlobalUnlock(memory);
   if OpenClipboard(window as *mut c_void)==0{GlobalFree(memory);return Err("Буфер обмена занят. Повторите копирование или выделите отчёт вручную.".into());}
   let copied=EmptyClipboard()!=0&&!SetClipboardData(13,memory).is_null();CloseClipboard();
   if !copied{GlobalFree(memory);return Err("Не удалось скопировать отчёт. Выделите его и нажмите Ctrl+C.".into());}
  }Ok(())
 }
 pub fn open(path:&Path,window:isize)->Result<(),String>{
  let path:Vec<u16>=path.as_os_str().encode_wide().chain(Some(0)).collect();let operation:Vec<u16>="open".encode_utf16().chain(Some(0)).collect();
  let code=unsafe{ShellExecuteW(window as *mut c_void,operation.as_ptr(),path.as_ptr(),ptr::null(),ptr::null(),1)};
  if code<=32{Err("Не удалось открыть папку журналов. Путь указан в технических подробностях.".into())}else{Ok(())}
 }
}
pub fn free_bytes(path:&Path)->Option<u64>{#[cfg(windows)]{win::free(path)}#[cfg(not(windows))]{let _=path;None}}
pub fn copy_report(text:&str,window:isize)->Result<(),String>{#[cfg(windows)]{win::copy(text,window)}#[cfg(not(windows))]{let _=(text,window);Err("Выделите техническую информацию и скопируйте вручную.".into())}}
pub fn open_logs(path:&Path,window:isize)->Result<(),String>{#[cfg(windows)]{win::open(dunce::simplified(path),window)}#[cfg(not(windows))]{let _=(path,window);Err("Откройте папку по указанному пути вручную.".into())}}
