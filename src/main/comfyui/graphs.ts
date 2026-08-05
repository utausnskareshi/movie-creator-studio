import { readFileSync } from 'fs'
import { join } from 'path'
import type { GenerationRequest } from '@shared/types'
import type { WorkflowGraph } from './client'

// ---------------------------------------------------------------------------
// Loads the API-format workflow templates from resources/workflows and patches
// them (by semantic node id) with the user's generation parameters.
// The directory is injected at startup (keeps this module electron-free and
// unit-testable).
// ---------------------------------------------------------------------------

let templatesDir = ''

export function setWorkflowsDir(dir: string): void {
  templatesDir = dir
}

export function loadTemplate(name: string): WorkflowGraph {
  if (!templatesDir) throw new Error('workflows dir not initialized')
  const raw = readFileSync(join(templatesDir, `${name}.json`), 'utf-8')
  return JSON.parse(raw) as WorkflowGraph
}

function setInput(graph: WorkflowGraph, nodeId: string, key: string, value: unknown): void {
  const node = graph[nodeId]
  if (!node) throw new Error(`workflow template missing node "${nodeId}"`)
  node.inputs[key] = value
}

function trySetInput(graph: WorkflowGraph, nodeId: string, key: string, value: unknown): boolean {
  const node = graph[nodeId]
  if (!node || !(key in node.inputs)) return false
  node.inputs[key] = value
  return true
}

function hasNode(graph: WorkflowGraph, nodeId: string): boolean {
  return nodeId in graph
}

function removeNode(graph: WorkflowGraph, nodeId: string): void {
  delete graph[nodeId]
}

/** Rewire every input in the graph that references `fromId` to reference `toId`. */
function rewireRefs(graph: WorkflowGraph, fromId: string, toId: string): void {
  for (const node of Object.values(graph)) {
    for (const [k, v] of Object.entries(node.inputs)) {
      if (Array.isArray(v) && v.length === 2 && v[0] === fromId) {
        node.inputs[k] = [toId, v[1]]
      }
    }
  }
}

/** Bypass a LoraLoaderModelOnly-style node: repoint consumers to its model source. */
function bypassModelNode(graph: WorkflowGraph, nodeId: string): void {
  const node = graph[nodeId]
  if (!node) return
  const src = node.inputs['model']
  if (!Array.isArray(src)) return
  rewireRefs(graph, nodeId, src[0] as string)
  removeNode(graph, nodeId)
}

function setSeed(graph: WorkflowGraph, seed: number): void {
  for (const id of ['sampler_1', 'sampler_2', 'noise', 'noise_sr', 'noise_1', 'noise_2']) {
    trySetInput(graph, id, 'noise_seed', seed)
    trySetInput(graph, id, 'seed', seed)
  }
}

function setPrompts(graph: WorkflowGraph, prompt: string, negative: string): void {
  // core CLIPTextEncode uses "text"; CogVideoTextEncode uses "prompt"
  if (!trySetInput(graph, 'positive', 'text', prompt)) trySetInput(graph, 'positive', 'prompt', prompt)
  if (!trySetInput(graph, 'negative', 'text', negative)) trySetInput(graph, 'negative', 'prompt', negative)
}

function setFilenamePrefix(graph: WorkflowGraph, jobId: string): void {
  for (const id of ['save_video', 'save_video_sr']) {
    trySetInput(graph, id, 'filename_prefix', `mcs/${jobId}`)
  }
}

export interface BuiltWorkflow {
  graph: WorkflowGraph
  /** effective output fps (library metadata) */
  fps: number
}

/**
 * Build the final API graph for a generation request.
 * `imageRef` is the engine-side filename returned by /upload/image (i2v only).
 */
export interface InputRefs {
  image?: string | null
  audio?: string | null
  controlVideo?: string | null
  /** MiniMax H3 FL2VA: uploaded last-keyframe filename (optional) */
  lastFrame?: string | null
  /** MiniMax H3 Ref2VA: uploaded reference media, in user order */
  refImages?: string[]
  refVideos?: string[]
  refAudios?: string[]
}

/** MiniMax H3 frame grid: valid lengths are 17k+5 (nodes_minimax_h3.py). */
export function alignMinimaxFrames(n: number): number {
  let v = Math.max(5, Math.round(n))
  while (v % 17 !== 5) v++
  return v
}

