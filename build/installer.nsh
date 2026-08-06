; Movie Creator Studio — カスタムNSIS(electron-builder include)
; アンインストール時: ユーザー確認のうえ、アプリがダウンロードしたモデル・
; 生成動画・設定を含む全データを削除し、インストール前の状態へ戻す。
; 自動アップデートによる内部アンインストール時(${isUpdated})は何も消さない。
; 注意: StrFunc等のトップレベル宣言はここでは使わない(電子ビルダーが本ファイルを
; インストーラー/アンインストーラー両方の文脈でincludeするため warning 6020 になる)。
; 注意: このファイルは生成スクリプトの「ヘッダ」として installer.nsi より先に
; include される。トップレベルに Function を書くと StrContains/LogicLib の
; include より先にコンパイルされて壊れるため、コードはすべてマクロ内に置き、
; 挿入位置(テンプレート側のフック)で展開させる。

; =============================================================================
; インストール先フォルダの「事前存在」記録
;
; 要件: アンインストールで消してよいのは【インストーラーが作成したもの】だけ。
; インストール前から存在していたフォルダ・ファイルは削除対象外。
;
; テンプレート(assistedInstaller.nsh の instFilesPre)は、選択パスに
; "${APP_FILENAME}" を含まない場合のみ "\${APP_FILENAME}" サブフォルダを
; 付加する。そのため、名前に APP 名を含む既存フォルダ(例: 既存の
; "D:\Movie Creator Studio")を選ぶと $INSTDIR はユーザーの既存フォルダ
; そのものになり、既定のアンインストール(RMDir /r $INSTDIR)は中のユーザー
; ファイルごと消してしまう。ここで「インストール直前にそのフォルダが存在
; したか」を判定・記録し、customRemoveFiles が選択削除に切り替える。
; =============================================================================
; $R5 のパスをその親フォルダに置き換える(親が無ければ "")。
; "C:\A\B" -> "C:\A"、"C:\A" -> "C:\"(ドライブルートは実在する境界として返す)。
; スクラッチ: $R0/$R1。インストーラー/アンインストーラー両文脈で使用。
!macro MCS_PARENT_DIR
  StrLen $R0 $R5
  ${Do}
    IntOp $R0 $R0 - 1
    ${If} $R0 < 2
      StrCpy $R5 ""
      ${ExitDo}
    ${EndIf}
    StrCpy $R1 $R5 1 $R0
    ${If} $R1 == "\"
      ${If} $R0 == 2
        StrCpy $R5 $R5 3
      ${Else}
        StrCpy $R5 $R5 $R0
      ${EndIf}
      ${ExitDo}
    ${EndIf}
  ${Loop}
!macroend

