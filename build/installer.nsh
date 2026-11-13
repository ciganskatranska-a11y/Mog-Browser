; Mog Browser installer theme: black pages with bone text, and custom wording.

!macro mogDefine NAME VALUE
  !ifdef ${NAME}
    !undef ${NAME}
  !endif
  !define ${NAME} "${VALUE}"
!macroend

!macro customHeader
  !insertmacro mogDefine MUI_BGCOLOR "000000"
  !insertmacro mogDefine MUI_TEXTCOLOR "E6DCC3"
  !insertmacro mogDefine MUI_INSTFILESPAGE_COLORS "E6DCC3 000000"
  !insertmacro mogDefine MUI_INSTFILESPAGE_PROGRESSBAR "colored"
  !insertmacro mogDefine MUI_FINISHPAGE_TITLE "Mog Browser is installed"
  !insertmacro mogDefine MUI_FINISHPAGE_TEXT "You have ascended. Mog Browser keeps itself up to date from now on.$\r$\n$\r$\nPress Finish to start mogging."
  !insertmacro mogDefine MUI_UNCONFIRMPAGE_TEXT_TOP "It's over. This removes Mog Browser from your computer. Your bookmarks and settings are kept in case you come back."
!macroend

; Tor is optional. The installer carries the Tor Expert Bundle (vendor/tor) but only unpacks it when "Install Tor" is ticked.
; The choice is remembered, so silent auto-updates keep Tor if it was installed and leave it out if it wasn't.
!define MOG_TOR_KEY "Software\Mog Browser"

!ifndef BUILD_UNINSTALLER

  !include nsDialogs.nsh
  !include LogicLib.nsh

  Var mogTorBox
  Var mogTorChoice

  ; The page functions live inside the hook, which electron-builder inserts after its plugins are set up.
  !macro customPageAfterChangeDir
    Page custom mogTorPage mogTorPageLeave

  Function mogTorPage
    ${if} ${isUpdated}
      Abort
    ${endif}
    !insertmacro MUI_HEADER_TEXT "Tor tabs" "Optional. Leave this off if you don't need Tor."
    nsDialogs::Create 1018
    Pop $0
    ${if} $0 == error
      Abort
    ${endif}
    ${NSD_CreateLabel} 0 0 100% 52u "Tor tabs (Ctrl+Shift+O) send everything through the Tor network, pick bridges automatically when Tor is blocked, and always run in safest mode.$\r$\n$\r$\nThis uses about 50 MB of disk space. If you skip it, Tor tabs can still use an installed Tor Browser."
    Pop $0
    ${NSD_CreateCheckbox} 0 62u 100% 12u "Install Tor"
    Pop $mogTorBox
    ${if} $mogTorChoice == ""
      ReadRegStr $mogTorChoice HKCU "${MOG_TOR_KEY}" "InstallTor"
    ${endif}
    ${if} $mogTorChoice == 1
      ${NSD_Check} $mogTorBox
    ${endif}
    nsDialogs::Show
  FunctionEnd

  Function mogTorPageLeave
    ${NSD_GetState} $mogTorBox $mogTorChoice
    ${if} $mogTorChoice != ${BST_CHECKED}
      StrCpy $mogTorChoice 0
    ${else}
      StrCpy $mogTorChoice 1
    ${endif}
  FunctionEnd
  !macroend

  !macro customInstall
    ${if} ${isUpdated}
      ReadRegStr $mogTorChoice HKCU "${MOG_TOR_KEY}" "InstallTor"
    ${endif}
    RMDir /r "$INSTDIR\resources\tor"
    ${if} $mogTorChoice == 1
      DetailPrint "Installing Tor"
      SetOutPath "$INSTDIR\resources\tor"
      File /r "${PROJECT_DIR}\vendor\tor\*.*"
      SetOutPath "$INSTDIR"
      WriteRegStr HKCU "${MOG_TOR_KEY}" "InstallTor" "1"
    ${else}
      WriteRegStr HKCU "${MOG_TOR_KEY}" "InstallTor" "0"
    ${endif}
  !macroend

!else

  !macro customUnInstall
    ${ifNot} ${isUpdated}
      DeleteRegValue HKCU "${MOG_TOR_KEY}" "InstallTor"
      DeleteRegKey /ifempty HKCU "${MOG_TOR_KEY}"
    ${endif}
  !macroend

!endif
