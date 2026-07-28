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

export default function AnimeGenScreen(): React.JSX.Element {
  const form = useGenForm('animegen', 'i2v')
  const [lightning, setLightning] = useState(true)
  const [steps, setSteps] = useState(20)
  const [cfg, setCfg] = useState(3.5)
  const [animePrefix, setAnimePrefix] = useState(true)

  const options: FamilyOptions = {
    family: 'animegen',
    animegen: { lightning, steps, cfg, animePrefix }
  }
  // official recipes differ per mode: T2V = 250928 LoRA @8step, I2V = lightx2v @4step
  const lightningSteps = form.mode === 't2v' ? 8 : 4
  const estimate = lightning
    ? `目安: 480p約1〜3分 / 720p約3〜6分(lightning ${lightningSteps}step)`
    : '目安: 720p約9分〜(高品質モード・20step)'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <GenHeader family="animegen" />
      <ModeTabs form={form} family="animegen" />
      <div className="grid grid-cols-[1fr_340px] gap-5">
        <div className="space-y-4">
          <ImagePick form={form} />
          <PromptBox
            form={form}
            family="animegen"
            placeholder="例: 花畑に立つ少女、そよ風(日本語OK)/ a girl standing in a flower field, gentle breeze"
          />
          <div className="card p-3">
            <div className="text-xs font-bold text-slate-300 mb-2">✨ 動きビルダー</div>
            <ChipsBox family="animegen" selected={form.selectedChips} toggle={form.toggleChip} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={animePrefix} onChange={(e) => setAnimePrefix(e.target.checked)} />
              「Japanese anime style」を自動付与(公式推奨)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={lightning} onChange={(e) => setLightning(e.target.checked)} />
              ⚡ 高速モード(lightning {lightningSteps}step / 公式推奨設定)
            </label>
            {!lightning && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="label">ステップ数</div>
                  <input
                    type="number"
                    className="input"
                    min={10}
                    max={50}
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
                    onChange={(e) => setCfg(clampNum(e.target.value, 0, 20, 3.5))}
                  />
                </div>
              </div>
            )}
            <CommonParams form={form} family="animegen" />
            <GenerateBar form={form} options={options} estimate={estimate} />
          </div>
          <TipsCard family="animegen" />
        </div>
      </div>
    </div>
  )
}