!ifndef BUILD_UNINSTALLER
  Var /GLOBAL mcsInstDirPreExisted
  ; インストールが作成する祖先フォルダの境界 = インストール直前に実在した
  ; 最も深い祖先。これより深い(=インストーラーが暗黙に作った)空フォルダは
  ; アンインストールで遡って削除する。ディレクトリページにパスを手入力すると
  ; 親フォルダごとインストーラーが作るため、INSTDIR だけ消しても親が残る
  ; (実機テストで空フォルダの残存を確認)。参照ダイアログの
  ; 「新しいフォルダーの作成」で作った場合はこの判定時点で実在する=境界側
  ; になり、ユーザー作成フォルダとして正しく保護される。
  Var /GLOBAL mcsPreexistBoundary

  ; 「最終的な $INSTDIR」を先読みして存在を判定する。
  ; - 通常(非サイレント): instFilesPre(assistedInstaller.nsh)と同じ規則を
  ;   複製 — パスに APP_FILENAME を含まなければサブフォルダが付加される。
  ; - サイレント(/S): ページの pre コールバックは一切実行されない(実測)。
  ;   つまり instFilesPre は走らず $INSTDIR がそのまま使われるため、付加規則を
  ;   適用してはならない(適用すると別のフォルダを判定してしまい、既存フォルダ
  ;   がフラグ0のままユーザーファイルごと削除される)。
  ; $R7/$R8 は退避してから使う(ページ間や .onInit の他コードを汚さない)。
  !macro MCS_DETECT_PREEXISTING_INSTDIR
    Push $R0
    Push $R1
    Push $R5
    Push $R7
    Push $R8
    ${If} ${Silent}
      StrCpy $R8 "$INSTDIR"
    ${Else}
      ${StrContains} $R7 "${APP_FILENAME}" "$INSTDIR"
      ${If} $R7 == ""
        StrCpy $R8 "$INSTDIR\${APP_FILENAME}"
      ${Else}
        StrCpy $R8 "$INSTDIR"
      ${EndIf}
    ${EndIf}
    ${If} ${FileExists} "$R8\${UNINSTALL_FILENAME}"
      ; 当アプリの既存インストールへの上書き: フォルダは(少なくとも一部)
      ; 当アプリ由来。初回インストール時に記録した判定・境界を引き継ぐ。
      ; (この時点では旧アンインストール前なのでキーはまだ読める)
      ReadRegStr $mcsInstDirPreExisted SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "McsInstDirPreExisted"
      ${If} $mcsInstDirPreExisted != "1"
        StrCpy $mcsInstDirPreExisted "0"
      ${EndIf}
      ReadRegStr $mcsPreexistBoundary SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "McsPreexistingAncestor"
    ${ElseIf} ${FileExists} "$R8\*.*"
      StrCpy $mcsInstDirPreExisted "1"
      StrCpy $mcsPreexistBoundary "" ; 何も作成しないので境界は不要
    ${ElseIf} ${FileExists} "$R8"
      ; パスに同名の「ファイル」が存在する異常系も安全側(事前存在)に倒す
      StrCpy $mcsInstDirPreExisted "1"
      StrCpy $mcsPreexistBoundary ""
    ${Else}
      StrCpy $mcsInstDirPreExisted "0"
      ; インストーラーが作ることになる祖先の境界 = 実在する最も深い祖先。
      ; INSTDIR より上で最初に見つかった実在フォルダ(ドライブルート含む)
      StrCpy $R5 "$R8"
      StrCpy $mcsPreexistBoundary ""
      StrCpy $R7 0
      ${Do}
        !insertmacro MCS_PARENT_DIR
        ${If} $R5 == ""
          ${ExitDo}
        ${EndIf}
        ${If} ${FileExists} "$R5\*.*"
        ${OrIf} ${FileExists} "$R5"
          StrCpy $mcsPreexistBoundary $R5
          ${ExitDo}
        ${EndIf}
        IntOp $R7 $R7 + 1
        ${If} $R7 >= 16
          ${ExitDo} ; 深すぎるパスは打ち切り(境界なし=祖先削除は行わない)
        ${EndIf}
      ${Loop}
    ${EndIf}
    Pop $R8
    Pop $R7
    Pop $R5
    Pop $R1
    Pop $R0
  !macroend

  ; サイレントインストール(/S [/D=...]): ページが走らないため .onInit で判定
  !macro customInit
    !insertmacro MCS_DETECT_PREEXISTING_INSTDIR
  !macroend

  ; 通常インストール: ディレクトリページの後で最終値に対して再判定する。
  ; customPageAfterChangeDir はページ定義領域(グローバル)に展開されるため、
  ; ここで Function を定義できる(Abort で画面は一切表示しない)。
  !macro customPageAfterChangeDir
    Function mcsDetectPreExistingDirPage
      !insertmacro MCS_DETECT_PREEXISTING_INSTDIR
      Abort ; 判定のみ・ページは出さない
    FunctionEnd
    Page custom mcsDetectPreExistingDirPage
  !macroend

  ; 判定結果をアンインストーラーが読めるように Uninstall キーへ記録
  ; (registryAddInstallInfo の後に呼ばれるのでキーは必ず存在する)
  !macro customInstall
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "McsInstDirPreExisted" "$mcsInstDirPreExisted"
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "McsPreexistingAncestor" "$mcsPreexistBoundary"
  !macroend
