# Workflow source-verification notes

Movie Creator Studio — ComfyUI API-format workflow templates.
Verified: 2026-07-16 against ComfyUI **master** (v0.28-era) and current official templates/examples.

All files are API format (`POST /prompt` payload bodies): `{ "<node_id>": { "class_type", "inputs", "_meta" } }` with **semantic string node ids** the app injects into (`unet_high`, `lora_low`, `sampler_1`, `positive`, `negative`, `load_image`, `i2v`, `empty_latent`, `noise`, `scheduler`, `cfg_guider`, `decode`, `create_video`, `save_video`, ...). Every file was machine-validated: JSON parse, all `["node", idx]` references resolve, output indices in range, all required inputs (per verified `INPUT_TYPES`) present.

Conventions applied across all files (per app spec):

- Seed-bearing input set to `0` everywhere (`KSampler.seed`, `KSamplerAdvanced.noise_seed`, `RandomNoise.noise_seed`, `CogVideoSampler.seed`) — app overrides at runtime.
- `SaveVideo`: `filename_prefix: "video/mcs"`, `format: "auto"`. Verified inputs = `video, filename_prefix, format, codec`; enum `format`: `["auto","mp4"]`, `codec`: `["auto","h264"]` (from `comfy_api/latest/_util/video_types.py`). Codec is `"auto"` except the HunyuanVideo 1.5 files which use `"h264"` exactly as the official template does.
- Positive prompt text defaults to `""` (app injects). Negative prompts carry the model-appropriate default (see per-file notes).
- `LoadImage.image` placeholder `"input.png"` (app injects the uploaded file name).

## Sources checked

ComfyUI node source (raw.githubusercontent.com/comfyanonymous/ComfyUI/master/):

- `nodes.py` — UNETLoader, CLIPLoader, DualCLIPLoader, VAELoader, CLIPTextEncode, KSampler, KSamplerAdvanced, LoraLoaderModelOnly, VAEDecode, VAEDecodeTiled, LoadImage, CLIPVisionLoader, CLIPVisionEncode, ImageScale
- `comfy_extras/nodes_model_advanced.py` — ModelSamplingSD3
- `comfy_extras/nodes_wan.py` — WanImageToVideo, Wan22ImageToVideoLatent
- `comfy_extras/nodes_hunyuan.py` — EmptyHunyuanLatentVideo, EmptyHunyuanVideo15Latent, HunyuanVideo15ImageToVideo, HunyuanVideo15SuperResolution, LatentUpscaleModelLoader, HunyuanVideo15LatentUpscaleWithModel (all HV 1.5 classes live in this file; no separate hv15 file exists)
- `comfy_extras/nodes_cosmos.py` — CosmosPredict2ImageToVideoLatent
- `comfy_extras/nodes_video.py` — CreateVideo, SaveVideo
- `comfy_extras/nodes_custom_sampler.py` — RandomNoise, DisableNoise, KSamplerSelect, BasicScheduler, CFGGuider, SamplerCustomAdvanced, SplitSigmas
- `comfy_extras/nodes_sd3.py` — EmptySD3LatentImage
- `comfy_api/latest/_util/video_types.py` — VideoContainer/VideoCodec enums for SaveVideo

Official templates (raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/):

- `video_wan2_2_14B_t2v.json`, `video_wan2_2_14B_i2v.json`, `video_wan2_2_5B_ti2v.json`
- `video_hunyuan_video_1.5_720p_t2v.json`, `video_hunyuan_video_1.5_720p_i2v.json`

Examples:

- github.com/comfyanonymous/ComfyUI_examples/tree/master/cosmos_predict2 — `README.md`, `cosmos_predict2_2b_i2v_example.json` (full UI JSON), `cosmos_predict2_2b_t2i_example.png` (embedded **API-format** `prompt` + UI `workflow` extracted from PNG tEXt chunks)
- github.com/kijai/ComfyUI-CogVideoXWrapper — `nodes.py`, `model_loading.py` (NODE_CLASS_MAPPINGS), `example_workflows/cogvideox_1_0_5b_I2V_02.json`, `example_workflows/cogvideox_1_5_5b_I2V_01.json`
- HuggingFace API trees: `Comfy-Org/HunyuanVideo_1.5_repackaged` (all hv15 filenames verified to exist, incl. `hunyuanvideo1.5_480p_i2v_step_distilled_fp8_scaled.safetensors` and `hunyuanvideo15_latent_upsampler_1080p.safetensors`), `aidealab/AnimeGen-I2V`, `aidealab/AnimeGen-T2V`

## Verified INPUT_TYPES signatures (non-core nodes; input names, required unless "opt")