/**
 * Wire Ref2VA reference media as LoadImage / LoadVideo+GetVideoComponents /
 * LoadAudio nodes feeding the node's V3 Autogrow inputs. In API format an
 * autogrow slot is addressed as "<group>.<template><index>" with a ZERO-based
 * index — e.g. ref_images.ref_image_0 — because the executor's
 * build_nested_inputs() splits each input name on "." and regroups the values
 * into the dict parameters (ref_images / ref_videos / ref_audios) that
 * MiniMaxH3ReferenceToVideo.execute() expects; a flat name like ref_image_1
 * passes /prompt validation but reaches execute() as an unexpected kwarg
 * (TypeError). Verified against the official video_minimax_h3_r2v template.
 * Reference order is fixed by the node: images, then videos, then standalone
 * audio — the PROMPT refers to them 1-based as <Picture i>/<Video k>/<Audio j>.
 * Uploaded ref videos are pre-transcoded to soundless 24fps mp4, so the
 * paired ref_video_audios.* inputs are deliberately not used (lip-sync audio
 * goes through standalone <Audio j> refs instead).
 */
function wireMinimaxRefs(graph: WorkflowGraph, refs: InputRefs): void {
  const cond = graph['cond']
  if (!cond) throw new Error('workflow template missing node "cond"')
  ;(refs.refImages ?? []).forEach((name, i) => {
    const id = `ref_img_${i + 1}`
    graph[id] = {
      class_type: 'LoadImage',
      inputs: { image: name },
      _meta: { title: `Reference Image ${i + 1} (<Picture ${i + 1}>)` }
    }
    cond.inputs[`ref_images.ref_image_${i}`] = [id, 0]
  })
  ;(refs.refVideos ?? []).forEach((name, i) => {
    const loadId = `ref_vid_load_${i + 1}`
    const compId = `ref_vid_comp_${i + 1}`
    graph[loadId] = {
      class_type: 'LoadVideo',
      inputs: { file: name },
      _meta: { title: `Reference Video ${i + 1} (<Video ${i + 1}>)` }
    }
    graph[compId] = {
      class_type: 'GetVideoComponents',
      inputs: { video: [loadId, 0] },
      _meta: { title: `Video ${i + 1} frames` }
    }
    cond.inputs[`ref_videos.ref_video_${i}`] = [compId, 0]
  })
  ;(refs.refAudios ?? []).forEach((name, i) => {
    const id = `ref_aud_${i + 1}`
    graph[id] = {
      class_type: 'LoadAudio',
      inputs: { audio: name },
      _meta: { title: `Reference Audio ${i + 1} (<Audio ${i + 1}>)` }
    }
    cond.inputs[`ref_audios.ref_audio_${i}`] = [id, 0]
  })
}

