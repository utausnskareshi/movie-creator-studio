import type { ModelFamily } from '@shared/types'

export interface Chip {
  ja: string
  en: string
}

export interface ChipCategory {
  title: string
  chips: Chip[]
}

/** 日本語ラベルのチップを選ぶと英語プロンプト断片が合成される */
export const PROMPT_CHIPS: Record<ModelFamily, ChipCategory[]> = {
  wan22: [
    {
      title: 'カメラワーク',
      chips: [
        { ja: 'ドリーイン(前進)', en: 'slow dolly in' },
        { ja: 'ドリーアウト(後退)', en: 'slow dolly out' },
        { ja: '横パン', en: 'smooth pan across the scene' },
        { ja: 'クレーン上昇', en: 'crane shot rising up' },
        { ja: 'トラッキング(追従)', en: 'tracking shot following the subject' },
        { ja: '手持ちカメラ', en: 'handheld camera movement' },
        { ja: 'オービット(回り込み)', en: 'orbital arc shot around the subject' }
      ]
    },
    {
      title: '構図・ショット',
      chips: [
        { ja: 'クローズアップ', en: 'close-up shot' },
        { ja: 'ミディアムショット', en: 'medium shot' },
        { ja: 'ワイド(引き)', en: 'wide establishing shot' },
        { ja: 'ローアングル', en: 'low angle shot' },
        { ja: 'ハイアングル', en: 'high angle shot' },
        { ja: '肩越し', en: 'over-the-shoulder shot' }
      ]
    },
    {
      title: '照明',
      chips: [
        { ja: 'ゴールデンアワー', en: 'golden hour lighting' },
        { ja: 'ボリュームライト', en: 'volumetric light rays' },
        { ja: 'リムライト', en: 'rim lighting' },
        { ja: 'ネオン', en: 'neon rim light, city glow' },
        { ja: '逆光', en: 'dramatic backlighting' },
        { ja: '柔らかい窓光', en: 'soft window light' },
        { ja: 'レンズフレア', en: 'subtle lens flare' }
      ]
    },
    {
      title: 'カラーグレード',
      chips: [
        { ja: 'ティール&オレンジ', en: 'teal and orange color grade' },
        { ja: 'フィルムグレイン', en: '16mm film grain' },
        { ja: 'コダック調', en: 'Kodak Portra film look' },
        { ja: '寒色トーン', en: 'cold desaturated tones' },
        { ja: 'ハイコントラスト', en: 'high contrast cinematic look' },
        { ja: 'ブリーチバイパス', en: 'bleach bypass look' }
      ]
    },
    {
      title: 'レンズ',
      chips: [
        { ja: '浅い被写界深度', en: 'shallow depth of field' },
        { ja: 'アナモルフィック', en: 'anamorphic lens bokeh' },
        { ja: '85mm ポートレート', en: '85mm portrait lens' },
        { ja: '35mm', en: '35mm lens' },
        { ja: 'マクロ', en: 'macro lens detail' }
      ]
    }
  ],
  animegen: [
    {
      title: '動きプリセット',
      chips: [
        { ja: '髪が風に揺れる', en: 'her hair gently swaying in the wind' },
        { ja: 'まばたき', en: 'blinking naturally' },
        { ja: '微笑む', en: 'softly smiling' },
        { ja: '振り向く', en: 'slowly turning to look at the camera' },
        { ja: '歩く', en: 'walking forward' },
        { ja: '手を振る', en: 'waving hand' },
        { ja: '驚く', en: 'surprised expression, eyes widening' },
        { ja: '泣く', en: 'tears welling up, crying' }
      ]
    },
    {
      title: 'カメラ',
      chips: [
        { ja: 'ゆっくりズームイン', en: 'camera slowly zooming in' },
        { ja: 'ゆっくりズームアウト', en: 'camera slowly zooming out' },
        { ja: '固定カメラ', en: 'static camera' },
        { ja: '横パン', en: 'camera panning sideways' }
      ]
    },
    {
      title: '背景・演出',
      chips: [
        { ja: '桜吹雪', en: 'cherry blossom petals falling' },
        { ja: '雪が降る', en: 'snow falling gently' },
        { ja: '木漏れ日', en: 'dappled sunlight through leaves' },
        { ja: '夕焼け', en: 'sunset sky glowing' },
        { ja: 'きらきらエフェクト', en: 'sparkling light particles' },
        { ja: '雨', en: 'rain falling' }
      ]
    }
  ],
  hunyuan15: [
    {
      title: '物理現象',
      chips: [
        { ja: '水しぶき', en: 'water splashing with realistic physics' },
        { ja: '波・水流', en: 'waves and flowing water' },
        { ja: '炎の揺らめき', en: 'flames flickering realistically' },
        { ja: '煙・蒸気', en: 'smoke and steam rising' },
        { ja: '布が風になびく', en: 'fabric fluttering and swaying in the wind' },
        { ja: '髪の物理挙動', en: 'hair moving with realistic physics' },
        { ja: '衝突・破壊', en: 'objects colliding and shattering' },
        { ja: '爆発', en: 'explosion with debris flying' }
      ]
    },
    {
      title: '激しい動き',
      chips: [
        { ja: '走る', en: 'running at full speed' },
        { ja: 'ジャンプ', en: 'leaping through the air' },
        { ja: 'ダンス', en: 'dancing dynamically' },
        { ja: '格闘', en: 'martial arts combat, fast strikes' },
        { ja: 'スポーツ', en: 'athletic motion, dynamic action' },
        { ja: '回転', en: 'spinning rapidly' }
      ]
    },
    {
      title: 'カメラ',
      chips: [
        { ja: 'ドリーイン', en: 'camera dolly in' },
        { ja: 'トラッキング', en: 'fast tracking shot' },
        { ja: 'クレーン', en: 'crane shot' },
        { ja: 'オービット', en: 'orbiting camera' },
        { ja: '手持ち風', en: 'handheld camera shake' }
      ]
    },
    // NOTE: no sentence-connector chips here. Chips are appended to the end of
    // the prompt with ", ", so fragments like "First," / "then" produced
    // "..., First, , then , finally" — the time-order technique is explained
    // in the tips card instead.
  ],
  cogvideox: [
    {
      title: '動きの強さ(顔崩れ防止)',
      chips: [
        { ja: 'そよ風(まばたき・髪揺れ)', en: 'subtle motion: blinking, hair swaying gently, breathing' },
        { ja: 'ふつう(表情・上半身)', en: 'moderate motion: changing expression, upper body moving naturally' },
        { ja: '大きめ(全身)', en: 'dynamic motion: full body movement' }
      ]
    },
    {
      title: '表情・仕草',
      chips: [
        { ja: '微笑む', en: 'smiling warmly' },
        { ja: 'まばたき', en: 'blinking' },
        { ja: 'うなずく', en: 'nodding' },
        { ja: '首をかしげる', en: 'tilting head slightly' },
        { ja: '話す', en: 'talking, lips moving' },
        { ja: '手を振る', en: 'waving hand' }
      ]
    },
    {
      title: 'カメラ(控えめ推奨)',
      chips: [
        { ja: '固定カメラ', en: 'static camera' },
        { ja: 'ゆっくりズームイン', en: 'slow zoom in' },
        { ja: 'ゆっくりパン', en: 'slow pan' }
      ]
    }
  ],
  cosmos: [
    {
      title: '空撮プリセット',
      chips: [
        { ja: 'ドローン前進', en: 'aerial drone shot moving forward steadily over the landscape' },
        { ja: '上昇しながら旋回', en: 'drone ascending while slowly orbiting' },
        { ja: '渓谷フライスルー', en: 'flying through a canyon, camera gliding between cliffs' },
        { ja: '都市上空', en: 'aerial view over a city skyline, camera moving forward' },
        { ja: '海岸線に沿って', en: 'flying along the coastline' },
        { ja: '低空スキミング', en: 'low altitude flight skimming over the surface' }
      ]
    },
    {
      title: 'カメラモーション',
      chips: [
        { ja: 'トラッキングショット', en: 'tracking shot' },
        { ja: '横パン', en: 'panning across the scene' },
        { ja: 'ゆっくり前進', en: 'camera slowly pushing forward' },
        { ja: 'タイムラプス風', en: 'timelapse' },
        { ja: '緩やかな下降', en: 'camera slowly descending' }
      ]
    },
    {
      title: '環境・時間',
      chips: [
        { ja: '朝もや', en: 'morning mist over the terrain' },
        { ja: '夕暮れ', en: 'golden sunset light casting long shadows' },
        { ja: '雲海', en: 'sea of clouds below' },
        { ja: '雪山', en: 'snow-covered mountains' },
        { ja: '熱帯の海', en: 'turquoise tropical ocean' },
        { ja: '砂漠', en: 'vast desert dunes' },
        { ja: '森林', en: 'dense green forest canopy' }
      ]
    },
    {
      // complete phrases only — see the note in the hunyuan15 list
      title: '時間進行(推奨)',
      chips: [
        { ja: '徐々に変化する', en: 'the scene changes gradually over time' },
        { ja: '光が移り変わる', en: 'the light transitions slowly from one state to another' }
      ]
    }
  ],
  ltx2: [
    {
      title: '音声・セリフ',
      chips: [
        { ja: 'セリフを話す', en: 'she speaks warmly to the camera' },
        { ja: '歌う', en: 'singing melodically' },
        { ja: 'アップビートな音楽', en: 'upbeat synth-pop music' },
        { ja: '感動的なピアノ', en: 'emotional piano score' },
        { ja: '環境音(自然)', en: 'ambient nature sounds, birds and wind' },
        { ja: '街の喧騒', en: 'busy city street ambience' },
        { ja: '拍手・歓声', en: 'applause and cheering crowd' }
      ]
    },
    {
      title: 'カメラ・演出',
      chips: [
        { ja: 'ゆっくりズームイン', en: 'slow zoom in' },
        { ja: 'ハンドヘルド', en: 'handheld camera' },
        { ja: 'クローズアップ', en: 'close-up shot' },
        { ja: 'シネマティック照明', en: 'cinematic lighting' },
        { ja: 'ミュージックビデオ調', en: 'music video style, stylish' }
      ]
    },
    {
      title: 'アバター(喋る)',
      chips: [
        { ja: '正面を向いて話す', en: 'a person facing the camera, talking naturally, lips synced' },
        { ja: '笑顔で話す', en: 'smiling while speaking' },
        { ja: 'ニュースキャスター風', en: 'news anchor delivering to camera' }
      ]
    }
  ],
  wanfun: [
    {
      title: '被写体(誰・何が)',
      chips: [
        { ja: '若い女性', en: 'a young woman' },
        { ja: '男性ダンサー', en: 'a male dancer' },
        { ja: 'アニメキャラ', en: 'an anime character' },
        { ja: 'ロボット', en: 'a futuristic robot' },
        { ja: 'ファンタジー戦士', en: 'a fantasy warrior in armor' }
      ]
    },
    {
      title: '衣装・スタイル',
      chips: [
        { ja: 'ストリートファッション', en: 'streetwear outfit' },
        { ja: '着物', en: 'traditional kimono' },
        { ja: 'SFスーツ', en: 'sci-fi bodysuit' },
        { ja: 'アニメ調', en: 'anime illustration style' },
        { ja: '写実的', en: 'photorealistic' }
      ]
    },
    {
      title: '背景・照明',
      chips: [
        { ja: 'スタジオ(白背景)', en: 'clean white studio background' },
        { ja: '都市の夜', en: 'neon-lit city at night' },
        { ja: '自然の中', en: 'lush natural outdoor setting' },
        { ja: 'ステージ照明', en: 'dramatic stage lighting' },
        { ja: 'ソフトな自然光', en: 'soft natural daylight' }
      ]
    }
  ]
}