!endif

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; -----------------------------------------------------------------
    ; 1) アプリ由来のキャッシュ・実行痕跡は、データ削除の選択に関わらず削除
    ;    - electron-updater の更新ダウンロードキャッシュ(実機テストで
    ;      installer.exe 約100MB が残ることを確認)
    ;    - OS が記録する実行痕跡(MuiCache / 互換性アシスタント)の本アプリ分
    ; -----------------------------------------------------------------
    RMDir /r "$LOCALAPPDATA\movie-creator-studio-updater"
    RMDir /r "$LOCALAPPDATA\movie-creator-studio"
    DeleteRegValue HKCU "Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache" "$INSTDIR\${APP_EXECUTABLE_FILENAME}.FriendlyAppName"
    DeleteRegValue HKCU "Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache" "$INSTDIR\${APP_EXECUTABLE_FILENAME}.ApplicationCompany"
    DeleteRegValue HKCU "Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Compatibility Assistant\Store" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Compatibility Assistant\Store" "$INSTDIR\${UNINSTALL_FILENAME}"
    ; PCA はプロセス終了時に「実行された exe」を再記録するため、アンインストーラー
    ; 自身の分は同期削除では消しきれない(実機で残存を確認)。終了の数秒後に
    ; 非表示の切り離しワンショットで両方の値を掃除する(値が無ければ何もしない)
    ;
    ; SetOutPath $TEMP は必須。ExecShell は $OUTDIR を子プロセスの作業ディレクトリ
    ; として渡し(NSIS 実測で確認)、un.onInit が SetOutPath $INSTDIR 済みのため、
    ; そのままだと子 cmd.exe が $INSTDIR を CWD として約3秒間掴む。electron-builder
    ; テンプレートはこの直後に RMDir /r $INSTDIR を実行するので、中身は消えても
    ; フォルダ自体が削除できず空フォルダが残る(実機で再現。NSIS 実験でも
    ; 100% 再現し、この一行で解消することを確認)。
    SetOutPath "$TEMP"
    ExecShell "" "$SYSDIR\cmd.exe" '/c ping -n 4 127.0.0.1 >nul & reg delete "HKCU\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Compatibility Assistant\Store" /v "$INSTDIR\${UNINSTALL_FILENAME}" /f & reg delete "HKCU\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Compatibility Assistant\Store" /v "$INSTDIR\${APP_EXECUTABLE_FILENAME}" /f' SW_HIDE

    ; -----------------------------------------------------------------
    ; 2) 実行中プロセスを停止(常に実施)
    ;    本体は electron-builder の checkAppRunning が処理するが、ComfyUI
    ;    (python.exe)や llama-server はアプリ強制終了時に孤児として残り、
    ;    データフォルダのファイルを掴んだままだと削除が部分的に失敗する
    ;    (実機テストで engine/ だけが残る事象を確認)。停止対象は誤爆防止の
    ;    ため、実行ファイルを配置するサブフォルダ(engine/llm/ffmpeg)配下に
    ;    実行パスを持つプロセスのみに限定する。
    ; -----------------------------------------------------------------
    nsExec::Exec 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
    Pop $3

    ; データフォルダの場所をマーカーから $1 へ(プロセス停止と削除の両方で使用)
    ; マーカーは UTF-16LE + BOM(アプリ側 writeDataDirMarker と対)。
    ; 注意: FileRead は常に ANSI 解釈(BOM自動判別なし)のため、UTF-16 は
    ; FileReadUTF16LE で読む。旧版アプリが書いた ANSI/UTF-8 マーカーは
    ; ドライブレター検証(2文字目が ":")に落ちたとき ANSI で読み直す。
    StrCpy $1 ""
    ClearErrors
    FileOpen $0 "$APPDATA\movie-creator-studio\datadir.txt" r
    IfErrors mcs_marker_done
    FileReadUTF16LE $0 $1
    FileClose $0
    ; 先頭に BOM が残っていれば除去
    StrCpy $2 $1 1
    StrCmp $2 "${U+FEFF}" 0 mcs_bom_done
    StrCpy $1 $1 "" 1
  mcs_bom_done:
    StrCpy $2 $1 1 1
    StrCmp $2 ":" mcs_trim
    ; 旧形式(ANSI/UTF-8)フォールバック
    StrCpy $1 ""
    ClearErrors
    FileOpen $0 "$APPDATA\movie-creator-studio\datadir.txt" r
    IfErrors mcs_marker_done
    FileRead $0 $1
    FileClose $0

    ; 末尾の改行(\r\n)と余分な区切り(\)を除去
  mcs_trim:
    StrCpy $2 $1 1 -1
    StrCmp $2 "$\r" mcs_cut
    StrCmp $2 "$\n" mcs_cut
    StrCmp $2 "\" mcs_cut mcs_trimmed
  mcs_cut:
    StrCpy $1 $1 -1
    Goto mcs_trim
  mcs_trimmed:
    ; 妥当性: 4文字以上("C:\x"〜)かつドライブレター形式のみ採用
    StrLen $2 $1
    IntCmp $2 3 mcs_marker_bad mcs_marker_bad 0
    StrCpy $2 $1 1 1
    StrCmp $2 ":" mcs_marker_done
  mcs_marker_bad:
    StrCpy $1 ""
  mcs_marker_done:

    ${if} $1 != ""
      !insertmacro MCS_KILL_DATA_PROCESSES "$1"
    ${endif}
    !insertmacro MCS_KILL_DATA_PROCESSES "C:\MCS-Data"
    Sleep 800

    ; -----------------------------------------------------------------
    ; 3) ユーザー確認のうえ、モデル・生成動画・設定を完全削除
    ;    /SD IDNO: サイレント実行(/S)ではダイアログを出さず「データ保持」
    ;    を既定にする(無人環境で勝手にデータを消さない)
    ; -----------------------------------------------------------------
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "ダウンロードしたモデル・生成した動画・設定など、Movie Creator Studio のすべてのデータも削除しますか?$\r$\n$\r$\n「はい」= 完全削除(インストール前の状態に戻します)$\r$\n「いいえ」= アプリ本体のみ削除(データは残ります)" \
      /SD IDNO IDNO mcs_skip_data

    ; 3a) マーカーが指すデータフォルダ / 3b) 既定の C:\MCS-Data(残骸に備え両方)
    ${if} $1 != ""
      !insertmacro MCS_DELETE_DATA_SUBDIRS "$1"
    ${endif}
    !insertmacro MCS_DELETE_DATA_SUBDIRS "C:\MCS-Data"

    ; 3c) 設定・ライブラリ情報・ログ(userData)
    RMDir /r "$APPDATA\movie-creator-studio"

  mcs_skip_data:
  ${endIf}