export function buildGraph(
  req: GenerationRequest,
  jobId: string,
  refs: InputRefs | string | null
): BuiltWorkflow {
  // back-compat: a bare string/null is treated as the image ref
  const inputs: InputRefs = typeof refs === 'string' || refs === null ? { image: refs } : refs
  const imageRef = inputs.image ?? null
  const o = req.options
  let graph: WorkflowGraph
  let fps: number

  switch (o.family) {
    case 'wan22': {
      const w = o.wan22
      if (w.size === '5b') {
        graph = loadTemplate(req.mode === 'i2v' ? 'wan22_ti2v_5b_i2v' : 'wan22_ti2v_5b_t2v')
        fps = 24
        setLatentDims(graph, req)
        setSampler(graph, 'sampler_1', { steps: w.steps, cfg: w.cfg })
      } else {
        graph = loadTemplate(req.mode === 'i2v' ? 'wan22_i2v_14b' : 'wan22_t2v_14b')
        fps = 16
        setLatentDims(graph, req)
        applyDualExpert(graph, w.lightning, w.steps, w.cfg)
      }
      break
    }
    case 'animegen': {
      const a = o.animegen
      graph = loadTemplate(req.mode === 'i2v' ? 'animegen_i2v' : 'animegen_t2v')
      fps = 16
      setLatentDims(graph, req)
      // AIdeaLab official recipe: T2V lightning runs 8 steps (I2V: 4)
      applyDualExpert(graph, a.lightning, a.steps, a.cfg, req.mode === 't2v' ? 8 : 4)
      break
    }
    case 'hunyuan15': {
      const h = o.hunyuan15
      if (h.variant === '480p_distilled') {
        // I2V-only checkpoint: building it for a T2V request produced a graph
        // with an unset LoadImage that ComfyUI always rejects, surfaced as an
        // untranslated engine error. Fail here with something actionable.
        if (req.mode !== 'i2v') {
          throw new Error(
            '480p 高速プレビュー(蒸留版)は画像から (I2V) 専用です。品質モードを 720p 標準にするか、入力画像を選んでください'
          )
        }
        graph = loadTemplate('hv15_i2v_480p_distilled')
      } else if (req.mode === 'i2v') {
        graph = loadTemplate(h.superResolution ? 'hv15_i2v_720p_sr' : 'hv15_i2v_720p')
      } else {
        // SR works for T2V too: start_image/clip_vision_output are optional
        // on HunyuanVideo15SuperResolution (verified in v0.28.0 source)
        graph = loadTemplate(h.superResolution ? 'hv15_t2v_720p_sr' : 'hv15_t2v_720p')
      }
      fps = 24
      setLatentDims(graph, req)
      // The SR templates carry their own dimensions on `latent_upscale`,
      // transcribed from the official 1280x720 -> 1920x1080 example. Left
      // untouched they pinned EVERY super-resolved render to 1920x1080, so a
      // portrait (720x1280) request came back as stretched landscape.
      if (hasNode(graph, 'latent_upscale')) {
        // 1.5x, rounded to a multiple of 8 — every shipped preset scales
        // exactly, so the standard 1280x720 still lands on the official
        // 1920x1080 while 720x1280 now yields 1080x1920 instead of a
        // stretched landscape frame
        const up = (n: number): number => Math.round((n * 1.5) / 8) * 8
        trySetInput(graph, 'latent_upscale', 'width', up(req.width))
        trySetInput(graph, 'latent_upscale', 'height', up(req.height))
      }
      if (h.variant !== '480p_distilled') {
        trySetInput(graph, 'cfg_guider', 'cfg', h.cfg)
        trySetInput(graph, 'scheduler', 'steps', h.steps)
      }
      break
    }
    case 'cogvideox': {
      const c = o.cogvideox
      graph = loadTemplate('cogvideox_i2v_5b')
      fps = 8
      trySetInput(graph, 'sampler_1', 'steps', c.steps)
      trySetInput(graph, 'sampler_1', 'cfg', c.cfg)
      trySetInput(graph, 'sampler_1', 'num_frames', req.frames)
      trySetInput(graph, 'i2v', 'noise_aug_strength', c.noiseAugStrength)
      // aspect handling for the model's fixed 720x480 frame: 'pad' inputs are
      // pre-padded app-side (already 720x480), 'crop' center-crops in-workflow,
      // 'stretch' is the legacy distorting resize
      trySetInput(graph, 'resize', 'crop', c.aspectMode === 'crop' ? 'center' : 'disabled')
      if (c.endImageLock) {
        // pin the input image as the final frame too (identity lock)
        setInput(graph, 'i2v', 'end_image', ['resize', 0])
      }
      if (c.lowVramOffload) {
        // wrapper streams weights from RAM — fits ~12GB GPUs at a speed cost
        trySetInput(graph, 'model_loader', 'enable_sequential_cpu_offload', true)
      }
      break
    }
    case 'cosmos': {
      const c = o.cosmos
      graph = loadTemplate(req.mode === 'i2v' ? 'cosmos_p2_i2v' : 'cosmos_p2_t2v')
      fps = 16
      setLatentDims(graph, req)
      for (const id of ['sampler_1', 'sampler_2']) {
        trySetInput(graph, id, 'steps', c.steps)
        trySetInput(graph, id, 'cfg', c.cfg)
      }
      break
    }
    case 'ltx2': {
      const l = o.ltx2
      graph = loadTemplate(
        l.submode === 'avatar' ? 'ltx2_ia2v' : req.mode === 'i2v' ? 'ltx2_i2v' : 'ltx2_t2v'
      )
      fps = 24
      // base latent is spatial half of the target (upsampled x2 in stage 2);
      // length is full. keep dims clean multiples of 32 (see familyMeta presets)
      setInput(graph, 'empty_latent', 'width', Math.round(req.width / 2))
      setInput(graph, 'empty_latent', 'height', Math.round(req.height / 2))
      setInput(graph, 'empty_latent', 'length', req.frames)
      trySetInput(graph, 'empty_audio', 'frames_number', req.frames)
      trySetInput(graph, 'empty_audio', 'frame_rate', fps)
      trySetInput(graph, 'conditioning', 'frame_rate', fps)
      trySetInput(graph, 'solid_mask', 'width', req.width)
      trySetInput(graph, 'solid_mask', 'height', req.height)
      trySetInput(graph, 'create_video', 'fps', fps)
      // avatar (IA2V): the conditioning audio must cover exactly the video
      // duration — keep the trim in sync with the requested frame count
      trySetInput(graph, 'trim_audio', 'duration', Math.max(1, Math.round(((req.frames - 1) / fps) * 100) / 100))
      break
    }
    case 'minimaxh3': {
      const m = o.minimaxh3
      fps = 24
      // BasicGuider chain (guidance-embedded pruned checkpoints): no CFG and
      // no negative prompt — the prompt lives on the conditioning node itself
      if (m.variant === 'ref2va') {
        graph = loadTemplate('minimax_h3_r2v')
        setInput(graph, 'cond', 'ref_image_size', m.refImageSize)
      } else {
        graph = loadTemplate(req.mode === 'i2v' ? 'minimax_h3_i2v' : 'minimax_h3_t2v')
      }
      setInput(graph, 'cond', 'width', req.width)
      setInput(graph, 'cond', 'height', req.height)
      setInput(graph, 'cond', 'length', alignMinimaxFrames(req.frames))
      trySetInput(graph, 'scheduler', 'steps', m.steps)
      break
    }
    case 'wanfun': {
      const w = o.wanfun
      graph = loadTemplate(w.size === '5b' ? 'wanfun_5b_control' : 'wanfun_14b_control')
      fps = w.size === '5b' ? 24 : 16
      setInput(graph, 'fun_control', 'width', req.width)
      setInput(graph, 'fun_control', 'height', req.height)
      setInput(graph, 'fun_control', 'length', req.frames)
      insertControlPreproc(graph, w.controlType)
      if (w.size === '5b') {
        setSampler(graph, 'sampler_1', { steps: w.steps, cfg: w.cfg })
      } else {
        // A14B mirrors the official template branches: active = 20-step
        // quality (loras bypassed), muted = lightx2v 4-step (shift stays 8
        // as in the muted branch, unlike wan22's shift-5 recipe)
        applyDualExpert(graph, w.lightning, w.steps, w.cfg)
      }
      break
    }
  }

  let promptText = req.prompt
  if (o.family === 'animegen' && o.animegen.animePrefix && !/japanese anime style/i.test(promptText)) {
    promptText = `Japanese anime style, ${promptText}`
  }
  setPrompts(graph, promptText, req.negative)
  setSeed(graph, req.seed)
  setFilenamePrefix(graph, jobId)
  // MiniMax H3 has no CLIPTextEncode nodes — the prompt is an input of the
  // conditioning node (and there is no negative path at all)
  if (o.family === 'minimaxh3') setInput(graph, 'cond', 'prompt', promptText)

  // wire input media by what the chosen template actually needs.
  // wanfun's reference image is OPTIONAL (Wan22FunControlToVideo.ref_image is
  // an optional input) — the control video alone can drive the generation.
  // minimaxh3 ref2va runs as a t2v-mode flow (references are its own inputs).
  const requiresImage =
    (req.mode === 'i2v' && o.family !== 'wanfun' &&
      !(o.family === 'minimaxh3' && o.minimaxh3.variant === 'ref2va')) ||
    (o.family === 'ltx2' && o.ltx2.submode === 'avatar')
  if (requiresImage) {
    if (!imageRef) throw new Error('この生成には入力画像が必要です')
    setInput(graph, 'load_image', 'image', imageRef)
  } else if (o.family === 'wanfun') {
    if (imageRef) {
      setInput(graph, 'load_image', 'image', imageRef)
    } else {
      delete graph['load_image']
      delete graph['fun_control'].inputs['ref_image']
    }
  }
  if (o.family === 'ltx2' && o.ltx2.submode === 'avatar') {
    if (!inputs.audio) throw new Error('アバター生成には音声ファイルが必要です')
    setInput(graph, 'load_audio', 'audio', inputs.audio)
  }
  if (o.family === 'wanfun') {
    if (!inputs.controlVideo) throw new Error('Fun Control には制御動画が必要です')
    setInput(graph, 'load_video', 'file', inputs.controlVideo)
  }
  if (o.family === 'minimaxh3') {
    if (o.minimaxh3.variant === 'fl2va') {
      // optional LAST keyframe (i2v template ships with the node wired in)
      if (req.mode === 'i2v' && inputs.lastFrame) {
        setInput(graph, 'load_image_last', 'image', inputs.lastFrame)
      } else if (hasNode(graph, 'load_image_last')) {
        removeNode(graph, 'load_image_last')
        delete graph['cond'].inputs['last_frame']
      }
    } else {
      wireMinimaxRefs(graph, inputs)
    }
  }

  return { graph, fps }
}

