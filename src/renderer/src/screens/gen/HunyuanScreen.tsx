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
import { clampInt, clampNum } from '../../lib/num'

export default function HunyuanScreen(): React.JSX.Element {
  const form = useGenForm('hunyuan15', 't2v')
  const [variant, setVariant] = useState<'720p' | '480p_distilled'>('720p')
  const [superResolution, setSuperResolution] = useState(false)
  const [steps, setSteps] = useState(20)
  const [cfg, setCfg] = useState(6.0)

  // Keep mode/resolution consistent with the active variant: the distilled
  // checkpoint is I2V+480p only, the standard one only lists 720p. Locking
  // the tabs/select alone left the PREVIOUS values active underneath — the
  // form still generated 1280x720 (or T2V) against the 480p I2V checkpoint,
  // with the <select> showing an option that wasn't even selectable.
  useEffect(() => {
    const portrait = form.resIndex === 1 || form.resIndex === 3
    const allowed = variant === '480p_distilled' ? [2, 3] : [0, 1]
    if (!allowed.includes(form.resIndex)) form.setResIndex(allowed[portrait ? 1 : 0])
    if (variant === '480p_distilled' && form.mode !== 'i2v') form.setMode('i2v')
  }, [variant, form.mode, form.resIndex])

  // SR (1080p latent upscale + distilled refine) applies to both T2V and I2V —
  // start_image/clip_vision are optional inputs on the SR node
  const srActive = variant === '720p' && superResolution
  const options: FamilyOptions = {
    family: 'hunyuan15',
    hunyuan15: { variant, superResolution: srActive, steps, cfg }
  }
  // measured on RTX 5090 Laptop 24GB: 480p distilled ~3min, 720p 61f ~18min;
  // 720p x 121f exceeds VRAM and stalls -> blocked below
  const estimate =
    variant === '480p_distilled'
      ? '目安: 約2〜4分(蒸留版プレビュー)'
      : `目安: 61フレームで約15〜20分${srActive ? ' + SR' : ''}(高負荷モデルです)`
  const heavyBlocked =
    variant === '720p' && form.frames === 121
      ? '720p×121フレームはVRAM 24GBでは処理できません(停止します)。61フレームにするか、480pプレビューをご利用ください'
      : null

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <GenHeader family="hunyuan15" />
      {/* the distilled checkpoint is I2V-only and 480p-only: leaving the tabs
          and the resolution list open produced a graph ComfyUI always rejects
          (the T2V request still built the i2v template with no input image) */}
      <ModeTabs
        form={form}
        family="hunyuan15"
        lockedTo={variant === '480p_distilled' ? 'i2v' : undefined}
        lockReason={
          variant === '480p_distilled'
            ? '480p 高速プレビュー(蒸留版)は I2V 専用です。T2V を使うには品質モードを 720p に変更してください'
            : undefined
        }
      />
      <div className="grid grid-cols-[1fr_340px] gap-5">
        <div className="space-y-4">
          <ImagePick form={form} />
          <PromptBox
            form={form}
            family="hunyuan15"
            placeholder="例: 巨大な波に乗るサーファー、水しぶき(日本語OK)。公式構成: 被写体+動き+シーン+カメラ+照明"
          />
          <div className="card p-3">
            <div className="text-xs font-bold text-slate-300 mb-2">🌊 動き・物理ビルダー</div>
            <ChipsBox family="hunyuan15" selected={form.selectedChips} toggle={form.toggleChip} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div>
              <div className="label">品質モード</div>
              <select
                className="input"
                value={variant}
                onChange={(e) => {
                  const v = e.target.value as '720p' | '480p_distilled'
                  setVariant(v)
                  if (v === '480p_distilled') {
                    form.setMode('i2v')
                    form.setResIndex(2) // 480p preset — the distilled model is resolution-specific
                  } else {
                    form.setResIndex(0)
                  }
                }}
              >
                <option value="720p">720p 標準(T2V/I2V)</option>
                <option value="480p_distilled">480p 高速プレビュー(蒸留版・I2Vのみ)</option>
              </select>
            </div>
            {variant === '720p' && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={superResolution}
                    onChange={(e) => setSuperResolution(e.target.checked)}
                  />
                  🔍 1080p 超解像(SRステージ・+7.8GB)
                </label>
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
                      onChange={(e) => setCfg(clampNum(e.target.value, 0, 20, 6))}
                    />
                  </div>
                </div>
              </>
            )}
            <CommonParams
              form={form}
              family="hunyuan15"
              allowedResIndexes={variant === '480p_distilled' ? [2, 3] : [0, 1]}
              resNote={
                variant === '480p_distilled'
                  ? '蒸留版は 480p 専用です'
                  : srActive
                    ? '超解像は選択した解像度の1.5倍で出力されます'
                    : undefined
              }
            />
            <GenerateBar form={form} options={options} estimate={estimate} extraDisabledReason={heavyBlocked} />
          </div>
          <TipsCard family="hunyuan15" />
          <div className="card p-3 text-[11px] text-amber-300/90 border-amber-800">
            ⚠️ ライセンス: EU・英国・韓国では利用不可 / 生成物のAI開示が必要(Tencent Hunyuan
            Community License)
          </div>
        </div>
      </div>
    </div>
  )
}
