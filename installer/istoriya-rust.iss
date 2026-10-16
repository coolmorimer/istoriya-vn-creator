#ifndef AppVersion
  #define AppVersion "0.2.0"
#endif
#define NativeRoot "..\src-tauri\target\release"
#define ResourcesRoot "..\.artifacts\native-resources"

[Setup]
AppId={{C00C6D73-EF36-47DC-B7C0-FE7E3AF20A52}
AppName=История
AppVersion={#AppVersion}
AppPublisher=История
DefaultDirName={localappdata}\Programs\Istoriya
DefaultGroupName=История
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\release-rust\setup
OutputBaseFilename=Istoriya-Rust-Setup-{#AppVersion}-x64
UninstallDisplayIcon={app}\История.exe
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
DisableProgramGroupPage=yes
SetupLogging=yes

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; Flags: unchecked

[Files]
Source: "{#NativeRoot}\istoriya.exe"; DestDir: "{app}"; DestName: "История.exe"; Flags: ignoreversion
Source: "{#ResourcesRoot}\*"; DestDir: "{app}\native"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\.artifacts\notices\*"; DestDir: "{app}\licenses"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\.artifacts\MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy

[Icons]
Name: "{group}\История"; Filename: "{app}\История.exe"
Name: "{autodesktop}\История"; Filename: "{app}\История.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\История.exe"; Description: "Запустить Историю"; Flags: nowait postinstall skipifsilent

[Code]
function HasWebView2(): Boolean;
var Version: String;
begin
  Result := (RegQueryStringValue(HKLM32, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
  if not Result then
    Result := (RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;
function PrepareToInstall(var NeedsRestart: Boolean): String;
var ExitCode: Integer;
begin
  Result := '';
  if not HasWebView2() then begin
    ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
    if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
      Result := 'Не удалось запустить установку WebView2. Требуется подключение к интернету.'
    else if not HasWebView2() then
      Result := 'WebView2 не установлен. Проверьте подключение к интернету и повторите установку. Код: ' + IntToStr(ExitCode);
  end;
end;
