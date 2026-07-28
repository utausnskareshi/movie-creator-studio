import { describe, expect, it } from 'vitest'
import type { PresetMode, PromptPreset } from '../src/renderer/src/data/presets/types'
import { PRESETS as ANIMEGEN } from '../src/renderer/src/data/presets/animegen'
import { PRESETS as WAN22 } from '../src/renderer/src/data/presets/wan22'
import { PRESETS as HUNYUAN15 } from '../src/renderer/src/data/presets/hunyuan15'
import { PRESETS as COGVIDEOX } from '../src/renderer/src/data/presets/cogvideox'
import { PRESETS as COSMOS } from '../src/renderer/src/data/presets/cosmos'
import { PRESETS as LTX2 } from '../src/renderer/src/data/presets/ltx2'
import { PRESETS as WANFUN } from '../src/renderer/src/data/presets/wanfun'

/** presets visible in the gallery for a given mode (same filter as PresetGallery) */
const visible = (p: PromptPreset[], mode: PresetMode): PromptPreset[] =>
  p.filter((x) => !x.modes || x.modes.includes(mode))

const ALL: Array<[string, PromptPreset[]]> = [
  ['animegen', ANIMEGEN],
  ['wan22', WAN22],
  ['hunyuan15', HUNYUAN15],
  ['cogvideox', COGVIDEOX],
  ['cosmos', COSMOS],
  ['ltx2', LTX2],
  ['wanfun', WANFUN]
]

describe('preset counts (仕様: モデル×モードごとに50件)', () => {
  it.each([
    ['animegen', ANIMEGEN],
    ['wan22', WAN22],
    ['hunyuan15', HUNYUAN15],
    ['cosmos', COSMOS]
  ])('%s: T2V>=50 かつ I2V>=50', (_name, presets) => {
    expect(visible(presets, 't2v').length).toBeGreaterThanOrEqual(50)
    expect(visible(presets, 'i2v').length).toBeGreaterThanOrEqual(50)
  })

  it('cogvideox (I2V専用モデル): 50件以上', () => {
    expect(visible(COGVIDEOX, 'i2v').length).toBeGreaterThanOrEqual(50)
  })

  it('ltx2: 映像T2V/映像I2V/アバターがそれぞれ50件以上', () => {
    expect(visible(LTX2, 't2v').length).toBeGreaterThanOrEqual(50)
    expect(visible(LTX2, 'i2v').length).toBeGreaterThanOrEqual(50)
    expect(visible(LTX2, 'avatar').length).toBeGreaterThanOrEqual(50)
    // 3区分は互いに独立(t2vリストにアバター用が混ざらない等)
    expect(visible(LTX2, 't2v').some((p) => p.modes?.includes('avatar'))).toBe(false)
    expect(visible(LTX2, 'i2v').some((p) => p.modes?.includes('avatar'))).toBe(false)
  })

  it('wanfun (モード区分なし): 50件以上', () => {
    expect(WANFUN.length).toBeGreaterThanOrEqual(50)
  })
})

describe('preset integrity', () => {
  it.each(ALL)('%s: 一覧キー(category:title)が重複しない', (_name, presets) => {
    const keys = presets.map((p) => `${p.category}:${p.title}`)
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
    expect(dupes).toEqual([])
  })

  it.each(ALL)('%s: プロンプトは英語のみ(日本語混入なし)・空でない', (_name, presets) => {
    for (const p of presets) {
      expect(p.prompt.trim().length).toBeGreaterThan(10)
      // 誤って日本語がプロンプトへ混入していないこと(タイトルは日本語でOK)
      expect(/[぀-ヿ一-鿿]/.test(p.prompt)).toBe(false)
    }
  })

  it('ltx2: 全プリセットが Audio: 行を含む(音の同時生成がこのモデルの要)', () => {
    for (const p of LTX2) {
      expect(p.prompt).toContain('Audio:')
    }
  })
})
