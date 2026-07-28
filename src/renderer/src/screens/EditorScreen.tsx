import { useEffect, useMemo, useState } from 'react'
import type {
  EditClip,
  EditProject,
  ExportPreset,
  ExportRequest,
  TextOverlay,
  VideoRecord
} from '@shared/types'
import { clampNum } from '../lib/num'
import { useApp } from '../store'
import { fmtDuration } from '../lib/format'

type Bgm = NonNullable<EditProject['bgm']>

export default function EditorScreen(): React.JSX.Element {
  const { videos, editorSeedIds, setEditorSeedIds, exports, editorProject, setEditorProject } =
    useApp()
  // the project lives in the store so navigating away does not discard the edit
  const { clips, bgm, overlays, keepClipAudio } = editorProject
  const fadeIn = editorProject.fadeInSec
  const fadeOut = editorProject.fadeOutSec
  // functional updates resolve against the STORE's latest state, not this
  // render's snapshot: on mount, the seed effect adds clips and the ghost-clip
  // sweep runs right after it in the same commit — based on the snapshot, the
  // sweep would write the pre-seed array back and silently drop the selection
  const setClips = (next: EditClip[] | ((prev: EditClip[]) => EditClip[])): void =>
    setEditorProject((prev) => ({
      clips: typeof next === 'function' ? next(prev.clips) : next
    }))
  const setBgm = (next: Bgm | null): void => setEditorProject({ bgm: next })
  const setOverlays = (next: TextOverlay[] | ((prev: TextOverlay[]) => TextOverlay[])): void =>
    setEditorProject((prev) => ({
      overlays: typeof next === 'function' ? next(prev.overlays) : next
    }))
  const setFadeIn = (v: number): void => setEditorProject({ fadeInSec: v })
  const setFadeOut = (v: number): void => setEditorProject({ fadeOutSec: v })
  const setKeepClipAudio = (v: boolean): void => setEditorProject({ keepClipAudio: v })
  const [showExport, setShowExport] = useState(false)
  const [currentExportId, setCurrentExportId] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  const byId = useMemo(() => new Map(videos.map((v) => [v.id, v])), [videos])

  // seed clips from library selection
  useEffect(() => {
    if (editorSeedIds.length > 0) {
      setClips((prev) => [
        ...prev,
        ...editorSeedIds
          .filter((id) => byId.has(id))
          .map((id) => ({ videoId: id, inSec: 0, outSec: 0 }))
      ])
      setEditorSeedIds([])
    }
  }, [editorSeedIds, byId, setEditorSeedIds])

  // drop clips whose source video was deleted from the library — otherwise a
  // ghost row lingers in state and export would fail reactively in main
  useEffect(() => {
    setClips((prev) =>
      prev.every((c) => byId.has(c.videoId)) ? prev : prev.filter((c) => byId.has(c.videoId))
    )
  }, [byId])

  const totalSec = useMemo(
    () =>
      clips.reduce((acc, c) => {
        const rec = byId.get(c.videoId)
        if (!rec) return acc
        const end = c.outSec > 0 ? Math.min(c.outSec, rec.durationSec) : rec.durationSec
        return acc + Math.max(0, end - c.inSec)
      }, 0),
    [clips, byId]
  )

  // rediscover a running export from the store: local state is lost when the
  // user navigates away mid-export, but the progress/cancel UI must survive
  const activeExportId =
    currentExportId ??
    Object.entries(exports).find(([, e]) => e.phase === 'preparing' || e.phase === 'encoding')?.[0] ??
    null
  const exportState = activeExportId ? exports[activeExportId] : null
  const anyExportEncoding = Object.values(exports).some(
    (e) => e.phase === 'encoding' || e.phase === 'preparing'
  )

  function move(i: number, dir: -1 | 1): void {
    setClips((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold">✂️ 編集・書き出し</h1>
        <span className="text-xs text-slate-400">合計 {fmtDuration(totalSec)}</span>
        <button
          className="btn-primary ml-auto"
          disabled={clips.length === 0 || anyExportEncoding}
          title={anyExportEncoding ? '書き出しの実行中です。完了までお待ちください' : undefined}
          onClick={() => setShowExport(true)}
        >
          {anyExportEncoding ? '📤 書き出し中…' : '📤 SNS向けに書き出し'}
        </button>
      </div>

      {startError && (
        <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800 rounded-lg p-3 whitespace-pre-wrap">
          書き出しを開始できませんでした: {startError}
        </div>
      )}

      {/* clips */}
      <section className="card p-4 space-y-3">
        <div className="text-sm font-bold">🎞️ クリップ(上から順に結合)</div>
        {clips.length === 0 && (
          <div className="text-xs text-slate-500">
            ライブラリで動画を選択して「編集」を押すと、ここに追加されます。
          </div>
        )}
        {clips.map((c, i) => {
          const rec = byId.get(c.videoId)
          if (!rec) return null
          return (
            <ClipRow
              key={`${c.videoId}_${i}`}
              clip={c}
              rec={rec}
              onChange={(nc) => setClips((prev) => prev.map((x, j) => (j === i ? nc : x)))}
              onRemove={() => setClips((prev) => prev.filter((_, j) => j !== i))}
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
            />
          )
        })}
        <AddClipPicker videos={videos} onAdd={(id) => setClips((p) => [...p, { videoId: id, inSec: 0, outSec: 0 }])} />
      </section>

      {/* bgm */}
      <section className="card p-4 space-y-3">
        <div className="text-sm font-bold">🎵 BGM</div>
        {bgm ? (
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <span className="truncate max-w-64">{bgm.path.split(/[\\/]/).pop()}</span>
            <label className="flex items-center gap-1">
              音量
              <input
                type="range"
                min={-30}
                max={6}
                value={bgm.gainDb}
                onChange={(e) => setBgm({ ...bgm, gainDb: Number(e.target.value) })}
              />
              {bgm.gainDb}dB
            </label>
            <label className="flex items-center gap-1" title="動画の何秒目からBGMを鳴らし始めるか">
              開始位置
              <input
                type="number"
                className="input w-20 ml-1"
                min={0}
                step={0.5}
                value={bgm.offsetSec}
                onChange={(e) => setBgm({ ...bgm, offsetSec: clampNum(e.target.value, 0, 7200, 0) })}
              />
              秒
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={bgm.loop}
                onChange={(e) => setBgm({ ...bgm, loop: e.target.checked })}
              />
              ループ
            </label>
            <button className="btn-ghost text-xs ml-auto" onClick={() => setBgm(null)}>
              削除
            </button>
          </div>
        ) : (
          <button
            className="btn-ghost text-xs"
            onClick={() =>
              void window.mcs.pickAudio().then((p) => {
                if (p) setBgm({ path: p, offsetSec: 0, gainDb: -12, loop: true })
              })
            }
          >
            音声ファイルを選択
          </button>
        )}
        <label
          className="flex items-center gap-2 text-xs text-slate-300 pt-1 border-t border-line"
          title="音声のないクリップは無音として扱われ、BGMとミックスされます"
        >
          <input
            type="checkbox"
            checked={keepClipAudio}
            onChange={(e) => setKeepClipAudio(e.target.checked)}
          />
          クリップ本来の音声を残す(LTX-2.3の生成音声など)
        </label>
      </section>

      {/* overlays */}
      <section className="card p-4 space-y-3">
        <div className="text-sm font-bold">💬 テロップ</div>
        {overlays.map((ov, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 items-center text-xs">
            <input
              className="input"
              value={ov.text}
              placeholder="テキスト"
              onChange={(e) =>
                setOverlays((p) => p.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
              }
            />
            <label>
              開始
              <input
                type="number"
                className="input w-16 ml-1"
                min={0}
                step={0.5}
                value={ov.startSec}
                onChange={(e) =>
                  setOverlays((p) => p.map((x, j) => (j === i ? { ...x, startSec: clampNum(e.target.value, 0, 7200, 0) } : x)))
                }
              />
            </label>
            <label>
              終了
              <input
                type="number"
                className="input w-16 ml-1"
                min={0}
                step={0.5}
                value={ov.endSec}
                onChange={(e) =>
                  setOverlays((p) => p.map((x, j) => (j === i ? { ...x, endSec: clampNum(e.target.value, 0, 7200, 0) } : x)))
                }
              />
            </label>
            <select
              className="input w-20"
              value={ov.position}
              onChange={(e) =>
                setOverlays((p) =>
                  p.map((x, j) => (j === i ? { ...x, position: e.target.value as TextOverlay['position'] } : x))
                )
              }
            >
              <option value="top">上</option>
              <option value="middle">中央</option>
              <option value="bottom">下</option>
            </select>
            <input
              type="color"
              value={ov.color}
              onChange={(e) =>
                setOverlays((p) => p.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))
              }
            />
            {ov.endSec <= ov.startSec && (
              <span className="text-[10px] text-amber-400 whitespace-nowrap">⚠️ 終了は開始より後に</span>
            )}
            <button className="btn-ghost text-xs" onClick={() => setOverlays((p) => p.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <button
          className="btn-ghost text-xs"
          onClick={() =>
            setOverlays((p) => [
              ...p,
              {
                text: '',
                startSec: 0,
                endSec: Math.max(2, Math.round(totalSec)),
                position: 'bottom',
                fontSizePct: 5,
                color: '#ffffff',
                outline: true
              }
            ])
          }
        >
          + テロップを追加
        </button>
      </section>

      {/* fades */}
      <section className="card p-4 flex items-center gap-6 text-xs">
        <div className="text-sm font-bold">🌅 フェード</div>
        <label>
          イン
          <input
            type="number"
            className="input w-20 ml-2"
            min={0}
            step={0.5}
            value={fadeIn}
            onChange={(e) => setFadeIn(clampNum(e.target.value, 0, 10, 0))}
          />
          秒
        </label>
        <label>
          アウト
          <input
            type="number"
            className="input w-20 ml-2"
            min={0}
            step={0.5}
            value={fadeOut}
            onChange={(e) => setFadeOut(clampNum(e.target.value, 0, 10, 0.5))}
          />
          秒
        </label>
      </section>

      {exportState && (
        <div className="card p-4">
          <div className="flex justify-between text-sm">
            <span>
              {exportState.phase === 'encoding'
                ? 'エンコード中…'
                : exportState.phase === 'done'
                  ? '✅ 書き出し完了'
                  : exportState.phase === 'error'
                    ? '⚠️ エラー'
                    : exportState.phase}
            </span>
            <span>{Math.round(exportState.progress * 100)}%</span>
          </div>
          <div className="h-2 bg-panel2 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${Math.round(exportState.progress * 100)}%` }}
            />
          </div>
          {exportState.message && (
            <div className="text-[11px] text-rose-400 mt-2 whitespace-pre-wrap">{exportState.message}</div>
          )}
          <div className="flex gap-2 mt-2">
            {exportState.phase === 'encoding' && (
              <button
                className="btn-ghost text-xs"
                onClick={() => activeExportId && void window.mcs.cancelExport(activeExportId)}
              >
                キャンセル
              </button>
            )}
            {exportState.phase === 'done' && exportState.outputPath && (
              <button
                className="btn-primary text-xs"
                onClick={() => void window.mcs.openPath(exportState.outputPath!.replace(/[\\/][^\\/]+$/, ''))}
              >
                📁 出力フォルダを開く
              </button>
            )}
          </div>
        </div>
      )}

      {showExport && (
        <ExportDialog
          totalSec={totalSec}
          onClose={() => setShowExport(false)}
          onStart={async (presetId, opts) => {
            const req: ExportRequest = {
              project: { clips, bgm, overlays, fadeInSec: fadeIn, fadeOutSec: fadeOut, keepClipAudio },
              presetId,
              aspectMode: opts.aspectMode,
              smoothInterpolation: opts.smooth,
              upscale: true,
              loudnessNormalize: true,
              outputName: opts.name
            }
            // a rejected startExport used to be swallowed: the dialog closed
            // and absolutely nothing happened, with no message anywhere
            try {
              setStartError(null)
              const id = await window.mcs.startExport(req)
              setCurrentExportId(id)
              setShowExport(false)
            } catch (e) {
              setStartError(
                (e instanceof Error ? e.message : String(e)).replace(
                  /^Error invoking remote method '[^']+': (Error: )?/,
                  ''
                )
              )
            }
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function ClipRow(props: {
  clip: EditClip
  rec: VideoRecord
  onChange: (c: EditClip) => void
  onRemove: () => void
  onUp: () => void
  onDown: () => void
}): React.JSX.Element {
  const { clip, rec } = props
  return (
    <div className="flex items-center gap-3 border border-line rounded-lg p-2">
      <video
        src={window.mcs.toMediaUrl(rec.filePath)}
        className="w-32 aspect-video object-cover rounded bg-black"
        muted
        onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
        onMouseLeave={(e) => {
          e.currentTarget.pause()
          e.currentTarget.currentTime = 0
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate">{rec.prompt || rec.id}</div>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
          <label>
            開始
            <input
              type="number"
              className="input w-20 ml-1"
              min={0}
              max={rec.durationSec}
              step={0.1}
              value={clip.inSec}
              onChange={(e) => props.onChange({ ...clip, inSec: clampNum(e.target.value, 0, 36000, 0) })}
            />
          </label>
          <label>
            終了
            <input
              type="number"
              className="input w-20 ml-1"
              min={0}
              max={rec.durationSec}
              step={0.1}
              value={clip.outSec}
              placeholder="末尾"
              onChange={(e) => props.onChange({ ...clip, outSec: clampNum(e.target.value, 0, 36000, 0) })}
            />
          </label>
          <span>(全体 {fmtDuration(rec.durationSec)} / 0=末尾まで)</span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <button className="btn-ghost text-xs px-2 py-0.5" onClick={props.onUp}>
          ↑
        </button>
        <button className="btn-ghost text-xs px-2 py-0.5" onClick={props.onDown}>
          ↓
        </button>
      </div>
      <button className="btn-ghost text-xs" onClick={props.onRemove}>
        ✕
      </button>
    </div>
  )
}

function AddClipPicker({ videos, onAdd }: { videos: VideoRecord[]; onAdd: (id: string) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button className="btn-ghost text-xs" onClick={() => setOpen(!open)}>
        + ライブラリから追加
      </button>
      {open && (
        <div className="grid grid-cols-6 gap-2 mt-2 max-h-40 overflow-y-auto">
          {videos.map((v) => (
            <img
              key={v.id}
              src={window.mcs.toMediaUrl(v.thumbPath)}
              className="aspect-video object-cover rounded cursor-pointer border border-line hover:border-accent"
              title={v.prompt}
              onClick={() => {
                onAdd(v.id)
                setOpen(false)
              }}
              alt=""
            />
          ))}
        </div>
      )}
    </div>
  )
}


// ---------------------------------------------------------------------------

function ExportDialog(props: {
  totalSec: number
  onClose: () => void
  onStart: (presetId: string, opts: { aspectMode: 'crop' | 'blurpad'; smooth: boolean; name: string }) => Promise<void>
}): React.JSX.Element {
  const [presets, setPresets] = useState<ExportPreset[]>([])
  const [presetId, setPresetId] = useState('youtube_1080p')
  const [aspectMode, setAspectMode] = useState<'crop' | 'blurpad'>('blurpad')
  const [smooth, setSmooth] = useState(true)
  const [name, setName] = useState('my_video')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    void window.mcs.getExportPresets().then(setPresets)
  }, [])

  const preset = presets.find((p) => p.id === presetId)
  const durationWarn = preset?.maxDurationSec && props.totalSec > preset.maxDurationSec

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-8" onClick={props.onClose}>
      <div className="card p-5 max-w-lg w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold">📤 SNS向け書き出し</div>
        <div>
          <div className="label">プリセット</div>
          <select className="input" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} {p.width ? `— ${p.width}x${p.height}` : ''} @{p.fps}fps
              </option>
            ))}
          </select>
          {preset && <div className="text-[11px] text-slate-500 mt-1">{preset.note}</div>}
          {durationWarn && (
            <div className="text-[11px] text-amber-400 mt-1">
              ⚠️ 合計 {fmtDuration(props.totalSec)} はこのSNSの上限 ({fmtDuration(preset!.maxDurationSec!)}) を超えています
            </div>
          )}
        </div>
        <div>
          <div className="label">アスペクト比が合わないとき</div>
          <div className="flex gap-2">
            <button className={`chip ${aspectMode === 'blurpad' ? 'chip-on' : ''}`} onClick={() => setAspectMode('blurpad')}>
              ぼかし背景で埋める
            </button>
            <button className={`chip ${aspectMode === 'crop' ? 'chip-on' : ''}`} onClick={() => setAspectMode('crop')}>
              中央クロップ
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
          フレーム補間でなめらかに(低fps生成動画におすすめ・時間がかかります)
        </label>
        <div>
          <div className="label">ファイル名</div>
          <input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="text-[11px] text-slate-500 bg-panel2 border border-line rounded-lg p-2">
          ℹ️ AI生成コンテンツはYouTube・TikTok・Instagramの投稿時に「AI生成」の開示設定が必要です。動画メタデータにはAI生成の注記が自動で埋め込まれます。
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost text-sm" onClick={props.onClose}>
            キャンセル
          </button>
          <button
            className="btn-primary text-sm"
            disabled={starting}
            onClick={() => {
              setStarting(true)
              void props.onStart(presetId, { aspectMode, smooth, name }).finally(() => setStarting(false))
            }}
          >
            書き出し開始
          </button>
        </div>
      </div>
    </div>
  )
}
