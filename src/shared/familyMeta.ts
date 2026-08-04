import type { ModelFamily } from './types'

export interface ResolutionPreset {
  w: number
  h: number
  label: string
}

export interface FamilyMeta {
  id: ModelFamily
  /** attribution string stored with each video (license/disclosure support) */
  modelLabel: string
  fps: number
  resolutions: ResolutionPreset[]
  framePresets: number[]
  defaultFrames: number
  supportsT2V: boolean
  supportsI2V: boolean
}

export const FAMILY_META: Record<ModelFamily, FamilyMeta> = {
  animegen: {
    id: 'animegen',
    modelLabel: 'AnimeGen (AIdeaLab) — Wan2.2 based',
    fps: 16,
    resolutions: [
      { w: 832, h: 480, label: '480p 横 (標準)' },
      { w: 480, h: 832, label: '480p 縦' },
      { w: 1280, h: 720, label: '720p 横 (高品質)' },
      { w: 720, h: 1280, label: '720p 縦 (高品質)' }
    ],
    framePresets: [49, 81, 121],
    defaultFrames: 81,
    supportsT2V: true,
    supportsI2V: true
  },
  wan22: {
    id: 'wan22',
    modelLabel: 'Wan2.2 (Alibaba, Apache-2.0)',
    fps: 16, // 14B; the 5B branch renders at 24fps and overrides this
    resolutions: [
      { w: 1280, h: 704, label: '720p 横 (標準)' },
      { w: 704, h: 1280, label: '720p 縦' },
      { w: 832, h: 480, label: '480p 横 (高速)' },
      { w: 480, h: 832, label: '480p 縦 (高速)' }
    ],
    framePresets: [49, 81, 121],
    defaultFrames: 81,
    supportsT2V: true,
    supportsI2V: true
  },
  hunyuan15: {
    id: 'hunyuan15',
    modelLabel: 'HunyuanVideo 1.5 (Tencent Hunyuan Community License)',
    fps: 24,
    resolutions: [
      { w: 1280, h: 720, label: '720p 横 (標準)' },
      { w: 720, h: 1280, label: '720p 縦' },
      { w: 848, h: 480, label: '480p 横 (プレビュー)' },
      { w: 480, h: 848, label: '480p 縦 (プレビュー)' }
    ],
    framePresets: [61, 121],
    // 121f @720p stalls on 24GB VRAM (driver sysmem fallback) — default to 61
    defaultFrames: 61,
    supportsT2V: true,
    supportsI2V: true
  },
  cogvideox: {
    id: 'cogvideox',
    modelLabel: 'CogVideoX-5B-I2V (Zhipu AI, CogVideoX License)',
    fps: 8,
    resolutions: [{ w: 720, h: 480, label: '720x480 (固定)' }],
    framePresets: [49],
    defaultFrames: 49,
    supportsT2V: false,
    supportsI2V: true
  },
  cosmos: {
    id: 'cosmos',
    modelLabel: 'NVIDIA Cosmos Predict2 — Built on NVIDIA Cosmos',
    fps: 16,
    // the installed video2world checkpoint is the 720p/16fps variant and is
    // resolution-sensitive — expose only its native size
    resolutions: [{ w: 1280, h: 720, label: '720p 横 (16:9)' }],
    framePresets: [93],
    defaultFrames: 93,
    supportsT2V: true,
    supportsI2V: true
  },
  ltx2: {
    id: 'ltx2',
    modelLabel: 'LTX-2.3 (Lightricks) — audio+video',
    fps: 24,
    // base latent = target/2 (upscaled x2 in stage 2), so both dims must be
    // multiples of 64 or the VAE floors them and the output size drifts
    resolutions: [
      { w: 1216, h: 704, label: '720p 横 (16:9)' },
      { w: 704, h: 1216, label: '720p 縦 (9:16)' },
      { w: 896, h: 512, label: '512p 横 (高速)' },
      { w: 768, h: 768, label: '正方形' }
    ],
    // LTX-2 requires (multiple of 8) + 1 frames; 217 ≈ 9秒(アバター向け)
    framePresets: [97, 121, 161, 217],
    defaultFrames: 121,
    supportsT2V: true,
    supportsI2V: true
  },
  wanfun: {
    id: 'wanfun',
    // first token doubles as the library filter label — keep it distinct from wan22
    modelLabel: 'Wan2.2-Fun Control (Alibaba PAI) — ControlNet',
    fps: 16, // 14B; 5B branch renders at 24fps and overrides at build time
    resolutions: [
      { w: 640, h: 640, label: '正方形 (標準)' },
      { w: 832, h: 480, label: '480p 横' },
      { w: 480, h: 832, label: '480p 縦' },
      { w: 704, h: 704, label: '704 正方形 (5B)' }
    ],
    framePresets: [49, 81, 121],
    defaultFrames: 81,
    // Fun Control always needs a control video; treated as an i2v-style flow
    supportsT2V: false,
    supportsI2V: true
  },
  minimaxh3: {
    id: 'minimaxh3',
    modelLabel: 'MiniMax H3 (MiniMax Community License)',
    fps: 24,
    // 768px short edge, area capped at 768*1344, all multiples of 32
    // (comfy_extras/nodes_minimax_h3.py: BASE_SHORT_EDGE / MAX_PIXELS)
    resolutions: [
      { w: 1344, h: 768, label: '16:9 横 (標準)' },
      { w: 768, h: 1344, label: '9:16 縦' },
      { w: 768, h: 768, label: '正方形' },
      { w: 1024, h: 768, label: '4:3 横' },
      { w: 768, h: 1024, label: '3:4 縦' }
    ],
    // H3 frame grid: 17k+5 at 24fps; trained range 124-362 (≈5〜15秒)
    framePresets: [124, 192, 260, 362],
    defaultFrames: 124,
    supportsT2V: true,
    supportsI2V: true
  }
}

