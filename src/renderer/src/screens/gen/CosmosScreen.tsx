import { useState } from 'react'
import type { FamilyOptions } from '@shared/types'
import {
  ChipsBox,
  CommonParams,
  GenHeader,
  GenerateBar,
  ImagePick,
  ModeTabs,
  PromptBox,
  TipsCard,
  useGenForm
} from '../../components/gen/common'
import { clampInt, clampNum } from '../../lib/num'

export default function CosmosScreen(): React.JSX.Element {
  const form = useGenForm('cosmos', 't2v')
  const [steps, setSteps] = useState(30)
  const [cfg, setCfg] = useState(4.0)

  const options: FamilyOptions = { family: 'cosmos', cosmos: { steps, cfg } }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <GenHeader family="cosmos" />
      <ModeTabs form={form} family="cosmos" />
      <div className="grid grid-cols-[1fr_340px] gap-5">
        <div className="space-y-4">
          <ImagePick form={form} />
          <PromptBox
            form={form}
            family="cosmos"
            placeholder="例: 朝焼けの渓谷をドローンで前進、朝もやが晴れていく(日本語OK — 変換で物理的に正確な長文英語になります)"
          />
          <div className="card p-3">
            <div className="text-xs font-bold text-slate-300 mb-2">🚁 空撮ビルダー</div>
            <ChipsBox family="cosmos" selected={form.selectedChips} toggle={form.toggleChip} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            {form.mode === 't2v' && (
              <div className="text-[11px] text-slate-400 bg-panel2 border border-line rounded-lg p-2">
                T2Vは「①プロンプト→静止画生成(Text2Image)→②その画像を動画化(Video2World)」の2段チェーンを自動実行します。
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label">ステップ数{form.mode === 't2v' ? '(2段両方に適用)' : ''}</div>
                <input
                  type="number"
                  className="input"
                  min={20}
                  max={50}
                  value={steps}
                  onChange={(e) => setSteps(clampInt(e.target.value, 1, 60, 30))}
                />
              </div>
              <div>
                <div className="label">CFG{form.mode === 't2v' ? '(2段両方に適用)' : ''}</div>
                <input
                  type="number"
                  className="input"
                  step={0.5}
                  min={2}
                  max={8}
                  value={cfg}
                  onChange={(e) => setCfg(clampNum(e.target.value, 0, 20, 4))}
                />
              </div>
            </div>
            <CommonParams form={form} family="cosmos" />
            <GenerateBar
              form={form}
              options={options}
              estimate="目安: 約20〜30分(720p・93フレーム。物理シミュレーションのため高負荷です)"
            />
          </div>
          <TipsCard family="cosmos" />
          <div className="card p-3 text-[11px] text-slate-400">
            Built on NVIDIA Cosmos — NVIDIA Open Model License(商用可・出力の権利はユーザー帰属)
          </div>
        </div>
      </div>
    </div>
  )
}
