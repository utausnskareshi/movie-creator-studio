import { useEffect, useState } from 'react'
import type { ControlType, FamilyOptions } from '@shared/types'
import {
  ChipsBox,
  CommonParams,
  ControlVideoPick,
  GenHeader,
  GenerateBar,
  ImagePick,
  PromptBox,
  TipsCard,
  useGenForm
} from '../../components/gen/common'
import { useApp } from '../../store'
import { packReadyById } from '../../lib/ready'
import { clampInt, clampNum } from '../../lib/num'

const CONTROL_TYPES: Array<{ id: ControlType; label: string; note: string }> = [
  { id: 'canny', label: '線画 (Canny)', note: '制御動画から輪郭線を自動抽出' },
  { id: 'pose', label: 'ポーズ (DWPose)', note: '制御動画の人物から骨格を自動抽出(ポーズの手動指定は不要)' },
  { id: 'depth', label: '深度 (Depth)', note: '制御動画から奥行きを自動抽出' }
]

export default function WanFunScreen(): React.JSX.Element {
  const form = useGenForm('wanfun', 'i2v')
  const { setupStatus, catalog } = useApp()
  const ready14b = packReadyById('wanfun_14b', setupStatus, catalog)
  const ready5b = packReadyById('wanfun_5b', setupStatus, catalog)
  const [size, setSize] = useState<'14b' | '5b'>('5b')
  const [controlType, setControlType] = useState<ControlType>('canny')

  // prefer whichever variant is actually installed (same policy as Wan2.2):
  // the generate button should be enabled the moment the screen opens
  useEffect(() => {
    if (size === '5b' && !ready5b && ready14b) setSize('14b')
    if (size === '14b' && !ready14b && ready5b) setSize('5b')
  }, [size, ready5b, ready14b])
  const [lightning, setLightning] = useState(false)
  const [steps, setSteps] = useState(20)
  const [cfg, setCfg] = useState(size === '5b' ? 5 : 3.5)
  // the official CFG differs per variant (5B: 5.0, A14B: 3.5). The initial
  // useState only ran once, so an auto-switch (or a manual one) left the other
  // variant's value in place and silently degraded the result.
  useEffect(() => {
    setCfg(size === '5b' ? 5 : 3.5)
  }, [size])

  const options: FamilyOptions = {
    family: 'wanfun',
    wanfun: { size, controlType, lightning: size === '14b' && lightning, steps, cfg }
  }
  const variantMissing =
    size === '14b' && !ready14b
      ? 'A14Bモデルが未導入です(セットアップ画面)'
      : size === '5b' && !ready5b
        ? '5Bモデルが未導入です(セットアップ画面)'
        : null

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <GenHeader family="wanfun" />
      <div className="grid grid-cols-[1fr_340px] gap-5">
        <div className="space-y-4">
          <ControlVideoPick form={form} />
          <ImagePick form={form} always label="参照画像(任意 — 1フレーム目の見た目)" />
          <PromptBox
            form={form}
            family="wanfun"
            placeholder="例: ストリートファッションの若い女性、ネオンの路地、写実的(動きは制御動画が決めます)"
          />
          <div className="card p-3">
            <div className="text-xs font-bold text-slate-300 mb-2">🎨 見た目ビルダー(動きは書かない)</div>
            <ChipsBox family="wanfun" selected={form.selectedChips} toggle={form.toggleChip} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div>
              <div className="label">制御の種類</div>
              <div className="flex flex-col gap-1.5">
                {CONTROL_TYPES.map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-start gap-2 text-sm rounded-lg border px-2 py-1.5 cursor-pointer ${controlType === c.id ? 'border-accent bg-indigo-500/10' : 'border-line'}`}
                  >
                    <input
                      type="radio"
                      className="mt-0.5"
                      checked={controlType === c.id}
                      onChange={() => setControlType(c.id)}
                    />
                    <span>
                      {c.label}
                      <span className="block text-[11px] text-slate-500">{c.note}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="label">モデル</div>
              <select
                className="input"
                value={size}
                onChange={(e) => {
                  const s = e.target.value as '14b' | '5b'
                  setSize(s)
                  // official default cfg differs per variant (5B: 5.0 / A14B: 3.5)
                  setCfg(s === '5b' ? 5 : 3.5)
                }}
              >
                <option value="5b" disabled={!ready5b}>
                  5B(軽量・高速){ready5b ? '' : ' — 未導入'}
                </option>
                <option value="14b" disabled={!ready14b}>
                  A14B(高品質・低速){ready14b ? '' : ' — 未導入'}
                </option>
              </select>
            </div>
            {size === '14b' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={lightning} onChange={(e) => setLightning(e.target.checked)} />
                ⚡ 高速モード(lightning 4step — 公式テンプレ同梱の高速枝)
              </label>
            )}
            {(size === '5b' || !lightning) && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="label">ステップ数</div>
                  <input
                    type="number"
                    className="input"
                    min={10}
                    max={40}
                    value={steps}
                    onChange={(e) => setSteps(clampInt(e.target.value, 1, 60, 20))}
                  />
                </div>
                <div>
                  <div className="label">CFG</div>
                  <input
                    type="number"
                    className="input"
                    step={0.5}
                    min={1}
                    max={10}
                    value={cfg}
                    onChange={(e) => setCfg(clampNum(e.target.value, 0, 20, 5))}
                  />
                </div>
              </div>
            )}
            <CommonParams form={form} family="wanfun" fpsOverride={size === '5b' ? 24 : 16} />
            <GenerateBar
              form={form}
              options={options}
              estimate="目安: 5Bで数分 / A14Bで10分以上(制御動画のフレーム数に依存)"
              extraDisabledReason={variantMissing}
            />
          </div>
          <TipsCard family="wanfun" />
          <div className="card p-3 text-[11px] text-slate-400">
            制御動画は「動きの見本」です。線画/ポーズ/深度を自動抽出して、その動きをプロンプトの見た目で再現します。
            制御動画が指定フレーム数より短い場合、足りない部分は制御なしの自由生成になります。
          </div>
        </div>
      </div>
    </div>
  )
}
