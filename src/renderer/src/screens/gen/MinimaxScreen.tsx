import { useState } from 'react'
import type { FamilyOptions, GenerationRequest } from '@shared/types'
import {
  ChipsBox,
  CommonParams,
  GenHeader,
  GenerateBar,
  ImagePick,
  PromptBox,
  TipsCard,
  useGenForm
} from '../../components/gen/common'
import { clampInt } from '../../lib/num'
import { packReadyById } from '../../lib/ready'
import { useApp } from '../../store'
import { findMinimaxTagIssue, hasMinimaxTag } from '@shared/minimaxTags'

type Tab = 't2v' | 'i2v' | 'r2v'

/** R2V reference media list with the model's limits (9 images / 3 videos / 3 audios, 12 total). */
function RefMediaList({
  label,
  hint,
  items,
  max,
  disabledReason,
  onAdd,
  onRemove
}: {
  label: string
  hint: string
  items: string[]
  max: number
  disabledReason?: string | null
  onAdd: () => void
  onRemove: (index: number) => void
}): React.JSX.Element {
  return (
    <div>
      <div className="label flex items-center gap-2">
        <span>
          {label}({items.length}/{max})
        </span>
        <button
          className="text-[11px] text-accent hover:underline disabled:text-slate-600 disabled:no-underline"
          disabled={items.length >= max || !!disabledReason}
          title={disabledReason ?? undefined}
          onClick={onAdd}
        >
          + 追加
        </button>
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] text-slate-500">{hint}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((p, i) => (
            <li key={`${p}_${i}`} className="flex items-center gap-2 text-xs bg-panel2 border border-line rounded px-2 py-1">
              <span className="text-slate-500 shrink-0">{i + 1}.</span>
              <span className="truncate flex-1" title={p}>
                {p.split(/[\\/]/).pop()}
              </span>
              <button className="text-slate-500 hover:text-rose-400 shrink-0" onClick={() => onRemove(i)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function MinimaxScreen(): React.JSX.Element {
  const { setupStatus, catalog } = useApp()
  const form = useGenForm('minimaxh3', 't2v')
  const [tab, setTab] = useState<Tab>('t2v')
  const [steps, setSteps] = useState(20)
  const [refImageSize, setRefImageSize] = useState<'match' | 'max'>('match')
  // I2V first-frame fitting — the model node plain-stretches the first frame
  // to the canvas, so mismatched aspect (portrait image → landscape video)
  // would distort without app-side pre-fitting
  const [aspectMode, setAspectMode] = useState<'blur' | 'pad' | 'crop' | 'stretch'>('blur')
  // FL2VA optional last keyframe
  const [lastFramePath, setLastFramePath] = useState<string | null>(null)
  // Ref2VA reference media (model limits: 9 / 3 / 3, 12 total)
  const [refImages, setRefImages] = useState<string[]>([])
  const [refVideos, setRefVideos] = useState<string[]>([])
  const [refAudios, setRefAudios] = useState<string[]>([])

  const isR2V = tab === 'r2v'
  const options: FamilyOptions = {
    family: 'minimaxh3',
    minimaxh3: { variant: isR2V ? 'ref2va' : 'fl2va', steps, refImageSize, aspectMode }
  }

  function switchTab(next: Tab): void {
    setTab(next)
    // GenMode drives the shared form: R2V runs as a t2v-style flow
    form.setMode(next === 'i2v' ? 'i2v' : 't2v')
  }

  const totalRefs = refImages.length + refVideos.length + refAudios.length
  const refCapReason = totalRefs >= 12 ? '参照ファイルは合計12個までです' : null
  const audioNeedsVisual = isR2V && refAudios.length > 0 && refImages.length + refVideos.length === 0
  // プロンプト内のタグ(チップ由来含む)が実在の参照を指しているか
  const tagIssue = isR2V
    ? findMinimaxTagIssue(form.finalPrompt, {
        images: refImages.length,
        videos: refVideos.length,
        audios: refAudios.length
      })
    : null
  const tagIssueReason = tagIssue
    ? `プロンプトの <${tagIssue.kind} ${tagIssue.index}> に対応する${
        tagIssue.kind === 'Picture' ? '参照画像' : tagIssue.kind === 'Video' ? '参照動画' : '参照音声'
      }がありません(現在${tagIssue.available}件)。参照を追加するかタグを修正してください`
    : null

  // extra request fields merged at submit
  const extra: Partial<GenerationRequest> = isR2V
    ? { refImagePaths: refImages, refVideoPaths: refVideos, refAudioPaths: refAudios }
    : tab === 'i2v' && lastFramePath
      ? { lastFrameImagePath: lastFramePath }
      : {}

  // タブごとに使うチェックポイントは別パック(WanFun の variantMissing と同型):
  // 後出しの MISSING_MODELS ダイアログではなく、ボタン時点で理由を出す
  const variantMissing = isR2V
    ? !packReadyById('minimaxh3_ref2va', setupStatus, catalog)
    : !packReadyById('minimaxh3_fl2va', setupStatus, catalog)
  const extraDisabledReason = variantMissing
    ? isR2V
      ? 'R2V用モデルが未ダウンロードです。セットアップ画面から「MiniMax H3 リファレンス(R2V)」を導入してください'
      : 'モデルが未ダウンロードです。セットアップ画面から「MiniMax H3(標準 T2V/I2V)」を導入してください'
    : audioNeedsVisual
      ? '参照音声には画像または動画の同伴が必要です(人物画像を1枚追加してください)'
      : tagIssueReason
        ? tagIssueReason
        : isR2V && totalRefs === 0 && !form.finalPrompt
          ? 'プロンプトを入力してください(参照なしでも生成できますが、R2Vは参照ファイルの追加が本領です)'
          : null

  /** insert a <Picture n> style tag at the end of the prompt */
  function insertTag(tag: string): void {
    form.setPrompt(form.prompt ? `${form.prompt.replace(/\s+$/, '')} ${tag} ` : `${tag} `)
  }

  const estimate = isR2V
    ? '目安: 5秒で十数分〜(33B大型モデル・参照が多いほど低速。ref解像度「最大」はさらに数倍)'
    : '目安: 5秒で十数分〜(33B大型モデル。初回はモデルロードに数分かかります)'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <GenHeader family="minimaxh3" />
      {/* 3-way task tabs: FL2VA(T2V/I2V) と Ref2VA(R2V) はチェックポイントが別 */}
      <div className="mb-3">
        <div className="inline-flex rounded-lg border border-line overflow-hidden">
          {(
            [
              ['t2v', 'テキストから (T2V)'],
              ['i2v', '画像から (I2V)'],
              ['r2v', 'リファレンス (R2V)']
            ] as Array<[Tab, string]>
          ).map(([m, label]) => (
            <button
              key={m}
              className={`px-4 py-1.5 text-sm ${tab === m ? 'bg-accent text-white' : 'bg-panel2 text-slate-300'}`}
              onClick={() => switchTab(m)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-slate-500 mt-1">
          {isR2V
            ? '参照メディア(画像・動画・音声)を <Picture 1> のようにプロンプトから指定して生成します(R2V専用モデルを使用)'
            : 'T2V/I2V は標準モデル(FL2VA)を使用。I2Vでは最後のフレームも指定できます'}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_340px] gap-5">
        <div className="space-y-4">
          {tab === 'i2v' && (
            <>
              <ImagePick form={form} label="最初のフレーム(必須)" />
              <div>
                <div className="label flex items-center gap-2">
                  <span>最後のフレーム(任意)</span>
                  {lastFramePath && (
                    <button
                      className="text-[11px] text-slate-500 hover:text-rose-400"
                      onClick={() => setLastFramePath(null)}
                    >
                      ✕ 選択を解除
                    </button>
                  )}
                </div>
                <div
                  className="border-2 border-dashed border-line rounded-xl p-3 text-center cursor-pointer hover:border-accent transition-colors"
                  onClick={() => void window.mcs.pickImage().then((p) => p && setLastFramePath(p))}
                >
                  {lastFramePath ? (
                    <span className="text-xs text-slate-300 break-all">{lastFramePath.split(/[\\/]/).pop()}</span>
                  ) : (
                    <span className="text-xs text-slate-500">
                      クリックして選択 — 指定すると「最初→最後」をつなぐ動画になります
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="label">縦横が合わない画像の扱い(最初のフレーム)</div>
                <select
                  className="input"
                  value={aspectMode}
                  onChange={(e) => setAspectMode(e.target.value as 'blur' | 'pad' | 'crop' | 'stretch')}
                >
                  <option value="blur">ぼかし背景で埋める — 全体を残す(推奨)</option>
                  <option value="pad">黒帯で埋める — 全体を残す</option>
                  <option value="crop">中央クロップ — 画面いっぱい(端は切れる)</option>
                  <option value="stretch">引き伸ばし — モデルそのまま(歪む)</option>
                </select>
                <div className="text-[11px] text-slate-500 mt-1">
                  モデルは最初のフレームを選択解像度へ引き伸ばすため、縦画像→横動画は歪みます。
                  画像の向きに解像度(9:16 / 16:9)を合わせるのが最良です
                </div>
              </div>
            </>
          )}

          {isR2V && (
            <div className="card p-3 space-y-3">
              <div className="text-xs font-bold text-slate-300">
                🧩 参照メディア(合計 {totalRefs}/12)
              </div>
              <RefMediaList
                label="参照画像 <Picture n>"
                hint="人物・キャラ・画風の参照(最大9枚)。例: 歌わせたい人物の写真"
                items={refImages}
                max={9}
                disabledReason={refCapReason}
                onAdd={() => void window.mcs.pickImage().then((p) => p && setRefImages((a) => [...a, p]))}
                onRemove={(i) => setRefImages((a) => a.filter((_, j) => j !== i))}
              />
              <RefMediaList
                label="参照動画 <Video n>"
                hint="動き・カメラワークの参照(最大3本・各2〜15秒。24fps・無音に自動変換)"
                items={refVideos}
                max={3}
                disabledReason={refCapReason}
                onAdd={() => void window.mcs.pickVideo().then((p) => p && setRefVideos((a) => [...a, p]))}
                onRemove={(i) => setRefVideos((a) => a.filter((_, j) => j !== i))}
              />
              <RefMediaList
                label="参照音声 <Audio n>"
                hint="歌声・セリフの参照(最大3つ・各2〜15秒)。※画像か動画の同伴が必須"
                items={refAudios}
                max={3}
                disabledReason={refCapReason}
                onAdd={() => void window.mcs.pickAudio().then((p) => p && setRefAudios((a) => [...a, p]))}
                onRemove={(i) => setRefAudios((a) => a.filter((_, j) => j !== i))}
              />
              {audioNeedsVisual && (
                <div className="text-[11px] text-amber-400">
                  ⚠️ 参照音声には画像または動画の同伴が必要です(例: 歌声+人物画像)
                </div>
              )}
              {totalRefs > 0 && !hasMinimaxTag(form.finalPrompt) && (
                <div className="text-[11px] text-slate-400">
                  💡 追加した参照は {'<Picture 1>'} のようにプロンプト内のタグで指定してください(下のタグボタンで挿入できます)
                </div>
              )}
              <div>
                <div className="label">プロンプトへタグを挿入</div>
                <div className="flex gap-1.5 flex-wrap">
                  {refImages.map((_, i) => (
                    <button key={`p${i}`} className="chip" onClick={() => insertTag(`<Picture ${i + 1}>`)}>
                      {'<Picture '}{i + 1}{'>'}
                    </button>
                  ))}
                  {refVideos.map((_, i) => (
                    <button key={`v${i}`} className="chip" onClick={() => insertTag(`<Video ${i + 1}>`)}>
                      {'<Video '}{i + 1}{'>'}
                    </button>
                  ))}
                  {refAudios.map((_, i) => (
                    <button key={`a${i}`} className="chip" onClick={() => insertTag(`<Audio ${i + 1}>`)}>
                      {'<Audio '}{i + 1}{'>'}
                    </button>
                  ))}
                  {totalRefs === 0 && (
                    <span className="text-[11px] text-slate-500">参照を追加するとタグボタンが表示されます</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <PromptBox
            form={form}
            family="minimaxh3"
            hideNegative
            presetMode={isR2V ? 'r2v' : tab}
            placeholder={
              isR2V
                ? '例: <Picture 1>の人物が<Audio 1>に合わせて歌う。ステージ照明、口の動きは音声に正確に同期(日本語OK — 変換で英語化)'
                : '例: 雨の夜の街を歩く女性。ネオンの反射、しっとりしたピアノBGM、雨音(日本語OK — 音の描写も書けます)'
            }
          />
          <div className="card p-3">
            <div className="text-xs font-bold text-slate-300 mb-2">🎬 プロンプトビルダー</div>
            <ChipsBox family="minimaxh3" selected={form.selectedChips} toggle={form.toggleChip} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div className="text-[11px] text-slate-400 bg-panel2 border border-line rounded-lg p-2">
              映像と<b>音声(セリフ・効果音・BGM)</b>を同時生成します。音の内容もプロンプトに書いてください。
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label">ステップ数</div>
                <input
                  type="number"
                  className="input"
                  min={10}
                  max={40}
                  value={steps}
                  onChange={(e) => setSteps(clampInt(e.target.value, 10, 40, 20))}
                />
              </div>
              {isR2V && (
                <div>
                  <div className="label" title="参照トークンは全ステップに乗るため「最大」は数倍遅くなります">
                    参照画像の解像度
                  </div>
                  <select
                    className="input"
                    value={refImageSize}
                    onChange={(e) => setRefImageSize(e.target.value as 'match' | 'max')}
                  >
                    <option value="match">標準(生成解像度に合わせる・推奨)</option>
                    <option value="max">最大(顔の再現性重視・低速)</option>
                  </select>
                </div>
              )}
            </div>
            <CommonParams form={form} family="minimaxh3" />
            <GenerateBar
              form={form}
              options={options}
              estimate={estimate}
              extraDisabledReason={extraDisabledReason}
              extra={extra}
            />
          </div>
          <TipsCard family="minimaxh3" />
          <div className="card p-3 text-[11px] text-amber-400/90 space-y-1">
            <div className="font-bold">📜 ライセンス注意(MiniMax H3 Community License)</div>
            <div className="text-slate-400">
              EU・英国・韓国・米国では使用不可 / 生成物で他のAIモデルの学習は禁止 /
              SNS投稿時はAI生成の開示を。詳細はライセンス画面へ。
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