- `WanImageToVideo`: positive, negative, vae, width, height, length, batch_size, clip_vision_output (opt), start_image (opt) → outputs (positive, negative, latent)
- `Wan22ImageToVideoLatent`: vae, width, height, length, batch_size, start_image (opt) → (latent)
- `EmptyHunyuanLatentVideo` / `EmptyHunyuanVideo15Latent`: width, height, length, batch_size
- `HunyuanVideo15ImageToVideo`: positive, negative, vae, width, height, length, batch_size, start_image (opt), clip_vision_output (opt) → (positive, negative, latent)
- `HunyuanVideo15SuperResolution`: positive, negative, vae (opt), start_image (opt), clip_vision_output (opt), latent, noise_augmentation (default 0.70) → (positive, negative, latent)
- `LatentUpscaleModelLoader`: model_name (folder `latent_upscale_models`)
- `HunyuanVideo15LatentUpscaleWithModel`: model, samples, upscale_method (`nearest-exact|bilinear|area|bicubic|bislerp`), width, height, crop (`disabled|center`)
- `CosmosPredict2ImageToVideoLatent`: vae, width (def 848), height (def 480), length (def 93, step 4), batch_size, start_image (opt), end_image (opt)
- `CreateVideo`: images, fps (FLOAT), audio (opt), bit_depth (opt, def 8)
- `SaveVideo`: video, filename_prefix (def "video/ComfyUI"), format (`auto|mp4`), codec (`auto|h264`)
- `RandomNoise`: noise_seed · `DisableNoise`: (no inputs) · `KSamplerSelect`: sampler_name · `BasicScheduler`: model, scheduler, steps, denoise · `CFGGuider`: model, positive, negative, cfg · `SamplerCustomAdvanced`: noise, guider, sampler, sigmas, latent_image → (output, denoised_output) · `SplitSigmas`: sigmas, step → (high_sigmas, low_sigmas)
- `ModelSamplingSD3`: model, shift
- Kijai wrapper (exact `class_type` strings from NODE_CLASS_MAPPINGS):
  - `CogVideoXModelLoader`: model (diffusion_models folder), base_precision (`fp16|fp32|bf16`), quantization (`disabled|fp8_e4m3fn|...`), load_device (`main_device|offload_device`), enable_sequential_cpu_offload (BOOL); opt: block_edit, lora, compile_args, attention_mode (def `sdpa`) → (COGVIDEOMODEL)
  - `CogVideoXVAELoader`: model_name (vae folder); opt: precision (`fp16|fp32|bf16`, def bf16), compile_args → (VAE)
  - `CogVideoTextEncode`: clip, prompt; opt: strength (def 1.0), force_offload (def true) → (conditioning, clip)
  - `CogVideoImageEncode`: vae, start_image; opt: end_image, enable_tiling (def false), noise_aug_strength (def 0.0), strength, start_percent, end_percent → (samples)
  - `CogVideoSampler`: model, positive, negative, num_frames (def 49), steps (def 50), cfg (def 6.0), seed, scheduler (`CogVideoXDDIM` verified exact, default); opt: samples, image_cond_latents, denoise_strength (def 1.0), context_options, controlnet, tora_trajectory, fastercache, feta_args, teacache_args → (samples)
  - `CogVideoDecode`: vae, samples, enable_vae_tiling (def true), tile_sample_min_height (240), tile_sample_min_width (360), tile_overlap_factor_height (0.2), tile_overlap_factor_width (0.2), auto_tile_size (def true) → (images)
- Enum literals double-checked: `KSamplerAdvanced.add_noise` = `enable|disable`, `return_with_leftover_noise` = `disable|enable`; `UNETLoader.weight_dtype` = `default|fp8_e4m3fn|fp8_e4m3fn_fast|fp8_e5m2`; `CLIPLoader.type` includes `wan`, `cosmos`, `sd3` (and a new `cogvideox` type — see cogvideox notes); `DualCLIPLoader.type` includes `hunyuan_video_15`.

---

## Per-file notes

### 1. wan22_t2v_14b.json

- Classes: UNETLoader ×2, LoraLoaderModelOnly ×2, ModelSamplingSD3 ×2, CLIPLoader, CLIPTextEncode ×2, EmptyHunyuanLatentVideo, KSamplerAdvanced ×2, VAELoader, VAEDecode, CreateVideo, SaveVideo.
- Template `video_wan2_2_14B_t2v.json` is now a **subgraph** with a `PrimitiveBoolean` "Enable Lightning LoRA" driving `ComfySwitchNode`s between two parameter sets: lightning (LoRA path, 4 steps, split 2, cfg 1.0) and base (no LoRA, 20 steps, split 10, cfg 3.5). Transcribed the **lightning path** as file default per app spec; app "quality mode" rewires to the base values at runtime. There are no muted nodes in this template — the switch mechanism replaces muting.
- Verified from template internals: shift 5.0 both experts, LoRA strength 1.0, euler/simple, sampler_1 (high) `add_noise=enable, start 0, end 2, return_with_leftover_noise=enable`; sampler_2 (low) `add_noise=disable, start 2, end 4, return_with_leftover_noise=disable`; VAE `wan_2.1_vae.safetensors`; CreateVideo fps 16.
- Resolution 1280x704x81 per app spec (subgraph's internal latent widget default is 640x640x81, overridden by promoted instance widgets whose values are not recoverable from the template JSON; 81 = floor(5s x 16fps)+1 matches the template's duration math).
- Negative prompt: exact current template t2v string — the standard Wan Chinese negative **plus `，裸露，NSFW`** (the t2v template appends this; the i2v template does not).

### 2. wan22_i2v_14b.json

- Same graph with i2v checkpoints (`wan2.2_i2v_high/low_noise_14B_fp8_scaled.safetensors`) and i2v lightning LoRAs `wan2.2_i2v_lightx2v_4steps_lora_v1_high/low_noise.safetensors` (**v1**, not v1.1 — verified from template).
- `WanImageToVideo` replaces the empty latent; its 3 outputs wired: positive→samplers.positive, negative→samplers.negative, latent→sampler_1.latent_image (verified against template links; template does NOT use clip_vision for Wan2.2 i2v).
- Negative prompt: template i2v string (no `裸露，NSFW` suffix). Resolution 1280x704x81 chosen for consistency (app injects real values from the input image); template default not recoverable (promoted subgraph widgets).

