import type { ModelFileSpec, ModelPack } from '@shared/types'

// ---------------------------------------------------------------------------
// Model catalog. File sizes are informational (progress totals); downloads
// verify against HuggingFace LFS metadata at runtime.
// All repos below are public and require no authentication.
// ---------------------------------------------------------------------------

const GB = 1024 * 1024 * 1024
const MB = 1024 * 1024

// --- shared files -----------------------------------------------------------

const UMT5: ModelFileSpec = {
  id: 'umt5_xxl_fp8',
  repo: 'Comfy-Org/Wan_2.1_ComfyUI_repackaged',
  path: 'split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  dest: 'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  bytes: 6.74 * GB
}

const WAN21_VAE: ModelFileSpec = {
  id: 'wan_2.1_vae',
  repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
  path: 'split_files/vae/wan_2.1_vae.safetensors',
  dest: 'vae/wan_2.1_vae.safetensors',
  bytes: 254 * MB
}

const WAN22_VAE: ModelFileSpec = {
  id: 'wan2.2_vae',
  repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
  path: 'split_files/vae/wan2.2_vae.safetensors',
  dest: 'vae/wan2.2_vae.safetensors',
  bytes: 1.41 * GB
}

const I2V_LORA_HIGH: ModelFileSpec = {
  id: 'wan22_i2v_lightx2v_high',
  repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
  path: 'split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors',
  dest: 'loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors',
  bytes: 1.23 * GB
}

const I2V_LORA_LOW: ModelFileSpec = {
  id: 'wan22_i2v_lightx2v_low',
  repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
  path: 'split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors',
  dest: 'loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors',
  bytes: 1.23 * GB
}

// AnimeGen's OFFICIAL T2V lightning pair (AIdeaLab reference code uses the
// 250928 release, applied at strength high=2.0 / low=1.0 with 8 steps)
const ANIMEGEN_T2V_LORA_HIGH: ModelFileSpec = {
  id: 'animegen_t2v_lora_250928_high',
  repo: 'lightx2v/Wan2.2-Lightning',
  path: 'Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors',
  dest: 'loras/wan2.2_t2v_lightning_250928_high_noise.safetensors',
  bytes: 2.45 * GB
}

const ANIMEGEN_T2V_LORA_LOW: ModelFileSpec = {
  id: 'animegen_t2v_lora_250928_low',
  repo: 'lightx2v/Wan2.2-Lightning',
  path: 'Wan2.2-T2V-A14B-4steps-lora-250928/low_noise_model.safetensors',
  dest: 'loras/wan2.2_t2v_lightning_250928_low_noise.safetensors',
  bytes: 1.23 * GB
}

const T2V_LORA_HIGH: ModelFileSpec = {
  id: 'wan22_t2v_lightx2v_high',
  repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
  path: 'split_files/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors',
  dest: 'loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors',
  bytes: 1.23 * GB
}

const T2V_LORA_LOW: ModelFileSpec = {
  id: 'wan22_t2v_lightx2v_low',
  repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
  path: 'split_files/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors',
  dest: 'loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors',
  bytes: 1.23 * GB
}

// --- MiniMax H3 (Comfy-Org repackage; exact byte sizes from the HF file API,
// downloads verify against LFS sha256 at runtime as usual) -------------------
// Official ComfyUI template stack: pruned int8_convrot DiT + nvfp4_awq
// text encoder + fp16 video VAE + fp32 audio VAE.

const MINIMAX_H3_FL2VA: ModelFileSpec = {
  id: 'minimax_h3_fl2va',
  repo: 'Comfy-Org/MiniMax-H3',
  path: 'diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  dest: 'diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  bytes: 20_970_379_616
}

const MINIMAX_H3_REF2VA: ModelFileSpec = {
  id: 'minimax_h3_ref2va',
  repo: 'Comfy-Org/MiniMax-H3',
  path: 'diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors',
  dest: 'diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors',
  bytes: 20_970_379_616
}

const MINIMAX_H3_TE: ModelFileSpec = {
  id: 'minimax_h3_te_nvfp4',
  repo: 'Comfy-Org/MiniMax-H3',
  path: 'text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  dest: 'text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  bytes: 15_687_142_551
}

