import { useState } from 'react'
import type { FamilyOptions } from '@shared/types'
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
import { clampInt, clampNum } from '../../lib/num'

/** noise_aug_strength per motion level (0 = max fidelity, higher = more motion freedom) */
const MOTION_LEVELS = [
  { id: 'fidelity', label: '忠実重視(動き最小)', noiseAug: 0.0 },
  { id: 'balanced', label: '標準(推奨)', noiseAug: 0.04 },
  { id: 'motion', label: '動き重視(顔が変わりやすい)', noiseAug: 0.09 }
] as const

export default function CogVideoScreen(): React.JSX.Element {
  const form = useGenForm('cogvideox', 'i2v')
  const [steps, setSteps] = useState(25)
  const [cfg, setCfg] = useState(6.0)
  const [motionLevel, setMotionLevel] = useState<(typeof MOTION_LEVELS)[number]['id']>('balanced')
  const [aspectMode, setAspectMode] = useState<'pad' | 'crop' | 'stretch'>('pad')
  const [endImageLock, setEndImageLock] = useState(false)
  const [lowVramOffload, setLowVramOffload] = useState(false)

  const noiseAug = MOTION_LEVELS.find((m) => m.id === motionLevel)!.noiseAug
  const options: FamilyOptions = {
    family: 'cogvideox',
    cogvideox: { steps, cfg, noiseAugStrength: noiseAug, endImageLock, aspectMode, lowVramOffload }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <GenHeader family="cogvideox" />
      <div className="grid grid-cols-[1fr_340px] gap-5">
        <div className="space-y-4">
          <ImagePick form={form} />
          <PromptBox
            form={form}
            family="cogvideox"
            placeholder="例: 少女が微笑みながらゆっくりうなずき、髪が揺れる(日本語OK)。動作を具体的に・長めに書くほど動きが出ます"
          />
          <div className="card p-3">
            <div className="text-xs font-bold text-slate-300 mb-2">🧍 キャラクター動作ビルダー</div>
            <ChipsBox family="cogvideox" selected={form.selectedChips} toggle={form.toggleChip} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div>
              <div className="label">縦横比が合わない画像の扱い(モデルは720x480固定)</div>
              <select
                className="input"
                value={aspectMode}
                onChange={(e) => setAspectMode(e.target.value as 'pad' | 'crop' | 'stretch')}
              >
                <option value="pad">余白を追加 — 全体を残す(黒帯・推奨)</option>
                <option value="crop">中央クロップ — 帯なし(上下/左右が切れる)</option>
                <option value="stretch">引き伸ばし — 全体を残す(歪む)</option>
              </select>
              <div className="text-[11px] text-slate-500 mt-1">
                ※ CogVideoXは公式仕様で720x480専用のため、縦画像はいずれかの方法で収める必要があります。縦のまま生成したい場合は Wan2.2 / AnimeGen をご利用ください。
              </div>
            </div>
            <div>
              <div className="label">動きの強さ / 画像忠実度バランス</div>
              <select
                className="input"
                value={motionLevel}
                onChange={(e) => setMotionLevel(e.target.value as (typeof MOTION_LEVELS)[number]['id'])}
              >
                {MOTION_LEVELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-slate-500 mt-1">
                動きが出ないときは1段階上げてください(noise_aug {noiseAug.toFixed(2)})
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={endImageLock}
                onChange={(e) => setEndImageLock(e.target.checked)}
              />
              📌 アイデンティティ固定(最終フレームも同じ画像・動きはさらに減ります)
            </label>
            <label
              className="flex items-center gap-2 text-sm"
              title="モデル重みをRAMから逐次転送します。VRAM12GB前後のGPUで安定しますが、生成はかなり遅くなります"
            >
              <input
                type="checkbox"
                checked={lowVramOffload}
                onChange={(e) => setLowVramOffload(e.target.checked)}
              />
              🐢 省VRAMモード(12GB級GPU向け・低速)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label">ステップ数(公式推奨50・速さ優先25)</div>
                <input
                  type="number"
                  className="input"
                  min={20}
                  max={50}
                  value={steps}
                  onChange={(e) => setSteps(clampInt(e.target.value, 1, 60, 25))}
                />
              </div>
              <div>
                <div className="label">CFG(公式推奨6)</div>
                <input
                  type="number"
                  className="input"
                  step={0.5}
                  min={4}
                  max={8}
                  value={cfg}
                  onChange={(e) => setCfg(clampNum(e.target.value, 0, 20, 6))}
                />
              </div>
            </div>
            <CommonParams form={form} family="cogvideox" />
            <GenerateBar
              form={form}
              options={options}
              estimate="目安: RTX 4090で25step約2〜3分 / 50step約3〜6分(720x480・49f・8fps)"
            />
          </div>
          <TipsCard family="cogvideox" />
          <div className="card p-3 text-[11px] text-slate-400 space-y-1">
            <div className="font-semibold text-slate-300">💡 動きが出ないときは</div>
            <div>① 「動きの強さ」を標準→動き重視に上げる</div>
            <div>② プロンプトを長く具体的に(公式もLLMでの整形を推奨 — ✨変換ボタンで日本語から拡張できます)</div>
            <div>③ 「static camera」等の静止指定を外す/アイデンティティ固定をOFFに</div>
            <div>④ ステップ数を50に(公式推奨値)</div>
          </div>
        </div>
      </div>
    </div>
  )
}