### 3. wan22_ti2v_5b_t2v.json / 4. wan22_ti2v_5b_i2v.json

- Transcribed 1:1 from `video_wan2_2_5B_ti2v.json` (flat template, no subgraph): UNETLoader `wan2.2_ti2v_5B_fp16.safetensors` (weight_dtype default), ModelSamplingSD3 shift 8.0, CLIPLoader umt5/wan, VAELoader `wan2.2_vae.safetensors`, `Wan22ImageToVideoLatent` 1280x704x121, KSampler seed/20 steps/cfg 5.0/uni_pc/simple/denoise 1.0, VAEDecode, CreateVideo fps 24, SaveVideo.
- Muted-node handling: the template's `LoadImage` is **BYPASSED (mode 4)** by default → t2v variant omits it entirely (latent node id `empty_latent`, no `start_image`); i2v variant re-enables it (latent node id `i2v` with `start_image`). This exactly reproduces the template's two modes.

### 5. animegen_i2v.json / 6. animegen_t2v.json

- Graph shape identical to files 2 / 1 respectively (AIdeaLab AnimeGen is Wan2.2-A14B architecture). Differences per app spec: `animegen_{i2v,t2v}_{high,low}_noise_bf16.safetensors` with `weight_dtype: "fp8_e4m3fn"`, ModelSamplingSD3 shift **3.0**, negative prompt `"3d, cg, photo, stop, wait"`, i2v resolution 832x480x81, fps 16, same Wan2.2 lightning LoRAs (i2v v1 pair / t2v v1.1 pair).
- Verification status: HF repos `aidealab/AnimeGen-I2V` and `aidealab/AnimeGen-T2V` exist and each contains `high_noise.safetensors` / `low_noise.safetensors`. The `animegen_*_bf16.safetensors` filenames in these workflows are the app's local naming convention (files renamed on download) — **not verifiable upstream** (no Comfy-Org repackage found). No official ComfyUI template exists for AnimeGen; wiring reuses the verified Wan2.2 graphs.
- LOW CONFIDENCE: animegen_t2v resolution (spec gave none; used 832x480x81 to match the i2v spec).

### 7. hv15_t2v_720p.json

- Classes: UNETLoader (`hunyuanvideo1.5_720p_t2v_fp16.safetensors`), DualCLIPLoader (`qwen_2.5_vl_7b_fp8_scaled.safetensors` + `byt5_small_glyphxl_fp16.safetensors`, type `hunyuan_video_15` — this loader/type verified from both the template and `nodes.py`), CLIPTextEncode ×2, EmptyHunyuanVideo15Latent 1280x720x121, ModelSamplingSD3 shift **7.0** (verified), BasicScheduler simple/20/denoise 1.0, KSamplerSelect euler, RandomNoise, CFGGuider cfg **6.0** (real CFG), SamplerCustomAdvanced, VAELoader `hunyuanvideo15_vae_fp16.safetensors`, VAEDecodeTiled, CreateVideo fps 24, SaveVideo (codec h264 per template).
- The template uses the **custom-sampling stack** (RandomNoise + CFGGuider + KSamplerSelect + BasicScheduler + SamplerCustomAdvanced), not KSampler — transcribed exactly.
- Faithful wiring quirk preserved: **`BasicScheduler.model` comes from the raw UNET, not from ModelSamplingSD3** (in the template both hang off a bypassed EasyCache wrapping the UNETLoader); only `CFGGuider.model` gets the shift-7-patched model.
- Muted/bypassed handling: `EasyCache` nodes are bypassed in the template → omitted (bypass = pass-through). The whole 1080p SR group is bypassed → omitted here (it is file 9). Template's negative prompt default is the **empty string** — kept.
- Deviation (intentional, per app spec): template's active decode is plain `VAEDecode` (a `VAEDecodeTiled` alternative sits bypassed); these files use **VAEDecodeTiled** with tile_size 512 / overlap 64 / temporal_size 64 / temporal_overlap 8 (the t2v template's bypassed tiled node's values; the i2v template's tiled nodes carry temporal_overlap 4096 which was normalized to the INPUT_TYPES default 8).

### 8. hv15_i2v_720p.json

- i2v variant per template: UNETLoader `hunyuanvideo1.5_720p_i2v_fp16.safetensors`; adds LoadImage → CLIPVisionLoader `sigclip_vision_patch14_384.safetensors` + CLIPVisionEncode (crop `center`) → `HunyuanVideo15ImageToVideo` (1280x720x121, start_image + clip_vision_output). CFGGuider takes positive/negative from the i2v node's outputs 0/1; sampler latent from output 2. Everything else identical to file 7.

### 9. hv15_i2v_720p_sr.json