const MINIMAX_H3_VIDEO_VAE: ModelFileSpec = {
  id: 'minimax_h3_video_vae',
  repo: 'Comfy-Org/MiniMax-H3',
  path: 'vae/minimax_h3_video_vae_fp16.safetensors',
  dest: 'vae/minimax_h3_video_vae_fp16.safetensors',
  bytes: 5_207_808_496
}

const MINIMAX_H3_AUDIO_VAE: ModelFileSpec = {
  id: 'minimax_h3_audio_vae',
  repo: 'Comfy-Org/MiniMax-H3',
  path: 'vae/minimax_h3_audio_vae_fp32.safetensors',
  dest: 'vae/minimax_h3_audio_vae_fp32.safetensors',
  bytes: 605_254_808
}

const MINIMAX_H3_LICENSE: ModelPack['license'] = {
  name: 'MiniMax H3 Community License',
  url: 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE',
  commercialNote:
    '日本国内では商用利用可。年間収益2,000万米ドル超の事業者は MiniMax の事前書面許諾が必要。商用製品のUIには「MiniMax H3」の表示義務があります。',
  warnings: [
    'EU・英国・韓国・米国では使用できません(ライセンスの適用地域外)',
    '生成物を他のAIモデル(競合モデル)の学習・改善に使用することは禁止されています',
    '生成物にはAI生成であることの識別子を付与する義務があります(SNS投稿時はAI生成の開示を)',
    '虚偽情報の生成・なりすまし・軍事利用などの禁止用途が定められています(Acceptable Use Policy)'
  ]
}

// --- packs ------------------------------------------------------------------

