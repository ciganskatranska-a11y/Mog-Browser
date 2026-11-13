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