/**
 * Insert the control-signal preprocessor between the loaded control-video frames
 * (get_video) and Wan22FunControlToVideo.control_video. canny uses ComfyUI's
 * built-in node (no dependency); pose/depth use comfyui_controlnet_aux.
 */
function insertControlPreproc(graph: WorkflowGraph, type: 'canny' | 'pose' | 'depth'): void {
  const src: [string, number] = ['get_video', 0]
  if (type === 'canny') {
    graph['control_preproc'] = {
      class_type: 'Canny',
      inputs: { image: src, low_threshold: 0.1, high_threshold: 0.6 },
      _meta: { title: 'Canny (線画化)' }
    }
  } else if (type === 'pose') {
    // only `image` is required (verified via object_info); optional inputs
    // (detectors, resolution) use controlnet_aux defaults + auto-download
    graph['control_preproc'] = {
      class_type: 'DWPreprocessor',
      inputs: { image: src },
      _meta: { title: 'DWPose (ポーズ抽出)' }
    }
  } else {
    graph['control_preproc'] = {
      class_type: 'DepthAnythingV2Preprocessor',
      // the node DEFAULT is the Large (vitl) checkpoint, which is
      // CC-BY-NC-4.0 — pin the Apache-2.0 Small variant so depth-controlled
      // videos stay commercially usable like the rest of the Fun pack
      inputs: { image: src, ckpt_name: 'depth_anything_v2_vits.pth' },
      _meta: { title: 'DepthAnythingV2 Small (深度抽出)' }
    }
  }
  setInput(graph, 'fun_control', 'control_video', ['control_preproc', 0])
}