export const MODEL_PACKS: ModelPack[] = [
  {
    id: 'animegen',
    family: 'animegen',
    name: 'AnimeGen (AIdeaLab)',
    description:
      'アニメ・2Dイラストをそのまま動かす日本製モデル(2026/7公開)。Wan2.2ベースのアニメ特化ファインチューン。I2V/T2V対応。',
    totalBytes: 124 * GB,
    vramNote: '24GB推奨(bf16ロード+RAMオフロード)。832x480が標準、1280x720は高品質モード。',
    minVramGB: 16,
    recommended: true,
    requiresCustomNodes: [],
    files: [
      {
        id: 'animegen_i2v_high',
        repo: 'aidealab/AnimeGen-I2V',
        path: 'high_noise.safetensors',
        dest: 'diffusion_models/animegen_i2v_high_noise_bf16.safetensors',
        bytes: 28.6 * GB
      },
      {
        id: 'animegen_i2v_low',
        repo: 'aidealab/AnimeGen-I2V',
        path: 'low_noise.safetensors',
        dest: 'diffusion_models/animegen_i2v_low_noise_bf16.safetensors',
        bytes: 28.6 * GB
      },
      {
        id: 'animegen_t2v_high',
        repo: 'aidealab/AnimeGen-T2V',
        path: 'high_noise.safetensors',
        dest: 'diffusion_models/animegen_t2v_high_noise_bf16.safetensors',
        bytes: 28.6 * GB
      },
      {
        id: 'animegen_t2v_low',
        repo: 'aidealab/AnimeGen-T2V',
        path: 'low_noise.safetensors',
        dest: 'diffusion_models/animegen_t2v_low_noise_bf16.safetensors',
        bytes: 28.6 * GB
      },
      UMT5,
      WAN21_VAE,
      I2V_LORA_HIGH,
      I2V_LORA_LOW,
      ANIMEGEN_T2V_LORA_HIGH,
      ANIMEGEN_T2V_LORA_LOW
    ],
    license: {
      name: 'Apache License 2.0',
      url: 'https://huggingface.co/aidealab/AnimeGen-I2V',
      commercialNote: '商用利用可(Apache-2.0)。',
      warnings: ['参照画像への忠実性は開発元が改善中と明記(手指・目のディテールが崩れる場合あり)']
    }
  },
  {
    id: 'wan22_14b',
    family: 'wan22',
    name: 'Wan2.2 A14B (T2V + I2V)',
    description:
      '映画のようなシネマティック映像。照明・構図・色調をプロンプトで直接制御できる美的データ学習済みMoEモデル。',
    totalBytes: 65 * GB,
    vramNote: '24GB推奨(fp8_scaled)。lightning LoRAで4ステップ高速生成対応。',
    minVramGB: 12,
    recommended: true,
    requiresCustomNodes: [],
    files: [
      {
        id: 'wan22_t2v_high',
        repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
        path: 'split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors',
        dest: 'diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors',
        bytes: 14.3 * GB
      },
      {
        id: 'wan22_t2v_low',
        repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
        path: 'split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors',
        dest: 'diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors',
        bytes: 14.3 * GB
      },
      {
        id: 'wan22_i2v_high',
        repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
        path: 'split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors',
        dest: 'diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors',
        bytes: 14.3 * GB
      },
      {
        id: 'wan22_i2v_low',
        repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
        path: 'split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors',
        dest: 'diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors',
        bytes: 14.3 * GB
      },
      UMT5,
      WAN21_VAE,
      T2V_LORA_HIGH,
      T2V_LORA_LOW,
      I2V_LORA_HIGH,
      I2V_LORA_LOW
    ],
    license: {
      name: 'Apache License 2.0',
      url: 'https://github.com/Wan-Video/Wan2.2',
      commercialNote: '商用利用可(Apache-2.0)。',
      warnings: []
    }
  },
  {
    id: 'wan22_5b',
    family: 'wan22',
    name: 'Wan2.2 TI2V-5B(軽量版)',
    description: 'T2V/I2V兼用の軽量モデル。720p/24fps対応、8GB VRAMクラスでも動作。',
    totalBytes: 18 * GB,
    vramNote: '8GB以上で動作。24GBなら720p×121フレームも余裕。',
    minVramGB: 8,
    recommended: false,
    requiresCustomNodes: [],
    files: [
      {
        id: 'wan22_ti2v_5b',
        repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
        path: 'split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors',
        dest: 'diffusion_models/wan2.2_ti2v_5B_fp16.safetensors',
        bytes: 10 * GB
      },
      UMT5,
      WAN22_VAE
    ],
    license: {
      name: 'Apache License 2.0',
      url: 'https://github.com/Wan-Video/Wan2.2',
      commercialNote: '商用利用可(Apache-2.0)。',
      warnings: []
    }
  },
  {
    id: 'hunyuan15',
    family: 'hunyuan15',
    name: 'HunyuanVideo 1.5 (8.3B)',
    description:
      '激しい動き・水/炎/布の物理表現に強いTencentの最新世代。720p生成+1080p超解像、480p蒸留版で高速プレビュー。',
    totalBytes: 56 * GB,
    vramNote: '14GB以上(公式最小値)。24GBで720p快適。',
    minVramGB: 14,
    recommended: true,
    requiresCustomNodes: [],
    files: [
      {
        id: 'hv15_720p_t2v',
        repo: 'Comfy-Org/HunyuanVideo_1.5_repackaged',
        path: 'split_files/diffusion_models/hunyuanvideo1.5_720p_t2v_fp16.safetensors',
        dest: 'diffusion_models/hunyuanvideo1.5_720p_t2v_fp16.safetensors',
        bytes: 16.7 * GB
      },
      {
        id: 'hv15_720p_i2v',
        repo: 'Comfy-Org/HunyuanVideo_1.5_repackaged',
        path: 'split_files/diffusion_models/hunyuanvideo1.5_720p_i2v_fp16.safetensors',
        dest: 'diffusion_models/hunyuanvideo1.5_720p_i2v_fp16.safetensors',
        bytes: 16.7 * GB
      },
      {
        id: 'hv15_480p_i2v_distilled',
        repo: 'Comfy-Org/HunyuanVideo_1.5_repackaged',
        path: 'split_files/diffusion_models/hunyuanvideo1.5_480p_i2v_step_distilled_fp8_scaled.safetensors',
        dest: 'diffusion_models/hunyuanvideo1.5_480p_i2v_step_distilled_fp8_scaled.safetensors',
        bytes: 8.3 * GB
      },
      {
        id: 'hv15_qwen_te',
        repo: 'Comfy-Org/HunyuanVideo_1.5_repackaged',
        path: 'split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors',
        dest: 'text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors',
        bytes: 9.38 * GB
      },
      {
        id: 'hv15_byt5_te',
        repo: 'Comfy-Org/HunyuanVideo_1.5_repackaged',
        path: 'split_files/text_encoders/byt5_small_glyphxl_fp16.safetensors',
        dest: 'text_encoders/byt5_small_glyphxl_fp16.safetensors',
        bytes: 439 * MB
      },
      {
        id: 'hv15_vae',
        repo: 'Comfy-Org/HunyuanVideo_1.5_repackaged',
        path: 'split_files/vae/hunyuanvideo15_vae_fp16.safetensors',
        dest: 'vae/hunyuanvideo15_vae_fp16.safetensors',
        bytes: 2.52 * GB
      },
      {
        id: 'hv15_sigclip',
        repo: 'Comfy-Org/HunyuanVideo_1.5_repackaged',
        path: 'split_files/clip_vision/sigclip_vision_patch14_384.safetensors',
        dest: 'clip_vision/sigclip_vision_patch14_384.safetensors',
        bytes: 857 * MB
      },
      {
        id: 'hv15_sr_1080p',
        repo: 'Comfy-Org/HunyuanVideo_1.5_repackaged',
        path: 'split_files/latent_upscale_models/hunyuanvideo15_latent_upsampler_1080p.safetensors',
        dest: 'latent_upscale_models/hunyuanvideo15_latent_upsampler_1080p.safetensors',
        bytes: 201 * MB
      },
      {
        // the SR stage's diffusion model (fp8_scaled to halve the download vs fp16)
        id: 'hv15_sr_1080p_unet',
        repo: 'Comfy-Org/HunyuanVideo_1.5_repackaged',
        path: 'split_files/diffusion_models/hunyuanvideo1.5_1080p_sr_distilled_fp8_scaled.safetensors',
        dest: 'diffusion_models/hunyuanvideo1.5_1080p_sr_distilled_fp8_scaled.safetensors',
        bytes: 7.76 * GB
      }
    ],
    license: {
      name: 'Tencent Hunyuan Community License',
      url: 'https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5',
      commercialNote:
        '日本国内での商用利用可(月間アクティブユーザー1億超の製品は別途ライセンス要)。',
      warnings: [
        'EU・英国・韓国ではライセンス上利用不可',
        '生成物を他のAIモデルの学習に使用することは禁止',
        'AI生成コンテンツであることの開示が必要'
      ]
    }
  },
  {
    id: 'cogvideox',
    family: 'cogvideox',
    name: 'CogVideoX-5B-I2V',
    description:
      'キャラクター画像を、顔を変えずに動かすことに特化(最初のフレーム=入力画像を完全維持)。Zhipu AI開発。',
    totalBytes: 17 * GB,
    vramNote: '24GBなら量子化不要。VAEデコードはタイル処理で軽量化済み。',
    minVramGB: 12,
    recommended: true,
    requiresCustomNodes: ['cogvideox_wrapper'],
    files: [
      {
        id: 'cogx_5b_i2v',
        repo: 'Kijai/CogVideoX-comfy',
        path: 'CogVideoX_1_0_5b_I2V_bf16.safetensors',
        // CogVideoXModelLoader scans models/diffusion_models (verified in the
        // wrapper's INPUT_TYPES), not models/CogVideo
        dest: 'diffusion_models/CogVideoX_1_0_5b_I2V_bf16.safetensors',
        bytes: 11.3 * GB
      },
      {
        id: 'cogx_vae',
        repo: 'Kijai/CogVideoX-comfy',
        path: 'cogvideox_vae_bf16.safetensors',
        dest: 'vae/cogvideox_vae_bf16.safetensors',
        bytes: 431 * MB
      },
      {
        id: 't5xxl_fp8',
        repo: 'comfyanonymous/flux_text_encoders',
        path: 't5xxl_fp8_e4m3fn_scaled.safetensors',
        dest: 'text_encoders/t5xxl_fp8_e4m3fn_scaled.safetensors',
        bytes: 5.16 * GB
      }
    ],
    license: {
      name: 'CogVideoX License',
      url: 'https://github.com/zai-org/CogVideo/blob/main/MODEL_LICENSE',
      commercialNote:
        '商用利用にはZhipu AIへの無料登録が必要(月間100万アクセスまで)。個人利用は登録不要。',
      warnings: ['商用サービスで月間100万アクセスを超える場合は別途商用ライセンスが必要']
    }
  },
  {
    id: 'cosmos_p2',
    family: 'cosmos',
    name: 'NVIDIA Cosmos Predict2 (2B)',
    description:
      'ドローン空撮・3D的に一貫した背景映像。物理的に正確なワールドシミュレーター。Text2Image+Video2Worldの2段構成。',
    totalBytes: 13 * GB,
    vramNote: '8GBから動作。VRAM 9GB以上なら完全常駐で最速クラス。',
    minVramGB: 8,
    recommended: true,
    requiresCustomNodes: [],
    files: [
      {
        id: 'cosmos_p2_t2i',
        repo: 'Comfy-Org/Cosmos_Predict2_repackaged',
        // this repo keeps files at the repository root (no split_files/)
        path: 'cosmos_predict2_2B_t2i.safetensors',
        dest: 'diffusion_models/cosmos_predict2_2B_t2i.safetensors',
        bytes: 3.91 * GB
      },
      {
        id: 'cosmos_p2_v2w_720p',
        repo: 'Comfy-Org/Cosmos_Predict2_repackaged',
        path: 'cosmos_predict2_2B_video2world_720p_16fps.safetensors',
        dest: 'diffusion_models/cosmos_predict2_2B_video2world_720p_16fps.safetensors',
        bytes: 3.91 * GB
      },
      {
        id: 'oldt5_xxl_fp8',
        repo: 'comfyanonymous/cosmos_1.0_text_encoder_and_VAE_ComfyUI',
        path: 'text_encoders/oldt5_xxl_fp8_e4m3fn_scaled.safetensors',
        dest: 'text_encoders/oldt5_xxl_fp8_e4m3fn_scaled.safetensors',
        bytes: 4.9 * GB
      },
      WAN21_VAE
    ],
    license: {
      name: 'NVIDIA Open Model License',
      url: 'https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/',
      commercialNote: '商用利用可。生成物の権利はユーザーに帰属。',
      warnings: [
        '本アプリは規約に基づき「Built on NVIDIA Cosmos」表記を行います',
        '安全ガードレールの回避・無効化は禁止'
      ]
    }
  },
  {
    id: 'ltx2',
    family: 'ltx2',
    name: 'LTX-2.3 (Lightricks)',
    description:
      '動画と「音声」を1回の生成で完全同期。MV・BGM付き映像・喋るAIアバター(画像+音声)向け。Lightricks製オープンウェイト。',
    totalBytes: 40 * GB,
    vramNote: '24GBで動作(fp8チェックポイントをRAMオフロードで実行。RAM64GB推奨)。音声は本体が同時生成。',
    minVramGB: 24,
    recommended: true,
    requiresCustomNodes: [],
    files: [
      {
        // all-in-one fp8 checkpoint (transformer + video VAE + audio components);
        // the native template feeds it to the checkpoint/text-encoder/audio-vae loaders
        id: 'ltx2_ckpt',
        repo: 'Lightricks/LTX-2.3-fp8',
        path: 'ltx-2.3-22b-dev-fp8.safetensors',
        dest: 'checkpoints/ltx-2.3-22b-dev-fp8.safetensors',
        bytes: 27.2 * GB
      },
      {
        id: 'ltx2_gemma',
        repo: 'Comfy-Org/ltx-2',
        path: 'split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors',
        dest: 'text_encoders/gemma_3_12B_it_fp4_mixed.safetensors',
        bytes: 8.8 * GB
      },
      {
        id: 'ltx2_distilled_lora',
        repo: 'Comfy-Org/ltx-2.3',
        path: 'split_files/loras/ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors',
        dest: 'loras/ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors',
        bytes: 2.6 * GB
      },
      {
        id: 'ltx2_upscaler',
        repo: 'Lightricks/LTX-2.3',
        path: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        dest: 'latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        bytes: 0.93 * GB
      }
    ],
    license: {
      name: 'LTX-2 Community License',
      url: 'https://github.com/Lightricks/LTX-2/blob/main/LICENSE',
      commercialNote: '年商$10M未満は商用可。テキストエンコーダにGoogle Gemma 3(Gemma利用規約)を使用。',
      warnings: [
        '年商$10M以上の事業者は別途商用ライセンスが必要',
        'OSIライセンスではなくソース利用可能ライセンス(再配布制限あり)'
      ]
    }
  },
  {
    id: 'wanfun_5b',
    family: 'wanfun',
    name: 'Wan2.2 Fun Control 5B(軽量)',
    description:
      '線画・ポーズ・深度などで動きを指定するControlNet動画(Alibaba PAI)。制御動画に沿った動きを生成。軽量5B版。',
    totalBytes: 19 * GB,
    vramNote: '8GB以上で動作、24GBで快適。軽量で試行が速い5B版。',
    minVramGB: 8,
    recommended: true,
    requiresCustomNodes: ['controlnet_aux'],
    files: [
      {
        id: 'wanfun_5b_ctrl',
        repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
        path: 'split_files/diffusion_models/wan2.2_fun_control_5B_bf16.safetensors',
        dest: 'diffusion_models/wan2.2_fun_control_5B_bf16.safetensors',
        bytes: 10 * GB
      },
      UMT5,
      WAN22_VAE
    ],
    license: {
      name: 'Apache License 2.0',
      url: 'https://huggingface.co/alibaba-pai/Wan2.2-Fun-5B-Control',
      commercialNote: '商用利用可(Apache-2.0)。',
      warnings: []
    }
  },
  {
    id: 'wanfun_14b',
    family: 'wanfun',
    name: 'Wan2.2 Fun Control A14B(高品質)',
    description:
      '線画・ポーズ・深度でのControlNet動画の高品質版(MoE 2エキスパート)。制御動画に沿った緻密な動き。lightning 4ステップ高速化対応。',
    totalBytes: 38 * GB,
    vramNote: '24GB推奨(fp8_scaled)。高/低ノイズを順次ロード。',
    minVramGB: 12,
    recommended: false,
    requiresCustomNodes: ['controlnet_aux'],
    files: [
      {
        id: 'wanfun_14b_high',
        repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
        path: 'split_files/diffusion_models/wan2.2_fun_control_high_noise_14B_fp8_scaled.safetensors',
        dest: 'diffusion_models/wan2.2_fun_control_high_noise_14B_fp8_scaled.safetensors',
        bytes: 14.3 * GB
      },
      {
        id: 'wanfun_14b_low',
        repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
        path: 'split_files/diffusion_models/wan2.2_fun_control_low_noise_14B_fp8_scaled.safetensors',
        dest: 'diffusion_models/wan2.2_fun_control_low_noise_14B_fp8_scaled.safetensors',
        bytes: 14.3 * GB
      },
      UMT5,
      WAN21_VAE,
      // the official template's muted lightning branch uses the same lightx2v
      // i2v LoRAs as wan22 (deduped by id if that pack is already installed)
      I2V_LORA_HIGH,
      I2V_LORA_LOW
    ],
    license: {
      name: 'Apache License 2.0',
      url: 'https://huggingface.co/alibaba-pai/Wan2.2-Fun-A14B-Control',
      commercialNote: '商用利用可(Apache-2.0)。',
      warnings: []
    }
  },
  {
    id: 'minimaxh3_fl2va',
    family: 'minimaxh3',
    name: 'MiniMax H3(標準 T2V/I2V)',
    description:
      'テキスト/画像から映像と音声(セリフ・効果音・BGM、32kHzステレオ)を同時生成するオムニモーダルモデル(2026/8公開・33B)。最初と最後のフレーム指定に対応。768pクラス・最大約15秒。公式推奨のint8量子化構成。',
    totalBytes: 42_470_585_471,
    vramNote: '24GB推奨(int8 DiT+nvfp4テキストエンコーダ・RAMオフロード併用)。12GBでも動作可(低速)。システムRAM 64GB推奨。',
    minVramGB: 12,
    recommended: false,
    requiresCustomNodes: [],
    files: [
      MINIMAX_H3_FL2VA,
      MINIMAX_H3_TE,
      MINIMAX_H3_VIDEO_VAE,
      MINIMAX_H3_AUDIO_VAE
    ],
    license: MINIMAX_H3_LICENSE
  },
  {
    id: 'minimaxh3_ref2va',
    family: 'minimaxh3',
    name: 'MiniMax H3 リファレンス(R2V)',
    description:
      '参照メディア(画像≤9・動画≤3・音声≤3)で登場人物・動き・声を指定して生成。歌声+人物画像でリップシンク動画も作成可能。プロンプトから <Picture 1> のようにタグで参照。テキストエンコーダ/VAE(約21.5GB)は標準パックと共通のため、両方導入時の追加分は約21GBです。',
    totalBytes: 42_470_585_471,
    vramNote: '24GB推奨。参照トークンは全ステップに乗るため、参照が多いほど遅くなります。',
    minVramGB: 12,
    recommended: false,
    requiresCustomNodes: [],
    files: [
      MINIMAX_H3_REF2VA,
      MINIMAX_H3_TE,
      MINIMAX_H3_VIDEO_VAE,
      MINIMAX_H3_AUDIO_VAE
    ],
    license: MINIMAX_H3_LICENSE
  }
]

