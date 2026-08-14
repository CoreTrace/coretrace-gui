; CoreTrace GUI (native) Windows installer.
;
; Parity target: the old Electron app's electron-builder NSIS config
; (see ../../package.json's "build" section) -- same appId, product
; name, and bundled-resource layout (bin/ctrace as an extra resource),
; so this is a drop-in replacement from a distribution standpoint, not
; a new install/uninstall experience.
;
; NOT compiled or tested in this environment: makensis isn't installed
; here (checked; not installed via winget either, since installing new
; system tools without the user's say-so is out of scope for an
; autonomous session -- see native/docs/phase5-status.md). This is
; real, complete NSIS source, not a stub, but it's unverified the way
; everything else in this codebase is verified for real -- stated
; plainly rather than glossed over.
;
; Build with: makensis installer.nsi
; (from a checkout with a release build already produced at
;  ..\target\release\coretrace-ui.exe)

!define APP_ID "com.coretrace.ctracegui"
!define APP_NAME "CtraceGUI"
!define APP_EXE "coretrace-ui.exe"
!define APP_PUBLISHER "CoreTrace"
!define APP_ICON "..\..\assets\ctrace.ico"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"

; Version is injected at build time: makensis /DAPP_VERSION=1.2.3 installer.nsi
!ifndef APP_VERSION
  !define APP_VERSION "0.0.0-dev"
!endif

Name "${APP_NAME}"
OutFile "..\target\dist\CtraceGUI-Setup-${APP_VERSION}.exe"
InstallDir "$PROGRAMFILES64\${APP_NAME}"
InstallDirRegKey HKLM "${UNINSTALL_KEY}" "InstallLocation"
RequestExecutionLevel admin
Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  SetOutPath "$INSTDIR"

  ; The app binary and its two bundled runtime dependencies --
  ; extension-host/ (the Node sidecar) and bin/ctrace (the static
  ; analysis backend). bundled_path::resolve() in the ui crate looks
  ; for both next to the exe first, exactly this layout.
  File "..\target\release\${APP_EXE}"
  File /r "..\extension-host"
  SetOutPath "$INSTDIR\bin"
  File "..\..\bin\ctrace"
  SetOutPath "$INSTDIR"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "${APP_ICON}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "${APP_ICON}"

  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\${APP_EXE}"
  RMDir /r "$INSTDIR\extension-host"
  RMDir /r "$INSTDIR\bin"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_NAME}.lnk"

  DeleteRegKey HKLM "${UNINSTALL_KEY}"

  ; %APPDATA%/coretrace (settings, session, crash logs, installed
  ; extensions) is deliberately left in place -- an uninstall isn't a
  ; request to lose the user's extensions/API keys/session, matching
  ; how most Windows apps treat AppData on uninstall.
SectionEnd