function setLatentDims(graph: WorkflowGraph, req: GenerationRequest): void {
  for (const id of ['empty_latent', 'i2v', 'latent']) {
    trySetInput(graph, id, 'width', req.width)
    trySetInput(graph, id, 'height', req.height)
    trySetInput(graph, id, 'length', req.frames)
    trySetInput(graph, id, 'batch_size', 1)
  }
}

/**
 * Wan2.2/AnimeGen dual-expert sampler config.
 * lightning: `lightningSteps` total (Wan2.2: 4 per lightx2v; AnimeGen T2V: 8
 * per AIdeaLab's official recipe), cfg 1.0, switch at the midpoint — LoRA
 * nodes stay. quality: LoRA nodes bypassed, N steps, cfg per request.
 */
function applyDualExpert(
  graph: WorkflowGraph,
  lightning: boolean,
  steps: number,
  cfg: number,
  lightningSteps = 4
): void {
  const total = lightning ? lightningSteps : steps
  const mid = Math.round(total / 2)
  const effCfg = lightning ? 1.0 : cfg
  if (!lightning) {
    bypassModelNode(graph, 'lora_high')
    bypassModelNode(graph, 'lora_low')
    // the templates bake shift=5 (the lightning recipe value, per lightx2v /
    // AIdeaLab); base-model quality runs follow the official Wan2.2 workflows
    // which pair 20 steps / cfg 3.5 with shift 8.0
    trySetInput(graph, 'model_sampling_high', 'shift', 8.0)
    trySetInput(graph, 'model_sampling_low', 'shift', 8.0)
  }
  setInput(graph, 'sampler_1', 'steps', total)
  setInput(graph, 'sampler_1', 'cfg', effCfg)
  setInput(graph, 'sampler_1', 'start_at_step', 0)
  setInput(graph, 'sampler_1', 'end_at_step', mid)
  setInput(graph, 'sampler_2', 'steps', total)
  setInput(graph, 'sampler_2', 'cfg', effCfg)
  setInput(graph, 'sampler_2', 'start_at_step', mid)
  setInput(graph, 'sampler_2', 'end_at_step', 10000)
}

function setSampler(graph: WorkflowGraph, nodeId: string, p: { steps: number; cfg: number }): void {
  trySetInput(graph, nodeId, 'steps', p.steps)
  trySetInput(graph, nodeId, 'cfg', p.cfg)
}