- File 8 plus the template's bypassed SR group, transcribed node-for-node from `video_hunyuan_video_1.5_720p_i2v.json` (mode-4 group):
  - `LatentUpscaleModelLoader` `hunyuanvideo15_latent_upsampler_1080p.safetensors` → `HunyuanVideo15LatentUpscaleWithModel` (bilinear, 1920x1080, crop disabled) on stage-1 sampler output.
  - SR UNET `hunyuanvideo1.5_1080p_sr_distilled_fp16.safetensors`; `HunyuanVideo15SuperResolution` (positive/negative from the **raw text encodes**, vae, start_image, clip_vision_output, noise_augmentation 0.7).
  - ModelSamplingSD3 shift **2.0**; BasicScheduler simple/**8** steps; `SplitSigmas` at step **4**; two SamplerCustomAdvanced: phase 1 (RandomNoise, CFGGuider cfg 1.0 on shift-2 model with SR-conditioned pos/neg, high_sigmas) → phase 2 (`DisableNoise`, CFGGuider cfg 1.0, low_sigmas).
  - Faithful template quirks preserved: phase-2 guider uses the **raw SR UNET (no shift patch)** and the **original text conditioning** (not the SR node outputs); `BasicScheduler(SR).model` also from raw SR UNET.
- Deviations: template (with SR enabled) still saves the intermediate 720p video through a second SaveVideo — dropped here (single output path; the 720p-only flow is file 8). Final decode is VAEDecodeTiled (see file 7 note; the template's SR video branch uses plain VAEDecode with a dangling tiled alternative).

### 10. hv15_i2v_480p_distilled.json

- Same active graph as file 8 with: UNET `hunyuanvideo1.5_480p_i2v_step_distilled_fp8_scaled.safetensors` (verified to exist in Comfy-Org/HunyuanVideo_1.5_repackaged; step-distilled exists only at 480p), 848x480x121 (848x480 is the node-default 480p bucket), BasicScheduler steps **8**, CFGGuider cfg **1.0**, shift 7.0.
- LOW CONFIDENCE: no official template exists for the step-distilled variant; steps/cfg/shift are per app spec (cfg 1.0 skips the uncond pass in ComfyUI, appropriate for a step-distilled model). Shift 7 mirrors the 720p template default.

### 11. cogvideox_i2v_5b.json

- Exact `class_type` strings from wrapper NODE_CLASS_MAPPINGS: `CogVideoXModelLoader`, `CogVideoXVAELoader`, `CogVideoTextEncode`, `CogVideoImageEncode`, `CogVideoSampler`, `CogVideoDecode` (plus core CLIPLoader/LoadImage/ImageScale/CreateVideo/SaveVideo).
- Loader decision: **both** fetched examples (`cogvideox_1_0_5b_I2V_02.json`, `cogvideox_1_5_5b_I2V_01.json`) use `DownloadAndLoadCogVideoModel` ("THUDM/CogVideoX-5b-I2V", bf16, quantization disabled, sdpa, main_device) — no example uses the local loaders. Per app requirement (offline single-file), this workflow uses `CogVideoXModelLoader` (`CogVideoX_1_0_5b_I2V_bf16.safetensors`, bf16/disabled/main_device/no cpu-offload/sdpa — mirroring the example's loader settings) + `CogVideoXVAELoader` (`cogvideox_vae_bf16.safetensors`, bf16). Verified in `model_loading.py` that CogVideoXModelLoader returns `model_name = <filename>`, so CogVideoSampler's `"I2V" in model_name` check passes with this filename, enabling `image_cond_latents`. Fallback if needed: swap `model_loader` for `DownloadAndLoadCogVideoModel` with `model: "THUDM/CogVideoX-5b-I2V"`.
- Wiring transcribed from `cogvideox_1_0_5b_I2V_02.json`: CLIPLoader type **`sd3`** (as in the example; note current core CLIPLoader also offers a newer `cogvideox` type with 226-token padding — not used, because the wrapper's CogVideoTextEncode configures 226-token padding itself and the example uses sd3); positive CogVideoTextEncode (strength 1.0, force_offload **false**) → negative CogVideoTextEncode chained off positive's CLIP output (force_offload **true**) — exact example pattern; negative text is the example's default ("The video is not of a high quality, ... Strange motion trajectory. ", trailing space preserved); CogVideoImageEncode enable_tiling false, noise_aug_strength 0.0; CogVideoSampler num_frames 49, steps 25, cfg 6.0, scheduler `CogVideoXDDIM`, denoise_strength 1.0, image_cond_latents; CogVideoDecode enable_vae_tiling true + example tiling params.
- Deviations from example (per app spec, to avoid extra custom-node deps): `ImageResizeKJ` (KJNodes) replaced by core `ImageScale` (lanczos, 720x480, crop disabled — the KJ node was 720x480 lanczos too); `VHS_VideoCombine` (VideoHelperSuite, frame_rate 8) replaced by CreateVideo fps 8.0 + SaveVideo. CLIP filename per app convention `t5xxl_fp8_e4m3fn_scaled.safetensors` (example used `t5\google_t5-v1_1-xxl_encoderonly-fp8_e4m3fn.safetensors`).
- LOW CONFIDENCE (minor): local-loader path is source-verified but not example-verified (no official example workflow exercises CogVideoXModelLoader).

### 12. cosmos_p2_t2v.json

- T2I stage verified against the **API-format prompt embedded in `cosmos_predict2_2b_t2i_example.png`**: UNETLoader `cosmos_predict2_2B_t2i.safetensors`, CLIPLoader `oldt5_xxl_fp8_e4m3fn_scaled.safetensors` type **`cosmos`** (verified), EmptySD3LatentImage 1024x1024, KSampler 30 steps / cfg 4.0 / euler / simple / denoise 1.0, VAELoader `wan_2.1_vae.safetensors`, VAEDecode.
- Video stage verified against `cosmos_predict2_2b_i2v_example.json`: video2world **does use plain KSampler** (30/4.0/euler/simple), same CLIPLoader type `cosmos` and same wan_2.1 VAE → **t2i and video2world share text-conditioning type and VAE**, so chaining in one graph is sound: one CLIP + one positive/negative pair feed both KSamplers; one VAELoader feeds t2i decode, the CosmosPredict2ImageToVideoLatent encoder, and the final decode. `decode_t2i` IMAGE output → `i2v.start_image`.
- Chaining concerns (flagged, not blocking): (a) the same prompt text conditions both stages — acceptable since the app injects one scene prompt; (b) the 1024x1024 t2i frame is bilinear-center-cropped to the 16:9 video size inside `CosmosPredict2ImageToVideoLatent` (its `vae_encode_with_padding` uses `common_upscale(..., "bilinear", "center")`), so top/bottom of the square image are cropped. If the app prefers no crop, inject t2i width/height 1280x720 into `empty_latent`.
- Video latent: length 93 (node default, step 4), 1280x**720**. LOW CONFIDENCE on 720 vs 704: node defaults are 848x480 (the 480p example); the README only says "for the 720p models you will have to set the resolution to 720p or your results might be bad". 1280x720 is NVIDIA's actual 720p bucket and satisfies the node's step-16/VAE-stride-8 constraints; 1280x704 (the Cosmos-1 default) also works if outputs look degraded.
- Negative prompt: `"low quality"` placeholder per app spec (app injects NVIDIA's long negative at runtime; the official example ships an empty negative).
- Deviation from example: example outputs via SaveAnimatedWEBP (active) / SaveWEBM (bypassed); replaced with CreateVideo fps 16.0 + SaveVideo per app spec.

### 13. cosmos_p2_i2v.json

- Single-stage: LoadImage → `CosmosPredict2ImageToVideoLatent.start_image` (1280x720x93 — same 720p caveat as file 12), UNET `cosmos_predict2_2B_video2world_720p_16fps.safetensors`, KSampler 30/4.0/euler/simple, VAEDecode, CreateVideo fps 16, SaveVideo. Wiring identical to the official 480p i2v example except model file, resolution, and the video-save tail (same deviations as file 12).

---

## Summary of muted/bypassed template nodes and how they were handled

| Template | Muted/bypassed (mode 2/4) | Handling |
|---|---|---|
| video_wan2_2_5B_ti2v | LoadImage (bypass) | omitted in `wan22_ti2v_5b_t2v`, enabled in `wan22_ti2v_5b_i2v` |
| video_wan2_2_14B_t2v / i2v | none (uses boolean+switch subgraph instead) | lightning branch transcribed; base branch (20 steps / cfg 3.5 / split 10 / no LoRA) documented for app quality mode |
| video_hunyuan_video_1.5_720p_t2v / i2v | EasyCache ×2 (bypass) | omitted (pass-through) |
| | VAEDecodeTiled alternatives (bypass) | adopted as the decode per app spec (values 512/64/64/8) |
| | entire 1080p SR group (bypass): LatentUpscaleModelLoader, HunyuanVideo15LatentUpscaleWithModel, UNETLoader(SR), HunyuanVideo15SuperResolution, ModelSamplingSD3(2.0), BasicScheduler(8), SplitSigmas(4), RandomNoise, DisableNoise, KSamplerSelect, CFGGuider ×2 (cfg 1.0), SamplerCustomAdvanced ×2, VAEDecode/VAEDecodeTiled, CreateVideo, SaveVideo | transcribed into `hv15_i2v_720p_sr.json`; intermediate 720p save dropped |
| cosmos i2v example | SaveWEBM (bypass) | not carried over; CreateVideo+SaveVideo used |

---

# Workflow conversion notes — LTX-2.3 + Wan2.2 Fun Control

New API-format templates converted from the on-disk ComfyUI v0.28 UI templates at
`...\comfyui_workflow_templates_json\templates\`. API format =
`{ "<semantic_id>": { "class_type", "inputs", "_meta":{title} } }`, refs as `["<id>", outIdx]`.

Verified against ComfyUI source on disk (`ComfyUI\nodes.py`, `ComfyUI\comfy_extras\*.py`) — engine was NOT
running, so every INPUT_TYPES / io.Schema was read from source. Each output file was machine-validated:
JSON parse, every `["id",idx]` reference resolves to an existing node, every referenced output index is
in range for that class, exactly one `SaveVideo`, no dead (unconsumed) nodes. Load-bearing widget values
(sigmas, filenames, negative prompt, strengths, tile params) were cross-checked verbatim against the source
templates. All model filenames were confirmed to EXIST on HuggingFace (see per-file tables).

App conventions applied (per existing NOTES.md): semantic string ids the app injects into
(`positive`, `negative`, `load_image`, `load_video`, `empty_latent`, `noise_1`, `sampler_1`, `save_video`, …);
seed inputs = `0`; positive prompt text = `""`; `LoadImage.image` = `"input.png"`; `LoadVideo.file` = `"control.mp4"`;
`LoadAudio.audio` = `"input.mp3"`; `SaveVideo` = `filename_prefix "video/mcs", format "auto", codec "auto"`.

---

## Source-template structure & the two hard problems (LTX)

The three `video_ltx2_3_*` templates are **subgraph** UI graphs (one `definitions.subgraphs` each). The active
graph = a top-level `LoadImage`/`LoadAudio`/`SaveVideo` plus a subgraph instance whose 13 widget-proxy inputs
are all `link:null` (driven by internal primitive nodes) and whose only externally-wired inputs are the image
(i2v/ia2v) and audio (ia2v). Flattening = inline the internal nodes, resolve `-10` (input boundary) feeds to the
internal primitives' own widget values, wire the `-20` (output boundary) producer to `SaveVideo`.

Two internal node classes have **nonstandard API serialization** that cannot be confirmed without a running
`/object_info` or an API reference (none exists for them):

- `ComfyMathExpression` (nodes_math.py) — `io.Autogrow` inputs (`values.a`, `values.b`, …). Used only to compute
  derived dimensions (width/2, height/2, duration*fps+1, fps passthrough) from primitive `PrimitiveInt` nodes.
- `ResizeImageMaskNode` (nodes_post_processing.py) — `io.DynamicCombo` (`resize_type` selects sub-widgets). Used
  only to scale the input image to WxH before preprocessing.

**Decision (documented deviation):** these were resolved to concrete values / replaced rather than emitted with a
guessed serialization, because a wrong key breaks the whole `/prompt`. The app injects final width/height/length/
fps anyway (as it does for every other workflow). Consequently the following **active** (mode 0) template nodes
were intentionally dropped and their effect folded into hardcoded inputs:

- Gemma prompt-enhancement branch: `PrimitiveStringMultiline`(prompt), `LoraLoader`(gemma-abliterated),
  `TextGenerateLTX2Prompt`, `ComfySwitchNode`, `PreviewAny`, `PrimitiveBoolean`(enable enhance). The positive
  `CLIPTextEncode.text` is `""` and the app injects the final prompt (it does its own JA→EN + enhancement). This
  also avoids running a 12B LLM generation per render.
- Dimension machinery: `PrimitiveInt`(Width/Height/Duration/FrameRate), `PrimitiveFloat`(Duration),
  `ComfyMathExpression`×(3–4) → resolved into literal inputs on the consumer nodes.
- `ResizeImageMaskNode` → dropped; the input image is fed `LoadImage → ResizeImagesByLongerEdge(1536) →
  LTXVPreprocess(18) → LTXVImgToVideoInplace`. `LTXVImgToVideoInplace` resizes the image to the exact latent
  dimensions internally (`comfy.utils.common_upscale(..., "bilinear","center")`, verified in nodes_lt.py:161),
  so the explicit scale-to-WxH node is not needed for correctness.
- `PrimitiveBoolean`("Switch to Text to Video?") — its value selects i2v vs t2v via the `bypass` flag of the two
  `LTXVImgToVideoInplace` nodes. Realised structurally instead: **t2v** omits the whole image path (bypass=true ⇒
  passthrough, verified nodes_lt.py:149) and wires latents directly; **i2v/ia2v** keep the image path with
  `bypass=false`.

The **core generation pipeline is transcribed faithfully**: dual-loader stack, distilled-LoRA model, dual-stage
LTX sampling (base → ×2 latent upsample → refine), integrated A/V latent (concat/separate + audio VAE), tiled
decode, CreateVideo. No template nodes are muted (mode 2/4) in any LTX template.

### LTX two-stage sampler (all three files)

| stage | node id | sigmas (`ManualSigmas`) | guider conditioning | noise | latent in |
|---|---|---|---|---|---|
| base  | `sampler_1` | `1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0` (9→8 steps) | `conditioning` direct | `noise_1`=0 | concat(base video, audio) |
| refine| `sampler_2` | `0.85, 0.7250, 0.4219, 0.0` (4→3 steps) | `crop_guides` (crop to latent) | `noise_2`=0 | concat(×2-upsampled video, base audio) |

Both `SamplerCustomAdvanced`; `KSamplerSelect`=`euler`; `CFGGuider.cfg`=`1` (guidance disabled — distilled model);
`LoraLoaderModelOnly` distilled strength `0.5`; `LTXVLatentUpsampler` uses `ltx-2.3-spatial-upscaler-x2-1.1`;
video VAE = the checkpoint's VAE (slot 2); audio VAE = `LTXVAudioVAELoader`.
`EmptyLTXVLatentVideo` is the **base** latent = **target resolution / 2** (upsampled ×2 before refine).

---

## 1. ltx2_t2v.json  (text→video+audio, 30 nodes)

class_types: `CheckpointLoaderSimple`, `LTXAVTextEncoderLoader`, `LTXVAudioVAELoader`,
`LatentUpscaleModelLoader`, `LoraLoaderModelOnly`, `CLIPTextEncode`×2, `LTXVConditioning`,
`EmptyLTXVLatentVideo`, `LTXVEmptyLatentAudio`, `LTXVConcatAVLatent`×2, `RandomNoise`×2, `CFGGuider`×2,
`KSamplerSelect`×2, `ManualSigmas`×2, `SamplerCustomAdvanced`×2, `LTXVSeparateAVLatent`×2, `LTXVCropGuides`,
`LTXVLatentUpsampler`, `VAEDecodeTiled`, `LTXVAudioVAEDecode`, `CreateVideo`, `SaveVideo`.

- `empty_latent` 640×360×126 (target 1280×720, len = 5s×25fps+1); `empty_audio` frames 126 / rate 25;
  `conditioning.frame_rate` 25.0; `create_video.fps` 25.0; `VAEDecodeTiled` 768/64/4096/4.
- negative text = `"pc game, console game, video game, cartoon, childish, ugly"` (template default).

## 2. ltx2_i2v.json  (image→video+audio, 35 nodes)

= file 1 + `LoadImage`, `ResizeImagesByLongerEdge`, `LTXVPreprocess`, `LTXVImgToVideoInplace`×2.
Image: `load_image → resize_image(longer_edge 1536) → preprocess(img_compression 18) →`
`imgtovideo_1(strength 0.7, into base latent)` and `imgtovideo_2(strength 1.0, into ×2 latent)`, `bypass=false`.
Same dims/steps as file 1 (640×360×126, fps 25).

## 3. ltx2_ia2v.json  (image + audio → talking video, 39 nodes)

= file 2 with the input-audio path replacing `LTXVEmptyLatentAudio`:
`LoadAudio → TrimAudioDuration(start_index 0, duration 9) → LTXVAudioVAEEncode → SetLatentNoiseMask(mask from
SolidMask value 0, 1280×720) → base concat.audio_latent`. `empty_latent` 640×360×**217** (9s×24fps+1);
`conditioning.frame_rate` 24.0; `create_video.fps` 24.0. Extra class_types vs file 2: `LoadAudio`,
`TrimAudioDuration`, `LTXVAudioVAEEncode`, `SolidMask`, `SetLatentNoiseMask` (and no `LTXVEmptyLatentAudio`).

### LTX model files (identical set, all three files) — all verified on HuggingFace

| filename | loader node (id) | folder | HF repo (verified) |
|---|---|---|---|
| ltx-2.3-22b-dev-fp8.safetensors | `ckpt` CheckpointLoaderSimple; also `text_encoder` (ckpt_name) & `audio_vae` | checkpoints | Lightricks/LTX-2.3-fp8 ✓ |
| gemma_3_12B_it_fp4_mixed.safetensors | `text_encoder` LTXAVTextEncoderLoader (text_encoder) | text_encoders | Comfy-Org/ltx-2 › split_files/text_encoders ✓ |
| ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors | `lora` LoraLoaderModelOnly | loras | Comfy-Org/ltx-2.3 › split_files/loras ✓ |
| ltx-2.3-spatial-upscaler-x2-1.1.safetensors | `upscale_model` LatentUpscaleModelLoader | latent_upscale_models | Lightricks/LTX-2.3 ✓ |

(The template also ships a `gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors` for the prompt-enhancer —
NOT referenced here because that branch was dropped.)

---

## 4. wanfun_5b_control.json  (Wan2.2-Fun-Control 5B, 14 nodes)

Flat template (no subgraph). class_types: `UNETLoader`, `ModelSamplingSD3`, `CLIPLoader`, `CLIPTextEncode`×2,
`LoadImage`, `LoadVideo`, `GetVideoComponents`, `Wan22FunControlToVideo`, `KSampler`, `VAELoader`, `VAEDecode`,
`CreateVideo`, `SaveVideo`.

- `ModelSamplingSD3.shift` 8.0; `Wan22FunControlToVideo` 704×704×121 batch 1; `KSampler` seed 0 / steps 20 /
  cfg 5.0 / uni_pc / simple / denoise 1.0; `CreateVideo.fps` 24.0.
- Single expert (5B). Negative = standard Wan zh negative (no NSFW suffix).

| filename | loader (id) | HF repo |
|---|---|---|
| wan2.2_fun_control_5B_bf16.safetensors | `unet` UNETLoader | Comfy-Org/Wan_2.2_ComfyUI_Repackaged › split_files/diffusion_models |
| umt5_xxl_fp8_e4m3fn_scaled.safetensors | `clip` CLIPLoader (type `wan`) | Comfy-Org/Wan_2.1_ComfyUI_repackaged › split_files/text_encoders |
| wan2.2_vae.safetensors | `vae` VAELoader | Comfy-Org/Wan_2.2_ComfyUI_Repackaged › split_files/vae |

## 5. wanfun_14b_control.json  (Wan2.2-Fun-Control 14B, 17 nodes)

Flat template with TWO parallel workflows: the **"Default workflow"** (mode 0, dual-expert, no LoRA) and a
**"…+ 4 steps LoRA" lightning branch that is entirely MUTED (mode 4)**. Per the exclude-muted rule the default
branch is transcribed; the lightning branch is omitted. class_types: `UNETLoader`×2, `ModelSamplingSD3`×2,
`CLIPLoader`, `CLIPTextEncode`×2, `LoadImage`, `LoadVideo`, `GetVideoComponents`, `Wan22FunControlToVideo`,
`KSamplerAdvanced`×2, `VAELoader`, `VAEDecode`, `CreateVideo`, `SaveVideo`.

- Dual-expert: `ModelSamplingSD3.shift` 8.0 (×2); `Wan22FunControlToVideo` 640×640×81 batch 1; `CreateVideo.fps` 16.0.
- `sampler_1` (high) KSamplerAdvanced: add_noise `enable`, seed 0, steps 20, cfg 3.5, euler, simple,
  start_at_step 0, end_at_step 10, return_with_leftover_noise `enable`.
- `sampler_2` (low)  KSamplerAdvanced: add_noise `disable`, seed 0, steps 20, cfg 3.5, euler, simple,
  start_at_step 10, end_at_step 10000, return_with_leftover_noise `disable`; latent_image ← `sampler_1`.
- Negative = standard Wan zh negative.

| filename | loader (id) | HF repo |
|---|---|---|
| wan2.2_fun_control_high_noise_14B_fp8_scaled.safetensors | `unet_high` UNETLoader | Comfy-Org/Wan_2.2_ComfyUI_Repackaged › split_files/diffusion_models |
| wan2.2_fun_control_low_noise_14B_fp8_scaled.safetensors | `unet_low` UNETLoader | Comfy-Org/Wan_2.2_ComfyUI_Repackaged › split_files/diffusion_models |
| umt5_xxl_fp8_e4m3fn_scaled.safetensors | `clip` CLIPLoader (type `wan`) | Comfy-Org/Wan_2.1_ComfyUI_repackaged › split_files/text_encoders |
| wan_2.1_vae.safetensors | `vae` VAELoader | Comfy-Org/Wan_2.2_ComfyUI_Repackaged › split_files/vae |

(Muted lightning branch — omitted — used the same graph plus `LoraLoaderModelOnly`×2 with
`wan2.2_i2v_lightx2v_4steps_lora_v1_high/low_noise.safetensors`, 4 steps, split at 2, cfg 1.0. Available if the
app wants a "fast" mode.)

---

## Wan Fun Control — control-video preprocessing (REQUIRED reading for the app)

Both Wan Fun Control templates drive the control signal the SAME way, and **neither performs preprocessing in the
default active graph**:

```
LoadVideo (a PRE-MADE control video)  →  GetVideoComponents (extract IMAGE frames)  →  Wan22FunControlToVideo.control_video
```

- A core `Canny` node sits between `GetVideoComponents` and `control_video` in both templates but is
  **BYPASSED (mode 4)** by default, i.e. a pass-through — so the frames from `GetVideoComponents` reach
  `control_video` unchanged. `PreviewImage` (also mode 4) is omitted. My files therefore wire
  `get_video → fun_control.control_video` directly (Canny omitted).
- **The templates expect a control video that is ALREADY the control modality** (canny/depth/pose/trajectory
  frames). The 14B template's on-canvas note says the user "may need … `comfyui_controlnet_aux` … and
  `ComfyUI-DepthAnythingV2` to preprocess the control video" — those are **external custom nodes NOT present in
  the graph**; alternatively use the pre-made control video Comfy ships.
- `ref_image` (the start / reference frame) is fed by `LoadImage → Wan22FunControlToVideo.ref_image`.

**Implication for the app:** supply a pre-made control-frame video to `load_video`. If deriving control from a raw
video, the app must run preprocessing itself before feeding — e.g. insert a core `Canny` node
(`low_threshold 0.1, high_threshold 0.6` per template) between `get_video` and `fun_control`, or use an external
depth/pose extractor (`comfyui_controlnet_aux`, `ComfyUI-DepthAnythingV2`) which are NOT installed by these files.
`Wan22FunControlToVideo` signature (nodes_wan.py): `positive, negative, vae, width, height, length, batch_size,
ref_image(opt), control_video(opt)` → `positive, negative, latent`; it VAE-encodes both `ref_image` and
`control_video` internally (center-crop upscale to WxH).

---

## ID-LoRA investigation (2026-07-22) — deferred

`Comfy-Org/ltx-2.3` also hosts `ltx-2.3-id-lora-talkvid-3k.safetensors` /
`-celebvhq-3k` (identity-preserving avatar LoRAs). Investigated for the avatar
mode and **deliberately not wired**: per the upstream card
(AviadDahan/LTX-2.3-ID-LoRA-TalkVid-3K), ID-LoRA requires its own inference
pipeline (`audio_ref_only_ic` strategy, negative temporal positions, reference
audio as the voice-identity source, `[VISUAL]/[SPEECH]/[SOUNDS]` prompt format,
two-stage 512→1024 scripts from github.com/ID-LoRA/ID-LoRA). There is no
official ComfyUI workflow, and chaining it through LoraLoaderModelOnly would
apply the weights without the conditioning scheme they were trained for.
Revisit if/when ComfyUI ships native ID-LoRA nodes.

## LOW / MEDIUM confidence & caveats

1. **LTX deviations (see top section)** — dropping the active prompt-enhance + dimension-math + DynamicCombo nodes
   is a deliberate design choice for app-fit and runtime safety, NOT a pure transcription. Core generation
   pipeline is faithful.
2. **LTX base latent = target/2.** Hardcoded 640×360 (=1280×720 /2). 360 is not a multiple of the LTX VAE spatial
   stride (32); ComfyUI floors internally (→352) — no error, but the app should inject clean values. `length`
   126 / 217 (= duration*fps+1) is not 8n+1 either; preserved from the template's own math.
3. **ia2v audio conditioning** (`SolidMask` value 0 → `SetLatentNoiseMask` on the encoded input audio, with
   image-space mask dims) is transcribed verbatim from the template but its exact semantics could not be
   runtime-verified — MEDIUM confidence.
4. **No execution test** — the ComfyUI engine was not running; validation is structural (parse + reference/slot
   integrity) + verbatim source cross-check + HF filename existence. Not an end-to-end render.
5. All referenced model filenames were confirmed present on HuggingFace (LTX via the HF tree API; Wan via the
   templates' own embedded `models[].url` download metadata, same repos the app already uses).