/** Wan2.2 official default negative prompt (Chinese, from the official workflows). */
export const WAN_NEGATIVE =
  '色调艳丽,过曝,静态,细节模糊不清,字幕,风格,作品,画作,画面,静止,整体发灰,最差质量,低质量,JPEG压缩残留,丑陋的,残缺的,多余的手指,画得不好的手部,画得不好的脸部,畸形的,毁容的,形态畸形的肢体,手指融合,静止不动的画面,杂乱的背景,三条腿,背景人很多,倒着走'

/** AnimeGen official negative prompt. */
export const ANIMEGEN_NEGATIVE = '3d, cg, photo, stop, wait'

/** HunyuanVideo 1.5 general negative. */
export const HUNYUAN_NEGATIVE =
  'deformed, blurry, low quality, distorted, watermark, text, static, motionless'

/** CogVideoX community-standard negative. */
export const COGVIDEOX_NEGATIVE =
  'low quality, watermark, strange motion, deformed face, extra fingers'

/** NVIDIA's official long negative prompt for Cosmos. */
export const COSMOS_NEGATIVE =
  'The video captures a series of frames showing ugly scenes, static with no motion, motion blur, over-saturation, shaky footage, low resolution, grainy texture, pixelated images, poorly lit areas, underexposed and overexposed scenes, poor color balance, washed out colors, choppy sequences, jerky movements, low frame rate, artifacting, color banding, unnatural transitions, outdated special effects, fake elements, unconvincing visuals, poorly edited content, jump cuts, visual noise, and flickering. Overall, the video is of poor quality.'

export const DEFAULT_NEGATIVES: Record<ModelFamily, string> = {
  animegen: ANIMEGEN_NEGATIVE,
  wan22: WAN_NEGATIVE,
  hunyuan15: HUNYUAN_NEGATIVE,
  cogvideox: COGVIDEOX_NEGATIVE,
  cosmos: COSMOS_NEGATIVE,
  // LTX-2: short quality negative works well; audio artifacts covered too
  ltx2: 'low quality, worst quality, blurry, distorted, jpeg artifacts, static, noisy audio',
  // Wan Fun Control shares the Wan2.2 official negative
  wanfun: WAN_NEGATIVE,
  // MiniMax H3 samples with BasicGuider (guidance-embedded, no negative path)
  minimaxh3: ''
}
