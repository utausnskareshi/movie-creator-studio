import { beforeAll, describe, expect, it } from 'vitest'
import { join } from 'path'
import { buildGraph, setWorkflowsDir } from '../src/main/comfyui/graphs'
import type { GenerationRequest } from '../src/shared/types'

beforeAll(() => {
  setWorkflowsDir(join(process.cwd(), 'resources', 'workflows'))
})

function assertRefsResolve(graph: Record<string, { class_type: string; inputs: Record<string, unknown> }>): void {
  for (const [nodeId, node] of Object.entries(graph)) {
    for (const [key, v] of Object.entries(node.inputs)) {
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string') {
        expect(graph[v[0]], `node "${nodeId}" input "${key}" references missing node "${v[0]}"`).toBeDefined()
      }
    }
  }
}

function baseReq(partial: Partial<GenerationRequest> & Pick<GenerationRequest, 'family' | 'mode' | 'options'>): GenerationRequest {
  return {
    prompt: 'a test prompt',
    negative: 'bad quality',
    seed: 42,
    width: 832,
    height: 480,
    frames: 81,
    ...partial
  }
}

describe('buildGraph', () => {
  it('wan22 14b t2v lightning: keeps loras, 4 steps, cfg 1', () => {
    const { graph, fps } = buildGraph(
      baseReq({
        family: 'wan22',
        mode: 't2v',
        options: { family: 'wan22', wan22: { size: '14b', lightning: true, steps: 20, cfg: 3.5 } }
      }),
      'job1',
      null
    )
    expect(fps).toBe(16)
    expect(graph['lora_high']).toBeDefined()
    expect(graph['sampler_1'].inputs['steps']).toBe(4)
    expect(graph['sampler_1'].inputs['cfg']).toBe(1)
    expect(graph['sampler_1'].inputs['end_at_step']).toBe(2)
    expect(graph['sampler_2'].inputs['start_at_step']).toBe(2)
    expect(graph['positive'].inputs['text']).toBe('a test prompt')
    expect(graph['sampler_1'].inputs['noise_seed']).toBe(42)
    expect(graph['empty_latent'].inputs['width']).toBe(832)
    expect(graph['save_video'].inputs['filename_prefix']).toBe('mcs/job1')
    assertRefsResolve(graph)
  })

  it('wan22 14b quality mode: bypasses loras, uses requested steps/cfg', () => {
    const { graph } = buildGraph(
      baseReq({
        family: 'wan22',
        mode: 't2v',
        options: { family: 'wan22', wan22: { size: '14b', lightning: false, steps: 20, cfg: 3.5 } }
      }),
      'job2',
      null
    )
    expect(graph['lora_high']).toBeUndefined()
    expect(graph['lora_low']).toBeUndefined()
    expect(graph['sampler_1'].inputs['steps']).toBe(20)
    expect(graph['sampler_1'].inputs['cfg']).toBe(3.5)
    expect(graph['sampler_1'].inputs['end_at_step']).toBe(10)
    // model_sampling now reads straight from the unet loader
    expect(graph['model_sampling_high'].inputs['model']).toEqual(['unet_high', 0])
    // quality mode follows the official base-Wan workflows: shift 8.0
    // (the baked-in 5.0 is the lightning-recipe value)
    expect(graph['model_sampling_high'].inputs['shift']).toBe(8.0)
    expect(graph['model_sampling_low'].inputs['shift']).toBe(8.0)
    assertRefsResolve(graph)
  })

  it('wan22 5b i2v requires image and wires it', () => {
    const req = baseReq({
      family: 'wan22',
      mode: 'i2v',
      options: { family: 'wan22', wan22: { size: '5b', lightning: false, steps: 20, cfg: 5 } }
    })
    expect(() => buildGraph(req, 'job3', null)).toThrow(/入力画像/)
    const { graph, fps } = buildGraph(req, 'job3', 'uploaded.png')
    expect(fps).toBe(24)
    expect(graph['load_image'].inputs['image']).toBe('uploaded.png')
    expect(graph['sampler_1'].inputs['steps']).toBe(20)
    assertRefsResolve(graph)
  })

  it('animegen i2v: anime prefix + shift 3.0 template', () => {
    const { graph } = buildGraph(
      baseReq({
        family: 'animegen',
        mode: 'i2v',
        options: { family: 'animegen', animegen: { lightning: true, steps: 20, cfg: 3.5, animePrefix: true } }
      }),
      'job4',
      'img.png'
    )
    expect(graph['positive'].inputs['text']).toBe('Japanese anime style, a test prompt')
    // lightx2v official NativeComfy workflow: shift 5 for the 4-step Lightning setup
    expect(graph['model_sampling_high'].inputs['shift']).toBe(5.0)
    // I2V lightning runs the official 4-step split
    expect(graph['sampler_1'].inputs['steps']).toBe(4)
    expect(graph['sampler_1'].inputs['end_at_step']).toBe(2)
    assertRefsResolve(graph)
  })

  it('animegen t2v lightning: official 250928 recipe runs 8 steps split at 4', () => {
    const { graph } = buildGraph(
      baseReq({
        family: 'animegen',
        mode: 't2v',
        options: { family: 'animegen', animegen: { lightning: true, steps: 20, cfg: 3.5, animePrefix: false } }
      }),
      'job4b',
      null
    )
    expect(graph['lora_high']).toBeDefined()
    expect(graph['sampler_1'].inputs['steps']).toBe(8)
    expect(graph['sampler_1'].inputs['end_at_step']).toBe(4)
    expect(graph['sampler_2'].inputs['start_at_step']).toBe(4)
    // lightning keeps the template (recipe) shift
    expect(graph['model_sampling_high'].inputs['shift']).toBe(5.0)
    assertRefsResolve(graph)
  })

  it('hunyuan15 720p i2v with SR: injects cfg/steps into guider/scheduler', () => {
    const { graph } = buildGraph(
      baseReq({
        family: 'hunyuan15',
        mode: 'i2v',
        width: 1280,
        height: 720,
        frames: 121,
        options: {
          family: 'hunyuan15',
          hunyuan15: { variant: '720p', superResolution: true, steps: 24, cfg: 5.5 }
        }
      }),
      'job5',
      'img.png'
    )
    expect(graph['cfg_guider'].inputs['cfg']).toBe(5.5)
    expect(graph['scheduler'].inputs['steps']).toBe(24)
    expect(graph['latent_upscale']).toBeDefined()
    expect(graph['i2v'].inputs['width']).toBe(1280)
    assertRefsResolve(graph)
  })

  it('hunyuan15 t2v with SR: SR tail present, no start-image inputs', () => {
    const { graph } = buildGraph(
      baseReq({
        family: 'hunyuan15',
        mode: 't2v',
        width: 1280,
        height: 720,
        frames: 61,
        options: {
          family: 'hunyuan15',
          hunyuan15: { variant: '720p', superResolution: true, steps: 24, cfg: 5.5 }
        }
      }),
      'job5b',
      null
    )
    expect(graph['latent_upscale']).toBeDefined()
    expect(graph['sampler_3']).toBeDefined()
    // T2V SR omits the optional start_image / clip_vision_output inputs
    expect(graph['sr'].inputs['start_image']).toBeUndefined()
    expect(graph['sr'].inputs['clip_vision_output']).toBeUndefined()
    expect(graph['load_image']).toBeUndefined()
    // user steps/cfg go to the BASE stage only; SR keeps its distilled recipe
    expect(graph['scheduler'].inputs['steps']).toBe(24)
    expect(graph['scheduler_sr'].inputs['steps']).toBe(8)
    expect(graph['cfg_guider'].inputs['cfg']).toBe(5.5)
    expect(graph['decode'].inputs['samples']).toEqual(['sampler_3', 0])
    assertRefsResolve(graph)
  })

  it('hunyuan15 SR follows the requested aspect instead of the template 1920x1080', () => {
    // the templates transcribe the official 1280x720 -> 1920x1080 example; if
    // latent_upscale is left untouched, EVERY super-resolved render comes back
    // 1920x1080 and a portrait request is stretched into landscape
    const portrait = buildGraph(
      baseReq({
        family: 'hunyuan15',
        mode: 't2v',
        width: 720,
        height: 1280,
        frames: 61,
        options: {
          family: 'hunyuan15',
          hunyuan15: { variant: '720p', superResolution: true, steps: 24, cfg: 5.5 }
        }
      }),
      'job-sr-portrait',
      null
    ).graph
    expect(portrait['latent_upscale'].inputs['width']).toBe(1080)
    expect(portrait['latent_upscale'].inputs['height']).toBe(1920)

    const landscape = buildGraph(
      baseReq({
        family: 'hunyuan15',
        mode: 't2v',
        width: 1280,
        height: 720,
        frames: 61,
        options: {
          family: 'hunyuan15',
          hunyuan15: { variant: '720p', superResolution: true, steps: 24, cfg: 5.5 }
        }
      }),
      'job-sr-landscape',
      null
    ).graph
    // the standard preset still lands on the official 1080p target exactly
    expect(landscape['latent_upscale'].inputs['width']).toBe(1920)
    expect(landscape['latent_upscale'].inputs['height']).toBe(1080)
  })

  it('hunyuan15 480p distilled rejects T2V instead of building an imageless I2V graph', () => {
    const req = baseReq({
      family: 'hunyuan15',
      mode: 't2v',
      width: 848,
      height: 480,
      frames: 61,
      options: {
        family: 'hunyuan15',
        hunyuan15: { variant: '480p_distilled', superResolution: false, steps: 20, cfg: 6 }
      }
    })
    expect(() => buildGraph(req, 'job-distilled-t2v', null)).toThrow(/I2V/)
    // the same variant in I2V mode still builds
    const ok = buildGraph({ ...req, mode: 'i2v' }, 'job-distilled-i2v', 'input.png').graph
    expect(ok['load_image']).toBeDefined()
    assertRefsResolve(ok)
  })

  it('cogvideox: prompt goes into CogVideoTextEncode.prompt, end-image lock optional', () => {
    const reqNoLock = baseReq({
      family: 'cogvideox',
      mode: 'i2v',
      width: 720,
      height: 480,
      frames: 49,
      options: {
        family: 'cogvideox',
        cogvideox: { steps: 25, cfg: 6, noiseAugStrength: 0.0, endImageLock: false, aspectMode: 'pad', lowVramOffload: false }
      }
    })
    const { graph, fps } = buildGraph(reqNoLock, 'job6', 'char.png')
    expect(fps).toBe(8)
    expect(graph['positive'].inputs['prompt']).toBe('a test prompt')
    expect(graph['negative'].inputs['prompt']).toBe('bad quality')
    expect(graph['sampler_1'].inputs['seed']).toBe(42)
    expect(graph['sampler_1'].inputs['num_frames']).toBe(49)
    expect(graph['i2v'].inputs['end_image']).toBeUndefined()
    // pad mode: image is pre-padded app-side, so no in-workflow cropping
    expect(graph['resize'].inputs['crop']).toBe('disabled')
    assertRefsResolve(graph)

    const { graph: locked } = buildGraph(
      { ...reqNoLock, options: { family: 'cogvideox', cogvideox: { steps: 25, cfg: 6, noiseAugStrength: 0, endImageLock: true, aspectMode: 'crop', lowVramOffload: true } } },
      'job7',
      'char.png'
    )
    expect(locked['i2v'].inputs['end_image']).toEqual(['resize', 0])
    expect(locked['resize'].inputs['crop']).toBe('center')
    // low-VRAM mode flips the wrapper's sequential offload on
    expect(locked['model_loader'].inputs['enable_sequential_cpu_offload']).toBe(true)
    assertRefsResolve(locked)
  })

  it('cosmos t2v: chained stages share steps/cfg and dims', () => {
    const { graph } = buildGraph(
      baseReq({
        family: 'cosmos',
        mode: 't2v',
        width: 1280,
        height: 720,
        frames: 93,
        options: { family: 'cosmos', cosmos: { steps: 30, cfg: 4 } }
      }),
      'job8',
      null
    )
    expect(graph['sampler_1'].inputs['steps']).toBe(30)
    expect(graph['sampler_2'].inputs['steps']).toBe(30)
    expect(graph['empty_latent'].inputs['width']).toBe(1280)
    expect(graph['i2v'].inputs['width']).toBe(1280)
    expect(graph['i2v'].inputs['length']).toBe(93)
    assertRefsResolve(graph)
  })

  it('cosmos i2v: single stage with start image', () => {
    const { graph } = buildGraph(
      baseReq({
        family: 'cosmos',
        mode: 'i2v',
        width: 1280,
        height: 720,
        frames: 93,
        options: { family: 'cosmos', cosmos: { steps: 30, cfg: 4 } }
      }),
      'job9',
      'photo.png'
    )
    expect(graph['load_image'].inputs['image']).toBe('photo.png')
    assertRefsResolve(graph)
  })

  it('ltx2 t2v: base latent is half target, fps/audio aligned', () => {
    const { graph, fps } = buildGraph(
      baseReq({
        family: 'ltx2',
        mode: 't2v',
        width: 1216,
        height: 704,
        frames: 121,
        options: { family: 'ltx2', ltx2: { submode: 'video' } }
      }),
      'jobA',
      {}
    )
    expect(fps).toBe(24)
    expect(graph['empty_latent'].inputs['width']).toBe(608)
    expect(graph['empty_latent'].inputs['height']).toBe(352)
    expect(graph['empty_latent'].inputs['length']).toBe(121)
    expect(graph['empty_audio'].inputs['frames_number']).toBe(121)
    expect(graph['conditioning'].inputs['frame_rate']).toBe(24)
    expect(graph['noise_1'].inputs['noise_seed']).toBe(42)
    assertRefsResolve(graph)
  })

  it('ltx2 avatar: requires image + audio, wires both', () => {
    const req = baseReq({
      family: 'ltx2',
      mode: 't2v',
      width: 768,
      height: 768,
      frames: 121,
      options: { family: 'ltx2', ltx2: { submode: 'avatar' } }
    })
    expect(() => buildGraph(req, 'jobB', { image: 'face.png' })).toThrow(/音声/)
    const { graph } = buildGraph(req, 'jobB', { image: 'face.png', audio: 'voice.mp3' })
    expect(graph['load_image'].inputs['image']).toBe('face.png')
    expect(graph['load_audio'].inputs['audio']).toBe('voice.mp3')
    // audio conditioning trimmed to the video duration: (121-1)/24 = 5s
    expect(graph['trim_audio'].inputs['duration']).toBe(5)
    assertRefsResolve(graph)
  })

  it('wanfun 5b: control video + ref image + canny preproc inserted', () => {
    const req = baseReq({
      family: 'wanfun',
      mode: 'i2v',
      width: 704,
      height: 704,
      frames: 121,
      options: { family: 'wanfun', wanfun: { size: '5b', controlType: 'canny', lightning: false, steps: 20, cfg: 5 } }
    })
    expect(() => buildGraph(req, 'jobC', { image: 'ref.png' })).toThrow(/制御動画/)
    const { graph, fps } = buildGraph(req, 'jobC', { image: 'ref.png', controlVideo: 'ctrl.mp4' })
    expect(fps).toBe(24)
    expect(graph['load_video'].inputs['file']).toBe('ctrl.mp4')
    expect(graph['load_image'].inputs['image']).toBe('ref.png')
    expect(graph['control_preproc'].class_type).toBe('Canny')
    expect(graph['fun_control'].inputs['control_video']).toEqual(['control_preproc', 0])
    expect(graph['fun_control'].inputs['width']).toBe(704)
    assertRefsResolve(graph)
  })

  it('wanfun: reference image is optional — control video alone works', () => {
    const { graph } = buildGraph(
      baseReq({
        family: 'wanfun',
        mode: 'i2v',
        width: 704,
        height: 704,
        frames: 121,
        options: { family: 'wanfun', wanfun: { size: '5b', controlType: 'depth', lightning: false, steps: 20, cfg: 5 } }
      }),
      'jobE',
      { controlVideo: 'ctrl.mp4' }
    )
    expect(graph['load_image']).toBeUndefined()
    expect(graph['fun_control'].inputs['ref_image']).toBeUndefined()
    expect(graph['control_preproc'].class_type).toBe('DepthAnythingV2Preprocessor')
    // Small variant pinned: the node default (Large/vitl) is CC-BY-NC-4.0
    expect(graph['control_preproc'].inputs['ckpt_name']).toBe('depth_anything_v2_vits.pth')
    assertRefsResolve(graph)
  })

  it('wanfun 14b: pose preproc uses DWPreprocessor, dual-expert samplers', () => {
    const { graph, fps } = buildGraph(
      baseReq({
        family: 'wanfun',
        mode: 'i2v',
        width: 640,
        height: 640,
        frames: 81,
        options: { family: 'wanfun', wanfun: { size: '14b', controlType: 'pose', lightning: false, steps: 20, cfg: 3.5 } }
      }),
      'jobD',
      { image: 'ref.png', controlVideo: 'ctrl.mp4' }
    )
    expect(fps).toBe(16)
    expect(graph['control_preproc'].class_type).toBe('DWPreprocessor')
    // quality mode: the (muted-branch) loras are bypassed, official 20-step run
    expect(graph['lora_high']).toBeUndefined()
    expect(graph['sampler_1'].inputs['steps']).toBe(20)
    expect(graph['sampler_2'].inputs['steps']).toBe(20)
    expect(graph['model_sampling_high'].inputs['model']).toEqual(['unet_high', 0])
    assertRefsResolve(graph)
  })

  it('wanfun 14b lightning: official muted branch — loras, 4 steps split 2, cfg 1, shift 8', () => {
    const { graph } = buildGraph(
      baseReq({
        family: 'wanfun',
        mode: 'i2v',
        width: 640,
        height: 640,
        frames: 81,
        options: { family: 'wanfun', wanfun: { size: '14b', controlType: 'canny', lightning: true, steps: 20, cfg: 3.5 } }
      }),
      'jobD2',
      { controlVideo: 'ctrl.mp4' }
    )
    expect(graph['lora_high']).toBeDefined()
    expect(graph['lora_low']).toBeDefined()
    expect(graph['sampler_1'].inputs['steps']).toBe(4)
    expect(graph['sampler_1'].inputs['cfg']).toBe(1)
    expect(graph['sampler_1'].inputs['end_at_step']).toBe(2)
    expect(graph['sampler_2'].inputs['start_at_step']).toBe(2)
    // the muted branch kept the canvas shift (8) — unlike wan22's shift-5 recipe
    expect(graph['model_sampling_high'].inputs['shift']).toBe(8.0)
    assertRefsResolve(graph)
  })
})
