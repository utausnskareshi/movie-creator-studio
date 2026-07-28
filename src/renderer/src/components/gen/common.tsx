import { useCallback, useMemo, useState } from 'react'
import type { FamilyOptions, GenMode, GenerationRequest, ModelFamily } from '@shared/types'
import { DEFAULT_NEGATIVES, FAMILY_META } from '@shared/familyMeta'
import { PROMPT_CHIPS, FAMILY_INTRO } from '../../data/chips'
import { useApp } from '../../store'
import { clampInt } from '../../lib/num'
import PresetGallery from './PresetGallery'
import type { PresetMode } from '../../data/presets/types'

// ---------------------------------------------------------------------------
// useGenForm — shared state + submit for all five generation screens
// ---------------------------------------------------------------------------

export interface GenFormState {
  mode: GenMode
  setMode: (m: GenMode) => void
  prompt: string
  setPrompt: (s: string) => void
  negative: string
  setNegative: (s: string) => void
  seed: number
  setSeed: (n: number) => void
  seedLock: boolean
  setSeedLock: (b: boolean) => void
  resIndex: number
  setResIndex: (i: number) => void
  frames: number
  setFrames: (n: number) => void
  imagePath: string | null
  setImagePath: (p: string | null) => void
  audioPath: string | null
  setAudioPath: (p: string | null) => void
  controlVideoPath: string | null
  setControlVideoPath: (p: string | null) => void
  selectedChips: Set<string>
  toggleChip: (en: string) => void
  finalPrompt: string
  submitting: boolean
  missingModels: string[] | null
  dismissMissing: () => void
  error: string | null
  submit: (options: FamilyOptions) => Promise<void>
}