// --- custom node packs -------------------------------------------------------

export interface CustomNodeSpec {
  id: string
  name: string
  gitUrl: string
  /** pinned commit for reproducibility */
  commit: string
  hasRequirements: boolean
}

export const CUSTOM_NODES: CustomNodeSpec[] = [
  {
    id: 'cogvideox_wrapper',
    name: 'ComfyUI-CogVideoXWrapper (Kijai)',
    gitUrl: 'https://github.com/kijai/ComfyUI-CogVideoXWrapper',
    // pinned to the exact commit verified on the live engine (upstream HEAD
    // as of 2025-08-07) — supply-chain: a branch ref could change under us
    commit: 'fdb8abd2790b5459ddc7066c31861bb0b62e988b',
    hasRequirements: true
  },
  {
    // pose (DWPose) + depth (DepthAnythingV2) preprocessors for Wan Fun Control;
    // canny uses the built-in Canny node so this is only needed for pose/depth
    id: 'controlnet_aux',
    name: 'comfyui_controlnet_aux (Fannovel16)',
    gitUrl: 'https://github.com/Fannovel16/comfyui_controlnet_aux',
    // pinned to the exact commit verified on the live engine (upstream HEAD
    // as of 2026-04-13)
    commit: 'e8b689a513c3e6b63edc44066560ca5919c0576e',
    hasRequirements: true
  }
]

