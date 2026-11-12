; Hovera NSIS installer hooks (referenced from tauri.conf.json -> bundle.windows.nsis.installerHooks)

!macro NSIS_HOOK_POSTUNINSTALL
  ; Remove the autostart entry so no dangling startup item points to a deleted exe.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Hovera"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Hovera"

  ; Leftovers from the legacy Electron build.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DynamicIslandWindows"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Dynamic Island"
!macroend