/** 生成画面のモデル紹介文 */
export const FAMILY_INTRO: Record<ModelFamily, { title: string; desc: string; tips: string[] }> = {
  animegen: {
    title: 'AnimeGen — アニメ・2Dイラストをそのまま動かす',
    desc: 'AIdeaLab社(日本)のアニメ特化モデル。イラストの画風を保ったまま自然に動かします。プロンプト先頭に "Japanese anime style" を自動付与します。',
    tips: [
      'イラストをドラッグ&ドロップして、動きチップを選ぶだけでOK',
      '動きは1〜2種類に絞ると画風が安定します',
      '公式も「参照画像への忠実性は改善中」としています。手指・目の崩れは再生成やシード変更で改善することがあります'
    ]
  },
  wan22: {
    title: 'Wan2.2 — 映画のようなシネマティック映像',
    desc: '照明・構図・色調のラベル付きデータで学習されており、映画用語がそのまま効きます。カメラ・照明・グレードのチップを組み合わせて画作りしてください。',
    tips: [
      '高速モード(lightning 4step)でテンポよく試作→気に入ったらシード固定で高品質モード',
      'プロンプトは「シーン描写→カメラ→被写体の動き→照明・色調」の順で80〜120語が目安',
      '5B軽量モデルはVRAMが少ない環境向け(24fps・720p対応)'
    ]
  },
  hunyuan15: {
    title: 'HunyuanVideo 1.5 — 激しい動きとリアルな物理表現',
    desc: '水・炎・布などの物理挙動と大きなモーションが得意。「被写体+動き+シーン+カメラ+照明」の公式プロンプト構成に沿って書くと安定します。',
    tips: [
      '動きは「まず→次に→最後に」と時系列で分解すると正確に再現されます',
      '480pプレビュー(蒸留版)で構図確認→720p+1080p超解像で本番',
      '物理現象は名前で明示(water splashing / fabric swaying など)'
    ]
  },
  cogvideox: {
    title: 'CogVideoX — キャラ画像を顔を変えずに動かす',
    desc: '最初のフレームに入力画像をそのまま使用するため、1フレーム目は完全に一致します。「顔の安定」と「動きの量」はトレードオフで、動きの強さとプロンプトの具体性で調整します。',
    tips: [
      '動きは「何がどう動くか」を具体的に長めの英文で(公式もLLMでのプロンプト整形を推奨 — ✨変換ボタン活用)',
      '動きが出ないときは「動きの強さ」を標準→動き重視へ。顔の安定優先なら忠実重視へ',
      'プロンプトにキャラの外見(髪色・服装など)を再記述すると崩れにくくなります',
      'イラスト・アニメ調は実写顔より崩れにくい傾向があります'
    ]
  },
  cosmos: {
    title: 'CosmoVideo — 空撮・立体感のある背景映像 (Built on NVIDIA Cosmos)',
    desc: 'NVIDIAの物理AIワールドモデル。3D的に一貫したカメラ移動と物理的に正しい風景が得意です。T2Vは「静止画生成→動画化」の2段構成で実行されます。',
    tips: [
      'プロンプトは長文が有効。地形・光・カメラの動きを具体的に',
      '人物やアニメ調の様式美は苦手 — その用途は Wan2.2 / AnimeGen へ',
      'NVIDIA公式の長文ネガティブプロンプトを自動適用しています'
    ]
  },
  ltx2: {
    title: 'LTX-2.3 — 動画と音声を完全同期',
    desc: 'Lightricks製。映像と音声(セリフ・BGM・環境音)を1回の生成で同時に作ります。MV・BGM付き映像や、画像+音声から喋るアバターを作れます。',
    tips: [
      'プロンプトに「音」も書く: セリフ・音楽ジャンル・環境音を具体的に',
      '喋るアバターは「アバター」モードで画像+音声を指定(口の動きが音声に同期。声質まで似せるID-LoRAはComfyUI公式未対応のため未搭載)',
      '蒸留モデルの高速設定(固定8+3ステップ)で動作。ステップ/CFGの調整は不要',
      '初回はfp8チェックポイント(約29GB)のRAMロードに数分かかります'
    ]
  },
  wanfun: {
    title: 'Wan2.2 Fun Control — 線画・ポーズ・深度で動きを指定',
    desc: 'Alibaba PAI製のControlNet動画。制御動画(元動画)から線画/ポーズ/深度を抽出し、その動きに沿って生成します。思い通りの動きを再現できます。',
    tips: [
      '制御動画をアップロード→制御種別(線画/ポーズ/深度)を選択。動きは制御動画が決めます',
      'プロンプトには「動き」ではなく被写体の見た目・服装・背景・画風を書きます',
      '参照画像(任意)で1フレーム目の見た目を指定できます',
      '線画/ポーズ/深度は制御動画から自動抽出されます(抽出モデルはアプリが導入)'
    ]
  }
}