export function useGenForm(family: ModelFamily, initialMode: GenMode = 't2v'): GenFormState {
  const meta = FAMILY_META[family]
  const [mode, setMode] = useState<GenMode>(meta.supportsT2V ? initialMode : 'i2v')
  const [prompt, setPrompt] = useState('')
  const [negative, setNegative] = useState(DEFAULT_NEGATIVES[family])
  const [seed, setSeed] = useState(-1)
  const [seedLock, setSeedLock] = useState(false)
  const [resIndex, setResIndex] = useState(0)
  const [frames, setFrames] = useState(meta.defaultFrames)
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [controlVideoPath, setControlVideoPath] = useState<string | null>(null)
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [missingModels, setMissingModels] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggleChip = useCallback((en: string) => {
    setSelectedChips((prev) => {
      const next = new Set(prev)
      if (next.has(en)) next.delete(en)
      else next.add(en)
      return next
    })
  }, [])

  const finalPrompt = useMemo(() => {
    const chipText = [...selectedChips].join(', ')
    return [prompt.trim(), chipText].filter(Boolean).join(', ')
  }, [prompt, selectedChips])

  const submit = useCallback(
    async (options: FamilyOptions) => {
      setError(null)
      setSubmitting(true)
      try {
        const res = meta.resolutions[resIndex] ?? meta.resolutions[0]
        // wanfun's reference image is optional — the control video drives it
        const requiresImage =
          (mode === 'i2v' && options.family !== 'wanfun') ||
          (options.family === 'ltx2' && options.ltx2.submode === 'avatar')
        const usesImage = requiresImage || options.family === 'wanfun'
        const req: GenerationRequest = {
          family,
          mode,
          prompt: finalPrompt,
          negative,
          seed: seedLock ? clampInt(seed, 0, 2147483647, 12345) : -1,
          width: res.w,
          height: res.h,
          frames,
          inputImagePath: usesImage ? (imagePath ?? undefined) : undefined,
          // only attach media the chosen mode actually consumes — a stale pick
          // from another submode would otherwise be converted/uploaded for nothing
          inputAudioPath:
            options.family === 'ltx2' && options.ltx2.submode === 'avatar'
              ? (audioPath ?? undefined)
              : undefined,
          controlVideoPath: options.family === 'wanfun' ? (controlVideoPath ?? undefined) : undefined,
          options
        }
        if (requiresImage && !imagePath) {
          setError('入力画像を選択してください')
          return
        }
        if (options.family === 'ltx2' && options.ltx2.submode === 'avatar' && !audioPath) {
          setError('アバター生成には音声ファイルを選択してください')
          return
        }
        if (options.family === 'wanfun' && !controlVideoPath) {
          setError('制御動画を選択してください')
          return
        }
        await window.mcs.queueGeneration(req)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const m = /MISSING_MODELS:([\w,.-]+)/.exec(msg)
        if (m) setMissingModels(m[1].split(','))
        else setError(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      } finally {
        setSubmitting(false)
      }
    },
    [family, mode, finalPrompt, negative, seed, seedLock, resIndex, frames, imagePath, audioPath, controlVideoPath, meta]
  )

  return {
    mode,
    setMode,
    prompt,
    setPrompt,
    negative,
    setNegative,
    seed,
    setSeed,
    seedLock,
    setSeedLock,
    resIndex,
    setResIndex,
    frames,
    setFrames,
    imagePath,
    setImagePath,
    audioPath,
    setAudioPath,
    controlVideoPath,
    setControlVideoPath,
    selectedChips,
    toggleChip,
    finalPrompt,
    submitting,
    missingModels,
    dismissMissing: () => setMissingModels(null),
    error,
    submit
  }
}

// ---------------------------------------------------------------------------
// shared UI pieces
// ---------------------------------------------------------------------------

export function GenHeader({ family }: { family: ModelFamily }): React.JSX.Element {
  const intro = FAMILY_INTRO[family]
  return (
    <div className="mb-4">
      <h1 className="text-lg font-bold">{intro.title}</h1>
      <p className="text-sm text-slate-400 mt-1">{intro.desc}</p>
    </div>
  )
}

export function TipsCard({ family }: { family: ModelFamily }): React.JSX.Element {
  const intro = FAMILY_INTRO[family]
  return (
    <div className="card p-3">
      <div className="text-xs font-bold text-slate-300 mb-2">💡 コツ</div>
      <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4">
        {intro.tips.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  )
}

export function ChipsBox({
  family,
  selected,
  toggle
}: {
  family: ModelFamily
  selected: Set<string>
  toggle: (en: string) => void
}): React.JSX.Element {
  const cats = PROMPT_CHIPS[family]
  return (
    <div className="space-y-3">
      {cats.map((cat) => (
        <div key={cat.title}>
          <div className="label">{cat.title}</div>
          <div className="flex flex-wrap gap-1.5">
            {cat.chips.map((c) => (
              <button
                key={c.en}
                type="button"
                title={c.en}
                className={`chip ${selected.has(c.en) ? 'chip-on' : ''}`}
                onClick={() => toggle(c.en)}
              >
                {c.ja}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ModeTabs({
  form,
  family,
  lockedTo,
  lockReason
}: {
  form: GenFormState
  family: ModelFamily
  /** a variant that only supports one mode (e.g. the Hunyuan 480p distilled checkpoint is I2V-only) */
  lockedTo?: GenMode
  lockReason?: string
}): React.JSX.Element | null {
  const meta = FAMILY_META[family]
  if (!meta.supportsT2V || !meta.supportsI2V) return null
  return (
    <div className="mb-3">
      <div className="inline-flex rounded-lg border border-line overflow-hidden">
        {(['i2v', 't2v'] as GenMode[]).map((m) => {
          const disabled = !!lockedTo && lockedTo !== m
          return (
            <button
              key={m}
              disabled={disabled}
              title={disabled ? lockReason : undefined}
              className={`px-4 py-1.5 text-sm ${
                form.mode === m
                  ? 'bg-accent text-white'
                  : disabled
                    ? 'bg-panel2 text-slate-600 cursor-not-allowed'
                    : 'bg-panel2 text-slate-300'
              }`}
              onClick={() => !disabled && form.setMode(m)}
            >
              {m === 'i2v' ? '画像から (I2V)' : 'テキストから (T2V)'}
            </button>
          )
        })}
      </div>
      {lockedTo && lockReason && (
        <div className="text-[11px] text-amber-400 mt-1">{lockReason}</div>
      )}
    </div>
  )
}

export function ImagePick({
  form,
  always,
  label
}: {
  form: GenFormState
  always?: boolean
  label?: string
}): React.JSX.Element | null {
  if (form.mode !== 'i2v' && !always) return null
  return (
    <div>
      <div className="label flex items-center gap-2">
        <span>{label ?? '入力画像'}</span>
        {form.imagePath && (
          // an "optional" reference image could never be un-picked, so it was
          // always sent once chosen (Fun Control's 参照画像 in particular)
          <button
            className="text-[11px] text-slate-500 hover:text-rose-400"
            onClick={(e) => {
              e.stopPropagation()
              form.setImagePath(null)
            }}
          >
            ✕ 選択を解除
          </button>
        )}
      </div>
      <div
        className="border-2 border-dashed border-line rounded-xl p-3 text-center cursor-pointer hover:border-accent transition-colors"
        onClick={() => {
          void window.mcs.pickImage().then((p) => p && form.setImagePath(p))
        }}
      >
        {form.imagePath ? (
          <div>
            <img
              src={window.mcs.toMediaUrl(form.imagePath)}
              alt=""
              className="max-h-48 mx-auto rounded-lg object-contain"
            />
            <div className="text-[11px] text-slate-400 mt-1 truncate">{form.imagePath}</div>
          </div>
        ) : (
          <div className="py-6 text-slate-400 text-sm">クリックして画像を選択</div>
        )}
      </div>
    </div>
  )
}

export function AudioPick({
  form,
  onDuration
}: {
  form: GenFormState
  /** called with the audio duration (seconds) once metadata loads */
  onDuration?: (sec: number) => void
}): React.JSX.Element {
  return (
    <div>
      <div className="label">音声ファイル(リップシンク対象)</div>
      <div className="flex items-center gap-2">
        <button
          className="btn-ghost text-xs"
          onClick={() => void window.mcs.pickAudio().then((p) => p && form.setAudioPath(p))}
        >
          音声を選択
        </button>
        {form.audioPath && (
          <>
            <span className="text-[11px] text-slate-400 truncate flex-1">
              {form.audioPath.split(/[\\/]/).pop()}
            </span>
            <button
              className="text-[11px] text-slate-500 hover:text-rose-400 whitespace-nowrap"
              onClick={() => form.setAudioPath(null)}
            >
              ✕ 解除
            </button>
          </>
        )}
      </div>
      {form.audioPath && (
        <audio
          src={window.mcs.toMediaUrl(form.audioPath)}
          controls
          className="h-8 mt-2 w-full max-w-sm"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration
            if (Number.isFinite(d) && d > 0) onDuration?.(d)
          }}
        />
      )}
    </div>
  )
}

export function ControlVideoPick({ form }: { form: GenFormState }): React.JSX.Element {
  return (
    <div>
      <div className="label flex items-center gap-2">
        <span>制御動画(この動きに沿って生成)</span>
        {form.controlVideoPath && (
          <button
            className="text-[11px] text-slate-500 hover:text-rose-400"
            onClick={(e) => {
              e.stopPropagation()
              form.setControlVideoPath(null)
            }}
          >
            ✕ 選択を解除
          </button>
        )}
      </div>
      <div
        className="border-2 border-dashed border-line rounded-xl p-3 text-center cursor-pointer hover:border-accent transition-colors"
        onClick={() => void window.mcs.pickVideo().then((p) => p && form.setControlVideoPath(p))}
      >
        {form.controlVideoPath ? (
          <div>
            <video
              src={window.mcs.toMediaUrl(form.controlVideoPath)}
              className="max-h-40 mx-auto rounded-lg"
              controls
              muted
            />
            <div className="text-[11px] text-slate-400 mt-1 truncate">
              {form.controlVideoPath.split(/[\\/]/).pop()}
            </div>
          </div>
        ) : (
          <div className="py-5 text-slate-400 text-sm">クリックして制御動画(mp4)を選択</div>
        )}
      </div>
    </div>
  )
}

export function CommonParams({
  form,
  family,
  fpsOverride,
  allowedResIndexes,
  resNote
}: {
  form: GenFormState
  family: ModelFamily
  /** actual render fps when a screen-level variant differs from meta.fps (e.g. Wan 5B = 24) */
  fpsOverride?: number
  /** restrict the resolution list for a resolution-specific variant */
  allowedResIndexes?: number[]
  resNote?: string
}): React.JSX.Element {
  const meta = FAMILY_META[family]
  const fps = fpsOverride ?? meta.fps
  const resChoices = meta.resolutions
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => !allowedResIndexes || allowedResIndexes.includes(i))
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className="label">解像度</div>
        <select
          className="input"
          value={form.resIndex}
          onChange={(e) => form.setResIndex(Number(e.target.value))}
        >
          {resChoices.map(({ r, i }) => (
            <option key={i} value={i}>
              {r.label} ({r.w}x{r.h})
            </option>
          ))}
        </select>
        {resNote && <div className="text-[11px] text-slate-500 mt-1">{resNote}</div>}
      </div>
      <div>
        <div className="label">長さ</div>
        <select
          className="input"
          value={form.frames}
          onChange={(e) => form.setFrames(Number(e.target.value))}
        >
          {meta.framePresets.map((f) => (
            <option key={f} value={f}>
              {f}フレーム (約{Math.round((f / fps) * 10) / 10}秒 @{fps}fps)
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <div className="label">シード</div>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            className="input"
            disabled={!form.seedLock}
            value={form.seedLock ? form.seed : ''}
            placeholder="ランダム"
            onChange={(e) => form.setSeed(clampInt(e.target.value, 0, 2147483647, 0))}
          />
          <label className="flex items-center gap-1.5 text-xs text-slate-300 whitespace-nowrap">
            <input
              type="checkbox"
              checked={form.seedLock}
              onChange={(e) => {
                form.setSeedLock(e.target.checked)
                if (e.target.checked && form.seed < 0) form.setSeed(12345)
              }}
            />
            固定
          </label>
        </div>
      </div>
    </div>
  )
}

export function GenerateBar({
  form,
  options,
  estimate,
  extraDisabledReason
}: {
  form: GenFormState
  options: FamilyOptions
  estimate?: string
  /** screen-specific precondition failure (e.g. selected model variant not installed) */
  extraDisabledReason?: string | null
}): React.JSX.Element {
  const { setScreen, jobs } = useApp()

  // buttons are only enabled when the action can actually succeed:
  // one generation at a time across ALL screens, prompt/image prerequisites met
  const genActive = jobs.some((j) => ['queued', 'preparing', 'running', 'saving'].includes(j.state))
  const isAvatar = options.family === 'ltx2' && options.ltx2.submode === 'avatar'
  let reason: string | null = null
  if (extraDisabledReason) reason = extraDisabledReason
  else if (genActive) reason = '⏳ 生成を実行中です — 完了後(または下のキューから中止後)に開始できます'
  else if (options.family === 'wanfun' && !form.controlVideoPath)
    reason = '制御動画を選択すると生成できます(参照画像は任意)'
  else if (isAvatar && (!form.imagePath || !form.audioPath))
    reason = '顔画像と音声ファイルを選択すると生成できます'
  else if (form.mode === 'i2v' && options.family !== 'wanfun' && !form.imagePath)
    reason = '入力画像を選択すると生成できます'
  else if (form.mode === 't2v' && !form.finalPrompt)
    reason = 'プロンプトを入力(またはチップを選択)すると生成できます'

  return (
    <div className="space-y-2">
      {form.error && (
        <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800 rounded-lg p-2">
          {form.error}
        </div>
      )}
      {form.missingModels && (
        <div className="text-xs bg-amber-950/40 border border-amber-700 rounded-lg p-3 space-y-2">
          <div className="text-amber-300 font-semibold">
            必要なモデルファイルが未ダウンロードです({form.missingModels.length}件)
          </div>
          <div className="text-slate-400">セットアップ画面からダウンロードしてください。</div>
          <div className="flex gap-2">
            <button className="btn-primary text-xs px-3 py-1" onClick={() => setScreen('setup')}>
              セットアップへ
            </button>
            <button className="btn-ghost text-xs px-3 py-1" onClick={form.dismissMissing}>
              閉じる
            </button>
          </div>
        </div>
      )}
      <button
        className="btn-primary w-full py-3 text-base"
        disabled={form.submitting || !!reason}
        title={reason ?? undefined}
        onClick={() => void form.submit(options)}
      >
        {genActive && !extraDisabledReason ? '⏳ 生成中…' : '🎬 生成開始'}
      </button>
      {reason ? (
        <div className="text-[11px] text-amber-400/90 text-center">{reason}</div>
      ) : (
        estimate && <div className="text-[11px] text-slate-500 text-center">{estimate}</div>
      )}
    </div>
  )
}

export function PromptBox({
  form,
  placeholder,
  family,
  presetMode
}: {
  form: GenFormState
  placeholder: string
  family: ModelFamily
  /** override the preset-gallery filter (LTX-2.3 passes 'avatar' in avatar submode) */
  presetMode?: PresetMode
}): React.JSX.Element {
  const { setupStatus, setScreen } = useApp()
  const [showPresets, setShowPresets] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [lastJa, setLastJa] = useState<string | null>(null)
  const [convError, setConvError] = useState<string | null>(null)

  const llmInstalled = !!setupStatus?.llm.installed
  const hasJapanese = /[぀-ヿ一-鿿]/.test(form.prompt)

  const convertDisabledReason = !llmInstalled
    ? 'セットアップで「プロンプト変換AI」をインストールすると使えます'
    : translating
      ? '変換中です…'
      : !hasJapanese
        ? '日本語のテキストを入力すると変換できます'
        : null

  async function convert(): Promise<void> {
    setConvError(null)
    setTranslating(true)
    const ja = form.prompt
    try {
      const en = await window.mcs.llmTranslate(family, ja)
      setLastJa(ja)
      form.setPrompt(en)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setConvError(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setTranslating(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="label mb-0">プロンプト(日本語OK — 変換ボタンで英語化)</div>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="btn-ghost text-xs px-2.5 py-1"
              onClick={() => setShowPresets(true)}
            >
              📚 プリセット
            </button>
            <button
              type="button"
              className="btn-primary text-xs px-2.5 py-1"
              disabled={!!convertDisabledReason}
              title={convertDisabledReason ?? 'このモデルに最適な英語プロンプトへ変換します(CPU動作・GPU不使用)'}
              onClick={() => {
                if (!llmInstalled) setScreen('setup')
                else void convert()
              }}
            >
              {translating ? '⏳ 変換中…' : '✨ 日本語から変換'}
            </button>
          </div>
        </div>
        <textarea
          className="input min-h-24 font-mono text-[13px]"
          placeholder={placeholder}
          maxLength={4000}
          value={form.prompt}
          onChange={(e) => form.setPrompt(e.target.value)}
        />
        {!llmInstalled && (
          <div className="text-[11px] text-slate-500 mt-1">
            💡 日本語のまま生成もできますが、モデルは英語プロンプトが得意です。セットアップで「プロンプト変換AI」を導入すると日本語→最適英語に自動変換できます。
          </div>
        )}
      </div>
      {convError && (
        <div className="text-[11px] text-rose-400 bg-rose-950/40 border border-rose-800 rounded-lg p-2">
          変換エラー: {convError}
        </div>
      )}
      {lastJa && (
        <div className="text-[11px] text-slate-400 bg-panel2 border border-line rounded-lg p-2 flex items-start gap-2">
          <span className="flex-1">
            <span className="font-semibold text-slate-300">変換元(日本語): </span>
            {lastJa}
          </span>
          <button
            className="text-accent underline whitespace-nowrap"
            onClick={() => {
              form.setPrompt(lastJa)
              setLastJa(null)
            }}
          >
            戻す
          </button>
        </div>
      )}
      {form.finalPrompt !== form.prompt.trim() && (
        <div className="text-[11px] text-slate-400 bg-panel2 border border-line rounded-lg p-2">
          <span className="font-semibold text-slate-300">送信されるプロンプト: </span>
          {form.finalPrompt}
        </div>
      )}
      <details>
        <summary className="text-xs text-slate-400 cursor-pointer">ネガティブプロンプト</summary>
        <textarea
          className="input min-h-16 mt-2 font-mono text-[12px]"
          maxLength={2000}
          value={form.negative}
          onChange={(e) => form.setNegative(e.target.value)}
        />
      </details>
      {showPresets && (
        <PresetGallery
          family={family}
          mode={presetMode ?? form.mode}
          onPick={(p) => {
            form.setPrompt(p.prompt)
            setLastJa(null)
          }}
          onClose={() => setShowPresets(false)}
        />
      )}
    </div>
  )
}
