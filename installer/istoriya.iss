#ifndef AppVersion
  #define AppVersion "0.1.2"
#endif
#ifndef PackageDir
  #define PackageDir "..\release-installer\win-unpacked"
#endif

[Setup]
AppId={{C00C6D73-EF36-47DC-B7C0-FE7E3AF20A52}
AppName=История
AppVersion={#AppVersion}
AppPublisher=История
AppPublisherURL=https://github.com/coolmorimer/istoriya-vn-creator
AppSupportURL=https://github.com/coolmorimer/istoriya-vn-creator/issues
DefaultDirName={localappdata}\Programs\Istoriya
DefaultGroupName=История
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\release-installer\setup
OutputBaseFilename=Istoriya-Setup-{#AppVersion}-x64
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
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; Flags: unchecked

[Files]
Source: "{#PackageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\История"; Filename: "{app}\История.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\История"; Filename: "{app}\История.exe"; Tasks: desktopicon; WorkingDir: "{app}"
Name: "{group}\Удалить Историю"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\История.exe"; Description: "Запустить Историю"; Flags: nowait postinstall skipifsilent

; User projects in AppData and author-selected folders are deliberately never removed.
