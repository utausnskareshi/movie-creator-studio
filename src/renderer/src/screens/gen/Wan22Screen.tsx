import { useEffect, useState } from 'react'
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
import { useApp } from '../../store'
import { packReadyById } from '../../lib/ready'
import { clampInt, clampNum } from '../../lib/num'

export default function Wan22Screen(): React.JSX.Element {
  const form = useGenForm('wan22', 't2v')
  const { setupStatus, catalog } = useApp()
  const ready14b = packReadyById('wan22_14b', setupStatus, catalog)
  const ready5b = packReadyById('wan22_5b', setupStatus, catalog)
  const [size, setSize] = useState<'14b' | '5b'>('14b')
  const [lightning, setLightning] = useState(true)
  const [steps, setSteps] = useState(20)
  const [cfg, setCfg] = useState(3.5)

  // only offer installed variants (the screen is reachable when at least one is)
  useEffect(() => {
    if (size === '14b' && !ready14b && ready5b) setSize('5b')
    if (size === '5b' && !ready5b && ready14b) setSize('14b')
  }, [size, ready14b, ready5b])

  // each variant has a different official default cfg (5B: 5.0 / A14B: 3.5) —
  // follow the variant so quality mode matches the official workflows
  useEffect(() => {
    setCfg(size === '5b' ? 5 : 3.5)
  }, [size])

  const variantMissing =
    size === '14b' && !ready14b
      ? 'A14Bモデルが未導入です(セットアップ画面からダウンロードできます)'
      : size === '5b' && !ready5b
        ? 'TI2V-5Bモデルが未導入です(セットアップ画面からダウンロードできます)'
        : null

  const options: FamilyOptions = { family: 'wan22', wan22: { size, lightning: size === '14b' && lightning, steps, cfg } }
  const estimate =
    size === '5b'
      ? '目安: RTX 4090で約2〜5分'
      : lightning
        ? '目安: RTX 4090で約1〜3分(lightning 4step)'
        : '目安: RTX 4090で約9〜15分(高品質20step)'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <GenHeader family="wan22" />
      <ModeTabs form={form} family="wan22" />
      <div className="grid grid-cols-[1fr_340px] gap-5">
        <div className="space-y-4">
          <ImagePick form={form} />
          <PromptBox
            form={form}
            family="wan22"
            placeholder="例: 雨のネオン街を歩く侍(日本語OK)/ A lone samurai walking through a rainy neon-lit alley"
          />
          <div className="card p-3">
            <div className="text-xs font-bold text-slate-300 mb-2">🎥 シネマティック・ビルダー</div>
            <ChipsBox family="wan22" selected={form.selectedChips} toggle={form.toggleChip} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div>
              <div className="label">モデル</div>
              <select className="input" value={size} onChange={(e) => setSize(e.target.value as '14b' | '5b')}>
                <option value="14b" disabled={!ready14b}>
                  A14B(高品質・MoE 2エキスパート){ready14b ? '' : ' — 未導入'}
                </option>
                <option value="5b" disabled={!ready5b}>
                  TI2V-5B(軽量・低VRAM){ready5b ? '' : ' — 未導入'}
                </option>
              </select>
            </div>
            {size === '14b' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={lightning} onChange={(e) => setLightning(e.target.checked)} />
                ⚡ 高速モード(lightning 4step LoRA)
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
            <CommonParams form={form} family="wan22" fpsOverride={size === '5b' ? 24 : 16} />
            <GenerateBar form={form} options={options} estimate={estimate} extraDisabledReason={variantMissing} />
          </div>
          <TipsCard family="wan22" />
        </div>
      </div>
    </div>
  )
}