!macroend

; データフォルダ配下でアプリが作るサブフォルダ(src/main/core/paths.ts の
; ensureDirs と対応。増やしたら両方を更新すること)。ルートを丸ごと消さず
; サブフォルダ単位で削除するのは、ユーザーが誤って広いフォルダ(プロファイル
; 直下など)をデータフォルダに選んでいても無関係なファイルを巻き込まない
; ため。ルート自体は空になった場合のみ削除する。
!macro MCS_DELETE_DATA_SUBDIRS ROOT
  RMDir /r "${ROOT}\engine"
  ; エンジン更新の「リネーム退避」が削除しきれなかった残骸(~eng1, ~eng2 …)。
  ; アプリ側でも起動時に掃除するが、掃除前にアンインストールされた場合に
  ; ここで確実に回収しないと「完全削除」後もルートが空にならず残ってしまう。
  ; 名前は src/main/setup/installer.ts の GRAVEYARD_PREFIX と対。"engine" より
  ; 短い名前なのは、退避でパスが伸びて RMDir /r の 260 文字上限を超えるのを
  ; 防ぐため(既定構成での実測: 最深 250 文字)。
  Push $R3
  Push $R4
  FindFirst $R3 $R4 "${ROOT}\~eng*"
  ${Do}
    ${If} $R4 == ""
      ${ExitDo}
    ${EndIf}
    RMDir /r "${ROOT}\$R4"
    FindNext $R3 $R4
  ${Loop}
  FindClose $R3
  Pop $R4
  Pop $R3
  RMDir /r "${ROOT}\models"
  RMDir /r "${ROOT}\ffmpeg"
  RMDir /r "${ROOT}\llm"
  RMDir /r "${ROOT}\work"
  RMDir /r "${ROOT}\library"
  RMDir /r "${ROOT}\exports"
  ; ロック解放待ちの再試行(実行ファイルを含む3フォルダのみ)
  IfFileExists "${ROOT}\engine\*.*" 0 +3
  Sleep 1000
  RMDir /r "${ROOT}\engine"
  IfFileExists "${ROOT}\llm\*.*" 0 +3
  Sleep 500
  RMDir /r "${ROOT}\llm"
  IfFileExists "${ROOT}\ffmpeg\*.*" 0 +3
  Sleep 500
  RMDir /r "${ROOT}\ffmpeg"
  RMDir "${ROOT}"
