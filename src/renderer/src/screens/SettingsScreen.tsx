import { useEffect, useState } from 'react'
import { useApp } from '../store'

export default function SettingsScreen(): React.JSX.Element {
  const { settings, engine, setupStatus, refreshBase, refreshSetup, jobs, exports, downloads, busyKeys } =
    useApp()
  const comfyInstalled = !!setupStatus?.comfyui.installed
  const [mirror, setMirror] = useState(settings?.hfMirror ?? '')
  const [mirrorError, setMirrorError] = useState<string | null>(null)
  const [mirrorSaved, setMirrorSaved] = useState(false)

  // settings may load after this screen mounts — fill the field once,
  // without clobbering anything the user has already typed
  useEffect(() => {
    if (settings?.hfMirror) setMirror((m) => (m === '' ? settings.hfMirror! : m))
  }, [settings?.hfMirror])

  async function saveMirror(): Promise<void> {
    const v = mirror.trim()
    if (v && !/^https:\/\/\S+$/.test(v)) {
      setMirrorError(
        'https:// で始まるURLを入力してください(例: https://hf-mirror.com)。通信の改ざんを防ぐため http:// は使用できません。空欄で保存すると解除されます'
      )
      return
    }
    setMirrorError(null)
    await window.mcs.setSettings({ hfMirror: v || null })
    await refreshBase()
    setMirrorSaved(true)
    setTimeout(() => setMirrorSaved(false), 2000)
  }

  if (!settings) return <div className="p-6 text-slate-400">読み込み中…</div>

  const jobsActive = jobs.some((j) => ['queued', 'preparing', 'running', 'saving'].includes(j.state))
  const downloadsActive =
    Object.values(downloads).some((d) => ['downloading', 'verifying', 'extracting'].includes(d.status)) ||
    Object.keys(busyKeys).length > 0
  // exports run from the editor screen and don't nav-lock the app, so the
  // user CAN reach this screen mid-export — the dataDir must stay put then
  const exportsActive = Object.values(exports).some(
    (x) => x.phase === 'preparing' || x.phase === 'encoding'
  )
  const dataDirLocked = jobsActive || downloadsActive || exportsActive

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <h1 className="text-lg font-bold">⚙️ 設定</h1>

      <section className="card p-4 space-y-3">
        <div className="text-sm font-bold">データフォルダ</div>
        <div className="flex items-center gap-3">
          <code className="text-xs bg-panel2 border border-line rounded px-2 py-1.5 flex-1">
            {settings.dataDir}
          </code>
          <button
            className="btn-ghost text-xs"
            disabled={dataDirLocked}
            title={dataDirLocked ? 'ダウンロード・生成の実行中は変更できません' : undefined}
            onClick={() =>
              void window.mcs.pickDirectory().then(async (dir) => {
                if (dir) {
                  await window.mcs.setSettings({ dataDir: dir })
                  await refreshBase()
                  await refreshSetup()
                }
              })
            }
          >
            変更
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          変更しても既存ファイルは移動されません。モデルを再ダウンロードするか、手動で移動してください。
          {dataDirLocked && (
            <span className="text-amber-400"> ※ 実行中の処理があるため現在は変更できません。</span>
          )}
        </p>
      </section>

      <section className="card p-4 space-y-3">
        <div className="text-sm font-bold">書き出し</div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.useNvenc}
            onChange={(e) => {
              void window.mcs.setSettings({ useNvenc: e.target.checked }).then(refreshBase)
            }}
          />
          NVENC ハードウェアエンコードを使用(高速・推奨)
        </label>
      </section>

      <section className="card p-4 space-y-3">
        <div className="text-sm font-bold">ダウンロード</div>
        <div>
          <div className="label">HuggingFace ミラー(通常は空欄)</div>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="https://hf-mirror.com"
              value={mirror}
              onChange={(e) => {
                setMirror(e.target.value)
                setMirrorError(null)
              }}
            />
            <button className="btn-ghost text-xs whitespace-nowrap" onClick={() => void saveMirror()}>
              {mirrorSaved ? '✓ 保存しました' : '保存'}
            </button>
          </div>
          {mirrorError && <div className="text-[11px] text-rose-400 mt-1">{mirrorError}</div>}
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <div className="text-sm font-bold">エンジン(ComfyUI)</div>
        <div className="text-xs text-slate-400">
          状態:{' '}
          {!comfyInstalled
            ? '未導入(セットアップ画面からインストールしてください)'
            : engine?.state === 'running'
              ? `稼働中 (port ${engine.port} / ComfyUI ${engine.comfyuiVersion ?? '?'})`
              : engine?.state === 'starting'
                ? '起動中…'
                : engine?.state === 'error'
                  ? `エラー: ${engine.lastError ?? '不明'}`
                  : '停止'}
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost text-xs"
            disabled={!comfyInstalled || engine?.state === 'running' || engine?.state === 'starting'}
            title={!comfyInstalled ? 'ComfyUI(生成エンジン)のインストールが必要です' : undefined}
            onClick={() => void window.mcs.startEngine().catch((e) => alert(String(e)))}
          >
            {engine?.state === 'starting' ? '起動中…' : '起動'}
          </button>
          <button
            className="btn-ghost text-xs"
            disabled={engine?.state === 'stopped' || jobsActive}
            title={jobsActive ? '生成ジョブの実行中は停止できません(キューから中止してください)' : undefined}
            onClick={() => void window.mcs.stopEngine()}
          >
            停止
          </button>
        </div>
        <p className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
          <span>通常は生成時に自動起動します。トラブル時はログ(logs/comfyui.log)を確認してください。</span>
          <button className="btn-ghost text-[11px] px-2 py-0.5" onClick={() => void window.mcs.openLogsFolder()}>
            📁 ログフォルダを開く
          </button>
        </p>
      </section>
    </div>
  )
}