export interface CustomNodeAsset {
  repo: string
  path: string
  /** destination relative to the custom node's own directory */
  dest: string
  bytes: number
}

/**
 * Model files a custom node would otherwise fetch at first RUN — its runtime
 * downloader is unreliable inside the embedded python ("Cannot send a
 * request, as the client has been closed"), so the app pre-places them.
 * controlnet_aux resolves ckpts/<repo_id>/<filename> and skips its own
 * download when the file already exists.
 */
export const CUSTOM_NODE_ASSETS: Record<string, CustomNodeAsset[]> = {
  controlnet_aux: [
    {
      repo: 'yzd-v/DWPose',
      path: 'yolox_l.onnx',
      dest: 'ckpts/yzd-v/DWPose/yolox_l.onnx',
      bytes: 216746733
    },
    {
      repo: 'hr16/DWPose-TorchScript-BatchSize5',
      path: 'dw-ll_ucoco_384_bs5.torchscript.pt',
      dest: 'ckpts/hr16/DWPose-TorchScript-BatchSize5/dw-ll_ucoco_384_bs5.torchscript.pt',
      bytes: 135059124
    },
    {
      // Small on purpose: the Large (vitl) weights are CC-BY-NC-4.0
      // (non-commercial) while Small is Apache-2.0 — matching the pack's
      // commercial-use promise
      repo: 'depth-anything/Depth-Anything-V2-Small',
      path: 'depth_anything_v2_vits.pth',
      dest: 'ckpts/depth-anything/Depth-Anything-V2-Small/depth_anything_v2_vits.pth',
      bytes: 99218434
    }
  ]
}

/** All unique files across packs (shared files deduplicated by id). */
export function allModelFiles(): ModelFileSpec[] {
  const seen = new Map<string, ModelFileSpec>()
  for (const pack of MODEL_PACKS) {
    for (const f of pack.files) {
      if (!seen.has(f.id)) seen.set(f.id, f)
    }
  }
  return [...seen.values()]
}

export function findFile(id: string): ModelFileSpec | undefined {
  return allModelFiles().find((f) => f.id === id)
}
