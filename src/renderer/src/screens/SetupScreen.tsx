import { useEffect, useMemo, useState } from 'react'
import type { DownloadProgress, ModelPack, UpdaterState } from '@shared/types'
import { useApp } from '../store'
import { fmtBytes, fmtSpeed } from '../lib/format'

function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export default function SetupScreen(): React.JSX.Element {
  const {
    env,
    settings,
    setupStatus,
    catalog,
    downloads,
    jobs,
    exports,
    refreshSetup,
    refreshBase,
    busyKeys,
    setBusy
  } = useApp()
  const [err, setErr] = useState<string | null>(null)
  const [licensePack, setLicensePack] = useState<ModelPack | null>(null)

  const vramGB = env?.gpu ? Math.round(env.gpu.vramMB / 1024) : 0
  const dataDisk = env?.disks.find((d) => settings?.dataDir.toUpperCase().startsWith(d.drive))

  // Files listed in MORE THAN ONE pack (text encoder / VAE / lightning LoRA).
  // Progress events are keyed by file id and appear on every card that lists
  // the file — during another pack's download an untouched card's rows
  // advance, which reads as the pack downloading itself (実機レポート:
  // Fun Control 5B / A14B). The card note and row suffix below name it.
  const sharedIds = useMemo(() => {
    const count = new Map<string, number>()
    for (const p of catalog) for (const f of p.files) count.set(f.id, (count.get(f.id) ?? 0) + 1)
    return new Set(
      [...count.entries()].filter(([, n]) => n >= 2).map(([id]) => id)
    )
  }, [catalog])

  // ---- VRAM-based download gating ---------------------------------------------
  // only meaningful when we could actually measure VRAM (NVIDIA + driver OK)
  const vramKnown = vramGB > 0
  const vramLimitOn = (settings?.vramLimitEnabled ?? true) && vramKnown
  const vramBlocked = (pack: ModelPack): boolean => vramLimitOn && pack.minVramGB > vramGB
  // once an over-budget model has been downloaded (or is downloading) with the
  // limit off, turning the limit back ON would retroactively mark it 対象外 —
  // an inconsistent state, so lock the toggle in that case
  // precise per-pack signals (NOT a shared-file heuristic — a shared file
  // landing via a budget-OK pack must never falsely lock the toggle):
  //  - the pack's own busyKey (this window started the download), or
  //  - the pack is fully present, or
  //  - a file is live-downloading and ONLY over-budget packs contain it
  //    (covers a window reload that wiped busyKeys while the main-process
  //    download keeps running; a file shared with a budget-OK pack proves
  //    nothing, so it doesn't lock)
  const overBudget = (p: ModelPack): boolean => p.minVramGB > vramGB
  const fileOnlyInOverBudgetPacks = (fileId: string): boolean =>
    catalog.filter((q) => q.files.some((g) => g.id === fileId)).every(overBudget)
  const overBudgetInUse =
    vramKnown &&
    catalog.some(
      (p) =>
        overBudget(p) &&
        (busyKeys[`pack:${p.id}`] ||
          p.files.every((f) => setupStatus?.modelFiles[f.id]) ||
          p.files.some(
            (f) =>
              ['downloading', 'verifying'].includes(downloads[f.id]?.status ?? '') &&
              fileOnlyInOverBudgetPacks(f.id)
          ))
    )
  const vramToggleLocked = !vramLimitOn && overBudgetInUse
  async function setVramLimit(on: boolean): Promise<void> {
    if (on && overBudgetInUse) return // cannot re-enable while an over-budget model is in use
    await window.mcs.setSettings({ vramLimitEnabled: on })
    await refreshBase()
  }

  // ---- busy/exclusivity ------------------------------------------------------
  const anyInstallBusy = Object.keys(busyKeys).some((k) => k.startsWith('install:'))
  const anyPackBusy = Object.keys(busyKeys).some((k) => k.startsWith('pack:'))
  const downloadsActive = Object.values(downloads).some((d) =>
    ['downloading', 'verifying', 'extracting'].includes(d.status)
  )
  const jobsActive = jobs.some((j) => ['queued', 'preparing', 'running', 'saving'].includes(j.state))
  const exportsActive = Object.values(exports).some(
    (x) => x.phase === 'preparing' || x.phase === 'encoding'
  )
  // reinstalling the engine STOPS it (killing any running generation), and
  // reinstalling ffmpeg mid-export would copy onto a locked exe
  const toolInstallBlocked = jobsActive || exportsActive
  /** anything that would break if dataDir changed mid-way */
  const dataDirLocked = anyInstallBusy || anyPackBusy || downloadsActive || jobsActive || exportsActive

  async function runInstall(component: 'comfyui' | 'ffmpeg' | 'llm'): Promise<void> {
    const key = `install:${component}`
    if (busyKeys[key]) return
    setBusy(key, true)
    setErr(null)
    try {
      await window.mcs.installComponent(component)
    } catch (e) {
      setErr(cleanError(e))
    } finally {
      setBusy(key, false)
      void refreshSetup()
    }
  }

  async function changeDataDir(): Promise<void> {
    if (dataDirLocked) return
    const dir = await window.mcs.pickDirectory()
    if (dir) {
      await window.mcs.setSettings({ dataDir: dir })
      await refreshBase()
      await refreshSetup()
    }
  }

  // ---- pack helpers ------------------------------------------------------------
  function packInstalled(pack: ModelPack): boolean {
    // custom nodes count too: a pack whose files are all present but whose
    // node is missing showed 「✓ 導入済み」 with no button, while its screen
    // stayed locked forever — no way to fix it from the UI
    return (
      pack.files.every((f) => setupStatus?.modelFiles[f.id]) &&
      pack.requiresCustomNodes.every((n) => setupStatus?.customNodes[n])
    )
  }
  function packMissingBytes(pack: ModelPack): number {
    return pack.files.filter((f) => !setupStatus?.modelFiles[f.id]).reduce((a, f) => a + f.bytes, 0)
  }
  function packActive(pack: ModelPack): boolean {
    if (busyKeys[`pack:${pack.id}`]) return true
    // Reload-resilient fallback: this pack counts as downloading only when
    // EVERY file it still needs is already accounted for (done or in flight).
    // Keying off "any file is downloading" made a single shared file (UMT5 is
    // in five packs) mark untouched packs as active, hiding their download
    // button and offering a cancel that stopped somebody else's pack.
    const missing = pack.files.filter((f) => !setupStatus?.modelFiles[f.id])
    if (missing.length === 0) return false
    const live = (id: string): boolean =>
      ['downloading', 'verifying'].includes(downloads[id]?.status ?? '')
    return missing.some((f) => live(f.id)) && missing.every((f) => live(f.id) || downloads[f.id]?.status === 'done')
  }
  /** cumulative pack progress: completed files count as their full size */
  function packOverall(pack: ModelPack): { pct: number; done: number; total: number } {
    const totalBytes = pack.files.reduce((a, f) => a + f.bytes, 0)
    let got = 0
    let done = 0
    for (const f of pack.files) {
      const d = downloads[f.id]
      if (setupStatus?.modelFiles[f.id] || d?.status === 'done') {
        got += f.bytes
        done++
      } else if (d && d.status !== 'extracting') {
        // downloading/verifying live progress; error/cancelled events carry
        // the real on-disk partial too (resumable) — count it so the pack %
        // never jumps backwards on a hiccup
        got += Math.min(d.receivedBytes, f.bytes)
      }
    }
    return { pct: Math.min(100, Math.round((got / totalBytes) * 100)), done, total: pack.files.length }
  }

  async function startPackDownload(pack: ModelPack): Promise<void> {
    setLicensePack(null)
    const key = `pack:${pack.id}`
    // parallel packs are allowed — shared files are deduped main-side
    // (in-flight downloads are awaited, never double-written)
    if (busyKeys[key]) return
    if (vramBlocked(pack)) {
      setErr(`${pack.name} はこのPCのVRAM(${vramGB}GB)では動作対象外です(必要: ${pack.minVramGB}GB以上)`)
      return
    }
    if (pack.requiresCustomNodes.length > 0 && !setupStatus?.comfyui.installed) {
      setErr('このモデルはカスタムノードを使用するため、先に ComfyUI をインストールしてください。')
      return
    }
    setBusy(key, true)
    setErr(null)
    try {
      // always run: idempotent (skips what exists) and also tops up the
      // node's model assets on installs from older app versions
      for (const nodeId of pack.requiresCustomNodes) {
        await window.mcs.installComponent(`customnode:${nodeId}`)
      }
      const missing = pack.files.filter((f) => !setupStatus?.modelFiles[f.id]).map((f) => f.id)
      // pack.id scopes cancels: a cancel pressed in THIS card stops this pack,
      // while packs sharing the same file only skip that one file
      await window.mcs.downloadModelFiles(missing, pack.id)
    } catch (e) {
      setErr(cleanError(e))
    } finally {
      setBusy(key, false)
      void refreshSetup()
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-bold">🧰 セットアップ</h1>
        <p className="text-sm text-slate-400 mt-1">
          エンジン・ツール・モデルの導入をここで行います。すべてローカルにインストールされます。
        </p>
      </div>

      {err && (
        <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800 rounded-lg p-3 whitespace-pre-wrap">
          {err}
        </div>
      )}

      {/* 1. 環境診断 */}
      <section className="card p-4">
        <div className="font-bold text-sm mb-3">① 環境診断</div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="label">GPU</div>
            <div className={env?.gpu ? '' : 'text-rose-400'}>
              {env?.gpu ? `${env.gpu.name} (${vramGB}GB)` : 'NVIDIA GPU 未検出'}
            </div>
            {env?.gpu && vramGB < 12 && (
              <div className="text-[11px] text-amber-400 mt-1">
                VRAM 12GB未満: 軽量モデル(Wan2.2 5B / Cosmos 2B)を推奨
              </div>
            )}
          </div>
          <div>
            <div className="label">システムRAM</div>
            <div>
              {env?.ramGB ?? '--'}GB{' '}
              {env && env.ramGB < 64 && <span className="text-amber-400 text-[11px]">(推奨64GB)</span>}
            </div>
          </div>
          <div>
            <div className="label">ディスク空き ({dataDisk?.drive ?? '--'})</div>
            <div>
              {dataDisk ? `${dataDisk.freeGB}GB / ${dataDisk.totalGB}GB` : '--'}
              {dataDisk && dataDisk.freeGB < 100 && (
                <span className="text-amber-400 text-[11px] ml-1">(全モデル導入には150GB以上推奨)</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. インストール先 */}
      <section className="card p-4">
        <div className="font-bold text-sm mb-2">② インストール先</div>
        <div className="flex items-center gap-3">
          <code className="text-xs bg-panel2 border border-line rounded px-2 py-1.5 flex-1">
            {settings?.dataDir}
          </code>
          <button
            className="btn-ghost text-xs"
            disabled={dataDirLocked}
            title={dataDirLocked ? 'ダウンロード・生成の実行中は変更できません' : undefined}
            onClick={() => void changeDataDir()}
          >
            変更
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          エンジン・モデル・生成動画がここに保存されます。パスが短いほど安全です(Windowsの260文字制限対策)。
          {dataDirLocked && (
            <span className="text-amber-400"> ※ 実行中の処理があるため現在は変更できません。</span>
          )}
        </p>
      </section>

      {/* 3. エンジンとツール */}
      <section className="card p-4 space-y-4">
        <div className="font-bold text-sm">③ エンジンとツール</div>
        <ComponentRow
          name="ComfyUI(生成エンジン)"
          desc={`GPL-3.0 / 動作検証済みバージョンに固定(約2GBダウンロード・展開後約7GB)${
            setupStatus?.comfyui.installed && setupStatus.comfyui.version
              ? ` / 導入済み: ${setupStatus.comfyui.version}`
              : ''
          }`}
          installed={!!setupStatus?.comfyui.installed}
          busy={!!busyKeys['install:comfyui']}
          disabled={anyInstallBusy || toolInstallBlocked}
          progress={downloads['comfyui']}
          onInstall={() => void runInstall('comfyui')}
          updateLabel={
            setupStatus?.comfyui.installed &&
            setupStatus.comfyui.pinnedVersion &&
            setupStatus.comfyui.version !== setupStatus.comfyui.pinnedVersion
              ? `エンジンを更新 (${setupStatus.comfyui.pinnedVersion})`
              : undefined
          }
        />
        <ComponentRow
          name="ffmpeg / ffprobe(編集・書き出し)"
          desc="BtbN win64-gpl ビルド(GPLv3・別プロセス実行、約150MB)"
          installed={!!setupStatus?.ffmpeg.installed}
          busy={!!busyKeys['install:ffmpeg']}
          disabled={anyInstallBusy || toolInstallBlocked}
          progress={downloads['ffmpeg']}
          onInstall={() => void runInstall('ffmpeg')}
        />
        <ComponentRow
          name="プロンプト変換AI(日本語→英語・任意)"
          desc="llama.cpp + Qwen3-4B-Instruct(Apache-2.0)/ 約2.6GBダウンロード・RAM約4GB使用・CPU動作でGPUは使いません"
          installed={!!setupStatus?.llm.installed}
          busy={!!busyKeys['install:llm']}
          disabled={anyInstallBusy || toolInstallBlocked}
          progress={downloads['llm']}
          onInstall={() => void runInstall('llm')}
        />
        {anyInstallBusy && (
          <p className="text-[11px] text-slate-500">
            ※ 安全のため、エンジン/ツールのインストールは同時に1つずつ実行します。
          </p>
        )}
        {toolInstallBlocked && (
          <p className="text-[11px] text-amber-400">
            ※ 動画の生成・書き出しの実行中は、エンジン/ツールの(再)インストールはできません。
          </p>
        )}
      </section>

      {/* 4. モデル */}
      <section className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="font-bold text-sm">④ 動画生成モデル(必要なものだけ選択)</div>
          <label
            className={`ml-auto flex items-center gap-2 text-xs text-slate-300 select-none ${
              vramToggleLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
            }`}
            title={
              !vramKnown
                ? 'VRAMを検出できないため制限は適用されません'
                : vramToggleLocked
                  ? 'VRAM対象外モデルのダウンロードを開始したため、制限はONに戻せません'
                  : 'ON: このPCのVRAMで実用にならないモデルのダウンロードを防ぎます。OFFで全モデルを解放(自己責任)'
            }
          >
            <span>
              VRAMによる制限
              {vramKnown ? `(このPC: ${vramGB}GB)` : ''}
            </span>
            {/* toggle switch */}
            <span
              role="switch"
              aria-checked={settings?.vramLimitEnabled ?? true}
              aria-disabled={vramToggleLocked}
              onClick={() => !vramToggleLocked && void setVramLimit(!(settings?.vramLimitEnabled ?? true))}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                (settings?.vramLimitEnabled ?? true) ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  (settings?.vramLimitEnabled ?? true) ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </span>
          </label>
        </div>
        {!vramKnown && (
          <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-800 rounded-lg p-2">
            ⚠️ NVIDIA GPUのVRAMを検出できないため、VRAM制限は適用されません。本アプリの動画生成にはNVIDIA
            GPU(VRAM 8GB以上)が必要です。
          </div>
        )}
        {vramKnown && !(settings?.vramLimitEnabled ?? true) && (
          <div className="text-[11px] text-amber-400/90 bg-amber-950/20 border border-amber-900 rounded-lg p-2">
            ⚠️ 制限OFF: このPCのVRAM({vramGB}GB)を超えるモデルもダウンロードできますが、生成が極端に遅い・
            途中で停止するなどの可能性があります。
          </div>
        )}
        {catalog.map((pack) => {
          const installed = packInstalled(pack)
          const active = packActive(pack)
          const overall = packOverall(pack)
          // preconditions: the button is only enabled when the download can succeed
          const needsComfy = pack.requiresCustomNodes.length > 0 && !setupStatus?.comfyui.installed
          // MiniMax H3 nodes ship with ComfyUI v0.30+ — an older pinned engine
          // would reject every generation at /prompt validation
          const needsEngineUpdate =
            pack.family === 'minimaxh3' &&
            !!setupStatus?.comfyui.installed &&
            setupStatus.comfyui.version !== setupStatus.comfyui.pinnedVersion
          const missingBytes = packMissingBytes(pack)
          const diskShort = !!dataDisk && dataDisk.freeGB * 1024 ** 3 < missingBytes * 1.05
          const blockReason = vramBlocked(pack)
            ? `このPCのVRAM(${vramGB}GB)では動作対象外です(必要: ${pack.minVramGB}GB以上)。上のスイッチをOFFにすると解除できます`
            : needsComfy || (pack.family === 'minimaxh3' && !setupStatus?.comfyui.installed)
              ? '先に ComfyUI(生成エンジン)のインストールが必要です'
              : needsEngineUpdate
                ? 'このモデルには新しいエンジンが必要です。「③ エンジンとツール」の「エンジンを更新」を先に実行してください'
                : diskShort
                  ? 'ディスクの空き容量が不足しています'
                  : null
          return (
            <div key={pack.id} className="card p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                    {pack.name}
                    {pack.recommended && (
                      <span className="text-[10px] bg-indigo-500/30 text-indigo-200 rounded px-1.5 py-0.5">
                        推奨
                      </span>
                    )}
                    <span
                      className={`text-[10px] rounded px-1.5 py-0.5 border ${
                        vramBlocked(pack)
                          ? 'border-rose-700 text-rose-300 bg-rose-950/40'
                          : 'border-line text-slate-400'
                      }`}
                      title="実用的に動作する最低VRAM(標準プリセット・RAMオフロード前提)"
                    >
                      最低VRAM {pack.minVramGB}GB
                    </span>
                    {installed && <span className="text-emerald-400 text-xs">✓ 導入済み</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{pack.description}</p>
                  <div className="text-[11px] text-slate-500 mt-1.5">
                    {pack.vramNote} / ライセンス: {pack.license.name}
                  </div>
                  {pack.files.some((f) => sharedIds.has(f.id)) && (
                    <div className="text-[11px] text-sky-300/80 mt-1">
                      🔗 テキストエンコーダ・VAEなど一部のファイルは他のモデルと共通です。他のモデルのダウンロード中は共通ファイルの進捗がこのカードにも表示されますが、このモデル自体が自動でダウンロードされることはありません。共通ファイルは一度取得すれば再ダウンロード不要です。
                    </div>
                  )}
                  {pack.requiresCustomNodes.length > 0 && (
                    <div className={`text-[11px] mt-1 ${needsComfy ? 'text-amber-400' : 'text-slate-500'}`}>
                      ※ このモデルはカスタムノード(ComfyUI拡張)を使用します — ComfyUI本体のインストール後にダウンロードできます
                    </div>
                  )}
                  {pack.license.warnings.length > 0 && (
                    <ul className="text-[11px] text-amber-400/90 mt-1 list-disc pl-4">
                      {pack.license.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {installed ? null : active ? (
                    <div className="text-xs text-sky-300 whitespace-nowrap">⬇ ダウンロード中…</div>
                  ) : (
                    <>
                      <button
                        className="btn-primary text-xs"
                        disabled={!!blockReason}
                        title={blockReason ?? undefined}
                        onClick={() => setLicensePack(pack)}
                      >
                        {overall.done > 0 ? 'ダウンロード再開' : 'ダウンロード'}
                      </button>
                      <div className="text-[11px] text-slate-500 mt-1">{fmtBytes(missingBytes)}</div>
                      {blockReason && (
                        <div className="text-[11px] text-amber-400 mt-1 max-w-40">{blockReason}</div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* overall pack progress — stays until every file is done */}
              {(active || (!installed && overall.done > 0)) && (
                <div className="mt-3 border-t border-line pt-2">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-300">
                    <span>
                      パック全体 {overall.pct}%(ファイル {overall.done}/{overall.total} 完了)
                    </span>
                    {!active && overall.done > 0 && !installed && (
                      <span className="text-amber-400">中断中 — 「ダウンロード再開」で続きから</span>
                    )}
                  </div>
                  <div className="h-2 bg-panel2 rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${overall.pct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* custom node install progress (runs before the model files) */}
              {pack.requiresCustomNodes.map((nodeId) => {
                const d = downloads[`customnode:${nodeId}`]
                if (!d || d.status === 'done') return null
                return <FileProgressRow key={nodeId} label={`カスタムノード: ${d.label}`} d={d} />
              })}

              {/* per-file progress */}
              {pack.files.map((f, fileIdx) => {
                const d = downloads[f.id]
                if (!d || d.status === 'done') return null
                // a shared file advancing while THIS pack has no active
                // download is being fetched through another pack's button
                const viaOther =
                  !active &&
                  sharedIds.has(f.id) &&
                  (d.status === 'downloading' || d.status === 'verifying')
                return (
                  <FileProgressRow
                    key={f.id}
                    label={`ファイル ${fileIdx + 1}/${pack.files.length}: ${d.label}${
                      viaOther ? '(他モデルと共通 — 他のモデル側で取得中)' : ''
                    }`}
                    d={d}
                    onCancel={
                      d.status === 'downloading'
                        ? () => void window.mcs.cancelDownload(f.id, pack.id)
                        : undefined
                    }
                  />
                )
              })}
            </div>
          )
        })}
      </section>

      {/* 5. アプリの更新 */}
      <section className="card p-4 space-y-2">
        <div className="font-bold text-sm">⑤ アプリの更新</div>
        <UpdaterCard />
      </section>

      {/* license consent modal */}
      {licensePack && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-8">
          <div className="card p-5 max-w-lg w-full space-y-3">
            <div className="font-bold">{licensePack.name} のライセンス確認</div>
            <div className="text-sm text-slate-300">
              このモデルは <span className="font-semibold">{licensePack.license.name}</span>{' '}
              の下で提供されています。
            </div>
            <div className="text-xs text-slate-400">{licensePack.license.commercialNote}</div>
            {licensePack.license.warnings.length > 0 && (
              <ul className="text-xs text-amber-400/90 list-disc pl-4 space-y-1">
                {licensePack.license.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <button
              className="text-xs text-accent underline"
              onClick={() => void window.mcs.openExternal(licensePack.license.url)}
            >
              ライセンス全文を開く ↗
            </button>
            <div className="text-[11px] text-slate-500">
              モデルは HuggingFace の公開リポジトリから直接ダウンロードされます(本アプリはモデルを再配布しません)。複数のファイルを順番にダウンロードし、途中で中断しても続きから再開できます。
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button className="btn-ghost text-sm" onClick={() => setLicensePack(null)}>
                キャンセル
              </button>
              <button
                className="btn-primary text-sm"
                disabled={!!busyKeys[`pack:${licensePack.id}`]}
                onClick={() => void startPackDownload(licensePack)}
              >
                同意してダウンロード ({fmtBytes(packMissingBytes(licensePack))})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function FileProgressRow({
  label,
  d,
  onCancel
}: {
  label: string
  d: DownloadProgress
  onCancel?: () => void
}): React.JSX.Element {
  const pct = d.totalBytes > 0 ? Math.round((d.receivedBytes / d.totalBytes) * 100) : 0
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[11px] text-slate-400 gap-3">
        <span className="truncate">{label}</span>
        <span className="whitespace-nowrap">
          {d.status === 'downloading'
            ? `${pct}% (${fmtSpeed(d.bytesPerSec)})${d.error ? ` — ${d.error}` : ''}`
            : d.status === 'verifying'
              ? 'SHA256検証中…'
              : d.status === 'extracting'
                ? '展開中…'
                : d.status === 'error'
                  ? `エラー: ${d.error?.slice(0, 80)}`
                  : d.status === 'cancelled'
                    ? 'キャンセル済み(「ダウンロード再開」で続きから)'
                    : d.status}
        </span>
      </div>
      <div className="h-1.5 bg-panel2 rounded-full mt-1 overflow-hidden">
        <div
          className={`h-full transition-all ${
            d.status === 'error'
              ? 'bg-rose-500'
              : d.status === 'cancelled'
                ? 'bg-amber-500'
                : 'bg-sky-500'
          }`}
          style={{ width: `${d.status === 'verifying' || d.status === 'extracting' ? 100 : pct}%` }}
        />
      </div>
      {onCancel && (
        <button className="text-[11px] text-slate-500 hover:text-rose-400 mt-0.5" onClick={onCancel}>
          キャンセル
        </button>
      )}
    </div>
  )
}

function ComponentRow(props: {
  name: string
  desc: string
  installed: boolean
  busy: boolean
  disabled: boolean
  progress?: DownloadProgress
  onInstall: () => void
  /** shown when installed but an update to the pinned version is available */
  updateLabel?: string
}): React.JSX.Element {
  const showProgress = props.progress && props.progress.status !== 'done' && props.busy
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium">{props.name}</div>
          <div className="text-[11px] text-slate-500">{props.desc}</div>
        </div>
        {props.installed && props.updateLabel && !props.busy ? (
          <>
            <span className="text-emerald-400 text-sm">✓ 導入済み</span>
            <button
              className="btn-primary text-xs"
              disabled={props.disabled}
              title={props.disabled ? '他の処理が完了するまでお待ちください' : undefined}
              onClick={props.onInstall}
            >
              {props.updateLabel}
            </button>
          </>
        ) : props.installed && !props.busy ? (
          <span className="text-emerald-400 text-sm">✓ 導入済み</span>
        ) : (
          <button
            className="btn-primary text-xs"
            disabled={props.disabled || props.busy}
            title={props.disabled && !props.busy ? '他のインストールが完了するまでお待ちください' : undefined}
            onClick={props.onInstall}
          >
            {props.busy ? '導入中…' : 'インストール'}
          </button>
        )}
      </div>
      {/* progress renders directly under its own row */}
      {showProgress && <FileProgressRow label={props.progress!.label} d={props.progress!} />}
    </div>
  )
}

/** ⑤ アプリの更新 — 手動チェック + 更新状態の常時表示(main の updater が
 *  イベントで状態を push する。詳細ログは logs/updater.log)。 */
function UpdaterCard(): React.JSX.Element {
  const [st, setSt] = useState<UpdaterState | null>(null)
  useEffect(() => {
    let alive = true
    void window.mcs.getUpdaterState().then((s) => {
      if (alive) setSt(s)
    })
    const off = window.mcs.onUpdaterState((s) => setSt(s))
    return () => {
      alive = false
      off()
    }
  }, [])

  if (!st) return <div className="text-xs text-slate-500">状態を取得中…</div>
  // must match checkForUpdatesNow's own busy set, or the button is enabled for
  // a call that returns without doing anything (a dead click)
  const busy =
    st.status === 'checking' ||
    st.status === 'downloading' ||
    st.status === 'downloaded' ||
    st.status === 'applying'
  const checkedAt = st.checkedAt
    ? new Date(st.checkedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    : null
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-300">
          現在のバージョン: <b>v{st.currentVersion}</b>
        </span>
        {st.supported ? (
          <button
            className="btn-ghost text-xs px-3 py-1"
            disabled={busy}
            title={
              st.status === 'downloaded' || st.status === 'applying'
                ? '更新はダウンロード済みです(再起動で適用されます)'
                : busy
                  ? '確認・ダウンロード中です'
                  : 'GitHub の最新リリースと照合します'
            }
            onClick={() => void window.mcs.checkForUpdates().catch((e) => alert(cleanError(e)))}
          >
            {st.status === 'downloading'
              ? '⏳ ダウンロード中…'
              : st.status === 'checking'
                ? '⏳ 確認中…'
                : '🔄 今すぐ更新を確認'}
          </button>
        ) : (
          <span className="text-[11px] text-slate-500">
            (開発実行では無効です — インストール版で利用できます)
          </span>
        )}
        {(st.status === 'downloaded' || st.status === 'applying') && (
          <button
            className="btn-primary text-xs px-3 py-1"
            disabled={st.status === 'applying'}
            onClick={() => {
              // the main side refuses mid-generation — surface that reason
              // instead of letting the rejection vanish into the console
              void window.mcs.installUpdate().catch((e) => alert(cleanError(e)))
            }}
          >
            ⚡ 今すぐ再起動して更新
          </button>
        )}
      </div>
      {st.status === 'not-available' && (
        <div className="text-xs text-emerald-400">
          ✅ 最新版です(v{st.latestVersion ?? st.currentVersion})
          {checkedAt ? ` — 最終確認 ${checkedAt}` : ''}
        </div>
      )}
      {st.status === 'downloading' && (
        <div className="space-y-1">
          <div className="text-xs text-slate-300">
            ⬇️ 新しいバージョン v{st.latestVersion} をダウンロード中… {st.percent ?? 0}%
          </div>
          <div className="h-1.5 bg-panel2 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-all"
              style={{ width: `${st.percent ?? 0}%` }}
            />
          </div>
        </div>
      )}
      {st.status === 'downloaded' && (
        <div className="text-xs text-emerald-400">
          ✅ v{st.latestVersion} の準備ができました — アプリ終了時に自動適用されます(上のボタンで今すぐ適用も可)
        </div>
      )}
      {st.status === 'applying' && (
        <div className="text-xs text-slate-300">
          ⏳ 更新を適用中… エンジンを停止しています。まもなくアプリが再起動します
        </div>
      )}
      {st.status === 'error' && (
        <div className="text-xs text-rose-400">
          ⚠️ 更新の確認・ダウンロードに失敗しました(オフラインの可能性)。もう一度お試しください
          {st.error && <span className="text-slate-500"> — 詳細: {st.error}</span>}
        </div>
      )}
      {st.supported && (st.status === 'idle' || st.status === 'checking') && (
        <div className="text-[11px] text-slate-500">
          起動時に自動確認します。新しいバージョンは自動でダウンロードされ、アプリ終了時に適用されます
        </div>
      )}
    </div>
  )
}