!macroend

; ${ROOT} の実行フォルダ(engine / 退避 ~eng* / llm / ffmpeg)配下から起動中の
; プロセスを停止。退避フォルダを含めるのは、リネーム後の孤児 python.exe は
; Windows 上「~engN\...」配下として報告され、engine\ 前置きでは一致しないため
; (それが残ると退避フォルダを削除できず「完全削除」が不完全になる)。
;
; パスは環境変数で「データとして」渡し、PowerShell のスクリプト本文には
; 一切埋め込まない。以前は -Command の単一引用符内へ生挿入していたため、
; Windows で正当な `D:\Ken's Videos\MCS-Data` のようなフォルダ名だと引用符が
; 閉じずに構文エラーとなり、孤児プロセスの停止が丸ごと実行されなかった
; (=engine\ がロックされたまま残り「完全削除」が黙って不完全になる)。
;
; 注: バッククォート文字列を使う(' と " を両方そのまま含められる。
;     '...''...' 形式は NSIS ではエスケープにならずパラメータが分割される)
;     `$$` は NSIS では文字 `$` そのもの(PowerShell 変数用)。
!macro MCS_KILL_DATA_PROCESSES ROOT
  System::Call 'kernel32::SetEnvironmentVariable(t "MCS_DATA_ROOT", t "${ROOT}")i.r3'
  nsExec::Exec `powershell -NoProfile -Command "$$r = $$env:MCS_DATA_ROOT; if ($$r) { Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -and ($$_.ExecutablePath.StartsWith(($$r.TrimEnd('\') + '\engine\'), 'OrdinalIgnoreCase') -or $$_.ExecutablePath.StartsWith(($$r.TrimEnd('\') + '\~eng'), 'OrdinalIgnoreCase') -or $$_.ExecutablePath.StartsWith(($$r.TrimEnd('\') + '\llm\'), 'OrdinalIgnoreCase') -or $$_.ExecutablePath.StartsWith(($$r.TrimEnd('\') + '\ffmpeg\'), 'OrdinalIgnoreCase')) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue } }"`
  Pop $3
  System::Call 'kernel32::SetEnvironmentVariable(t "MCS_DATA_ROOT", i 0)i.r3'
!macroend

