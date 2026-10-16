// Test harness only. Never switches the input desktop and never sends OS input.
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public static class IsolatedGameDesktop {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct StartupInfo {
  public uint cb; public string reserved,desktop,title; public uint x,y,xSize,ySize,xChars,yChars,fill,flags;
  public ushort showWindow,reserved2; public IntPtr reservedPtr,input,output,error;
 }
 [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {public IntPtr process,thread;public uint processId,threadId;}
 [StructLayout(LayoutKind.Sequential)] struct BasicLimits {public long processTime,jobTime;public uint flags;public UIntPtr minWorking,maxWorking;public uint activeLimit;public UIntPtr affinity;public uint priority,scheduling;}
 [StructLayout(LayoutKind.Sequential)] struct IoCounters {public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes;}
 [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {public BasicLimits basic;public IoCounters io;public UIntPtr processMemory,jobMemory,peakProcess,peakJob;}
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateDesktop(string name,IntPtr device,IntPtr devmode,uint flags,uint access,IntPtr security);
 [DllImport("user32.dll",SetLastError=true)] static extern bool CloseDesktop(IntPtr desktop);
 delegate bool EnumWindow(IntPtr window,IntPtr parameter);
 [DllImport("user32.dll",SetLastError=true)] static extern bool EnumDesktopWindows(IntPtr desktop,EnumWindow callback,IntPtr parameter);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint processId);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window,StringBuilder title,int count);
 [DllImport("user32.dll",SetLastError=true)] static extern bool PostMessage(IntPtr window,uint message,IntPtr wparam,IntPtr lparam);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string exe,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr env,string directory,ref StartupInfo startup,out ProcessInfo info);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref ExtendedLimits info,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
 public sealed class Result {public uint ProcessId,ExitCode;public bool TimedOut;public string Desktop;}
 static void Check(bool condition){if(!condition)throw new Win32Exception(Marshal.GetLastWin32Error());}
 static string Quote(string value){
  var result=new StringBuilder("\"");int slashes=0;
  foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='"'){result.Append('\\',slashes*2+1);result.Append(c);}else{result.Append('\\',slashes);result.Append(c);}slashes=0;}
  result.Append('\\',slashes*2);return result.Append('"').ToString();
 }
 public static Result Run(string executable,string[] args,string directory,string logPath,int timeoutSeconds){
  return RunWithCloseSignal(executable,args,directory,logPath,timeoutSeconds,null);
 }
 public static Result RunWithCloseSignal(string executable,string[] args,string directory,string logPath,int timeoutSeconds,string closeSignal){
  if(!File.Exists(executable)||!Directory.Exists(directory))throw new ArgumentException("Missing executable or game directory");
  int maximum=closeSignal==null?600:3600;
  if(timeoutSeconds<1||timeoutSeconds>maximum)throw new ArgumentException("Timeout must be 1–"+maximum+" seconds");
  string desktopName="IstoriyaQA_"+Guid.NewGuid().ToString("N");
  IntPtr desktop=IntPtr.Zero,job=IntPtr.Zero;ProcessInfo process=new ProcessInfo();bool finished=false;
  using(var log=new FileStream(logPath,FileMode.Create,FileAccess.Write,FileShare.ReadWrite)){
   try{
    // CREATEWINDOW, CREATEMENU, READOBJECTS, WRITEOBJECTS and ENUMERATE; no SWITCHDESKTOP.
    desktop=CreateDesktop(desktopName,IntPtr.Zero,IntPtr.Zero,0,0xC7,IntPtr.Zero);Check(desktop!=IntPtr.Zero);
    job=CreateJobObject(IntPtr.Zero,null);Check(job!=IntPtr.Zero);
    var limits=new ExtendedLimits();limits.basic.flags=0x2000; // KILL_ON_JOB_CLOSE
    Check(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(ExtendedLimits))));
    var logHandle=log.SafeFileHandle.DangerousGetHandle();Check(SetHandleInformation(logHandle,1,1));
    var startup=new StartupInfo{cb=(uint)Marshal.SizeOf(typeof(StartupInfo)),desktop=desktopName,flags=0x181,showWindow=0,input=IntPtr.Zero,output=logHandle,error=logHandle};
    var command=new StringBuilder(Quote(executable));foreach(string arg in args)command.Append(' ').Append(Quote(arg));
    Check(CreateProcess(executable,command,IntPtr.Zero,IntPtr.Zero,true,0x08000004,IntPtr.Zero,directory,ref startup,out process));
    Check(AssignProcessToJobObject(job,process.process));Check(ResumeThread(process.thread)!=uint.MaxValue);
    Console.WriteLine("Isolated desktop process: "+process.processId+" ("+desktopName+")");
    var elapsed=Stopwatch.StartNew();bool timedOut=false,closeSent=false;
    while(true){
     uint wait=WaitForSingleObject(process.process,250);if(wait==0)break;if(wait!=258)throw new Win32Exception(Marshal.GetLastWin32Error());
     if(!closeSent&&closeSignal!=null&&File.Exists(closeSignal)){
      EnumWindow closeOwnWindow=(window,parameter)=>{uint owner;GetWindowThreadProcessId(window,out owner);var title=new StringBuilder(256);GetWindowText(window,title,title.Capacity);
       // Only the explicitly named QA window on this new desktop, never another app.
       if(owner==process.processId&&title.ToString()=="История · QA (изолированный профиль)"){Check(PostMessage(window,0x0010,IntPtr.Zero,IntPtr.Zero));closeSent=true;}return true;};
      Check(EnumDesktopWindows(desktop,closeOwnWindow,IntPtr.Zero));
     }
     if(elapsed.Elapsed.TotalSeconds>=timeoutSeconds){timedOut=true;Check(TerminateProcess(process.process,124));break;}
    }
    uint exitCode;Check(GetExitCodeProcess(process.process,out exitCode));finished=true;
    return new Result{ProcessId=process.processId,ExitCode=timedOut?124:exitCode,TimedOut=timedOut,Desktop=desktopName};
   }finally{
    // Also clean up a suspended child if assignment to the Job failed.
    if(process.process!=IntPtr.Zero&&!finished)TerminateProcess(process.process,125);
    if(job!=IntPtr.Zero)CloseHandle(job);
    if(process.process!=IntPtr.Zero){WaitForSingleObject(process.process,5000);CloseHandle(process.process);}
    if(process.thread!=IntPtr.Zero)CloseHandle(process.thread);
    if(desktop!=IntPtr.Zero)CloseDesktop(desktop);
   }
  }
 }
}
