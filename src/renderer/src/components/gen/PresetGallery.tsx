import { useMemo, useState } from 'react'
import type { ModelFamily } from '@shared/types'
import type { PresetMode, PromptPreset } from '../../data/presets/types'
import { PRESETS as ANIMEGEN } from '../../data/presets/animegen'
import { PRESETS as WAN22 } from '../../data/presets/wan22'
import { PRESETS as HUNYUAN15 } from '../../data/presets/hunyuan15'
import { PRESETS as COGVIDEOX } from '../../data/presets/cogvideox'
import { PRESETS as COSMOS } from '../../data/presets/cosmos'
import { PRESETS as LTX2 } from '../../data/presets/ltx2'
import { PRESETS as WANFUN } from '../../data/presets/wanfun'

const ALL: Record<ModelFamily, PromptPreset[]> = {
  animegen: ANIMEGEN,
  wan22: WAN22,
  hunyuan15: HUNYUAN15,
  cogvideox: COGVIDEOX,
  cosmos: COSMOS,
  ltx2: LTX2,
  wanfun: WANFUN
}

export default function PresetGallery({
  family,
  mode,
  onPick,
  onClose
}: {
  family: ModelFamily
  /** current generation mode — presets tagged for another mode are hidden */
  mode?: PresetMode
  onPick: (preset: PromptPreset) => void
  onClose: () => void
}): React.JSX.Element {
  // mode-filtered base set: t2v scenes would contradict an uploaded image,
  // i2v motion instructions lack a subject for pure text-to-video
  const presets = useMemo(
    () => ALL[family].filter((p) => !p.modes || !mode || p.modes.includes(mode)),
    [family, mode]
  )
  const categories = useMemo(() => [...new Set(presets.map((p) => p.category))], [presets])
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')

  const filtered = presets.filter((p) => {
    if (category !== 'all' && p.category !== category) return false
    if (search && !`${p.title} ${p.prompt}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-8" onClick={onClose}>
      <div
        className="card max-w-3xl w-full h-[80vh] flex flex-col p-4 gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="font-bold">
            📚 プロンプトプリセット({presets.length}種
            {mode
              ? ` — ${
                  mode === 'i2v'
                    ? 'I2V: 画像を動かす'
                    : mode === 'avatar'
                      ? '喋るアバター'
                      : 'T2V: 文章から生成'
                }向け`
              : ''})
          </div>
          <input
            className="input max-w-52 ml-auto"
            placeholder="検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn-ghost text-xs" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button className={`chip ${category === 'all' ? 'chip-on' : ''}`} onClick={() => setCategory('all')}>
            すべて
          </button>
          {categories.map((c) => (
            <button
              key={c}
              className={`chip ${category === c ? 'chip-on' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
          {filtered.map((p) => (
            <button
              key={`${p.category}:${p.title}`}
              className="card w-full p-3 text-left hover:border-accent transition-colors"
              onClick={() => {
                onPick(p)
                onClose()
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{p.title}</span>
                <span className="text-[10px] text-slate-500 border border-line rounded px-1.5 py-0.5">
                  {p.category}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">{p.prompt}</div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-slate-500 text-sm py-10">該当するプリセットがありません</div>
          )}
        </div>
      </div>
    </div>
  )
}