; =============================================================================
; アプリ本体の削除(テンプレート既定の「RMDir /r $INSTDIR」を置き換える)
;
; McsInstDirPreExisted=1(インストール前から存在していたフォルダ)の場合は
; インストーラーが置いたペイロードだけを削除し、フォルダ自体とユーザーの
; ファイルは残す(空になっても削除しない — ユーザーが作ったフォルダである)。
; それ以外(インストーラーが作成した/旧版でフラグ無し)は従来どおり全削除。
; 更新(${isUpdated})中も選択削除に留め、事前存在フォルダのユーザーファイル
; を更新のたびに巻き込まない(直後に新バージョンが同じフォルダへ入る)。
; =============================================================================
!macro MCS_DELETE_PAYLOAD
  ; Electron ランタイム+アプリ本体。release\win-unpacked のトップレベルと
  ; 1:1 対応(Electron を更新して構成が変わったらここも更新すること)
  Delete "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  Delete "$INSTDIR\${UNINSTALL_FILENAME}"
  Delete "$INSTDIR\uninstallerIcon.ico"
  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\resources.pak"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\dxcompiler.dll"
  Delete "$INSTDIR\dxil.dll"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\libEGL.dll"
  Delete "$INSTDIR\libGLESv2.dll"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\vulkan-1.dll"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\resources"
!macroend

!macro customRemoveFiles
  ; 自プロセスの CWD を対象外へ移す(CWD になっているフォルダは削除できない)
  SetOutPath "$TEMP"
  ${if} ${isUpdated}
    !insertmacro MCS_DELETE_PAYLOAD
  ${else}
    ReadRegStr $R9 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "McsInstDirPreExisted"
    ${if} $R9 == "1"
      !insertmacro MCS_DELETE_PAYLOAD
    ${else}
      RMDir /r "$INSTDIR"
      !insertmacro MCS_CLEANUP_CREATED_ANCESTORS
    ${endif}
  ${endif}
!macroend

; インストーラーが暗黙に作成した「祖先」フォルダの掃除。
; ディレクトリページにパスを手入力すると、INSTDIR までの中間フォルダも
; インストーラーが作成する(実機テストで、手入力した親フォルダが空のまま
; 残存することを確認)。インストール時に記録した「実在していた最深の祖先」
; (McsPreexistingAncestor)まで、空のフォルダだけを RMDir(非再帰)で遡る。
; - 値なし(旧版インストール)や境界が INSTDIR の祖先でない場合は何もしない
; - ユーザーが後から中間フォルダに置いたファイルがあれば、そこで停止する
!macro MCS_CLEANUP_CREATED_ANCESTORS
  Push $R0
  Push $R1
  Push $R4
  Push $R5
  Push $R6
  Push $R7
  Push $R8
  ReadRegStr $R6 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "McsPreexistingAncestor"
  ${if} $R6 != ""
    ; 境界が $INSTDIR の前方一致(祖先)であることを確認(壊れた値への防御)
    StrLen $R7 $R6
    StrCpy $R4 "$INSTDIR" $R7
    ${if} $R4 == $R6
      StrCpy $R5 "$INSTDIR"
      StrCpy $R8 0
      ${Do}
        !insertmacro MCS_PARENT_DIR
        ${If} $R5 == ""
          ${ExitDo}
        ${EndIf}
        ${If} $R5 == $R6
          ${ExitDo} ; 境界(元から在ったフォルダ)に到達 — ここより上は触らない
        ${EndIf}
        StrLen $R4 $R5
        ${If} $R4 <= $R7
          ${ExitDo} ; 境界より浅くなった(異常値)— 打ち切り
        ${EndIf}
        RMDir "$R5" ; 空のときだけ消える(/r は使わない)
        ${If} ${FileExists} "$R5"
          ${ExitDo} ; 消えなかった = 空でない(ユーザーのファイルあり)— 停止
        ${EndIf}
        IntOp $R8 $R8 + 1
        ${If} $R8 >= 16
          ${ExitDo}
        ${EndIf}
      ${Loop}
    ${endif}
  ${endif}
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R1
  Pop $R0
!macroend

; 注: インストール先の「親フォルダ」は削除しない(以前は空なら削除する
; customUnInstallSection があったが、ユーザーがインストール時に指定した
; フォルダは残す仕様に変更した — 実地テストでの明示要件)。アンインストール
; で消えるのは $INSTDIR(アプリ本体フォルダ)までで、その $INSTDIR も
; インストール前から存在していた場合は customRemoveFiles が温存する。
