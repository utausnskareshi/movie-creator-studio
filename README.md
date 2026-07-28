# Movie Creator Studio

**7つの動画生成AIをローカルPCで — 生成からSNS書き出しまでオールインワンのWindowsデスクトップアプリ**

[English](#english) | 日本語

Movie Creator Studio は、ComfyUI をエンジンとして内蔵し、用途の異なる7種類の動画生成AIモデルを1つのアプリで使えるようにするローカル動画生成スタジオです。生成した動画はライブラリで一元管理し、編集(結合・BGM・テロップ)して YouTube / TikTok / Instagram リールなど各SNS向けの形式でそのまま書き出せます。

## ✨ 7つの生成AI — やりたいことから選ぶ

| やりたいこと | モデル | 画面の特徴 |
|---|---|---|
| 🎨 アニメ・2Dイラストをそのまま動かしたい | **AnimeGen** (AIdeaLab) | イラストD&D、動きプリセット(髪揺れ・まばたき等)、アニメスタイル自動付与 |
| 🎬 映える、映画のような映像が欲しい | **Wan2.2** (Alibaba) | カメラワーク・照明・カラーグレードのシネマティックビルダー、4ステップ高速モード |
| 🌊 激しい動き・水/炎/布の物理表現 | **HunyuanVideo 1.5** (Tencent) | 物理現象チップ、時系列プロンプト、480p高速プレビュー→720p+1080p超解像 |
| 🧍 キャラ画像を顔を変えずに動かしたい | **CogVideoX-5B-I2V** (Zhipu AI) | 動きの強さ3段階、アイデンティティ固定、忠実度優先設定 |
| 🚁 ドローン空撮・立体感ある背景映像 | **CosmoVideo** (NVIDIA Cosmos Predict2) | 空撮プリセット、Text2Image→Video2World自動チェーン |
| 🎵 動画と音声を同期(MV・喋るアバター) | **LTX-2.3** (Lightricks) | 映像+音声(セリフ/BGM/環境音)を同時生成、画像+音声のリップシンクアバター |
| 🎛️ 線画・ポーズ・深度で動きを指定 | **Wan2.2 Fun Control** (Alibaba PAI) | 制御動画から線画/ポーズ/深度を自動抽出、その動きどおりに生成 |

## 🗂️ ライブラリ & 編集

- 生成動画を自動登録(プロンプト・シード・全パラメータ保存)、ワンクリック再生成
- クリップ結合・トリム・フェード・テロップ(日本語フォント対応)
- BGM(ループ・自動ダッキング)、ラウドネス正規化(-14 LUFS)
- **SNSプリセット書き出し**: YouTube(1080p/4K)・Shorts・TikTok・Instagramリール/フィード・X。縦横変換(ぼかし背景 or クロップ)、フレーム補間(低fps生成物を30/60fps化)

## 💻 必要環境

- Windows 11(64bit)
- NVIDIA GPU(**VRAM 12GB以上推奨、24GBで全モデル快適**。8GBでも軽量モデル可)
- システムRAM 32GB以上(64GB推奨)
- ディスク空き容量: 厳選構成で約80GB / 全モデル導入で150〜250GB
- インターネット接続(初回セットアップ時のみ。以後は完全オフラインで動作)

## 🚀 インストール

1. [Releases](https://github.com/utausnskareshi/movie-creator-studio/releases) から `Movie-Creator-Studio-Setup-x.x.x.exe` をダウンロード
2. 実行してインストール
   - ⚠️ 未署名のため SmartScreen 警告が出ます: **「詳細情報」→「実行」** をクリックしてください
3. アプリを起動し、**セットアップ画面**の案内に従って ComfyUI・ffmpeg・使いたいモデルをダウンロード
   - ComfyUI(約2GB)と各モデルは公式配布元(GitHub / HuggingFace)から直接ダウンロードされ、SHA256で検証されます
   - モデルはカードから必要なものだけ選択できます(ライセンス確認画面つき)

詳細は [docs/SETUP.md](docs/SETUP.md) を参照してください。

## 📜 ライセンス

- アプリ本体: **MIT License**
- 生成エンジン **ComfyUI**(GPL-3.0)と **FFmpeg**(GPL)は本アプリに同梱されません。初回セットアップ時にユーザーが公式配布元からダウンロードし、**別プロセス**として実行されます
- 各動画生成モデルにはそれぞれのライセンスが適用されます(アプリ内「ライセンスセンター」および [docs/MODEL_LICENSES.md](docs/MODEL_LICENSES.md) 参照)
  - 特に **HunyuanVideo は EU・英国・韓国では利用不可**、**CogVideoX の商用利用は Zhipu への無料登録が必要** です
- **Built on NVIDIA Cosmos** — CosmoVideo 画面は NVIDIA Open Model License の下で NVIDIA Cosmos を使用します
- AI生成コンテンツをSNSへ投稿する際は、各プラットフォームの規約に従い「AI生成」であることを開示してください

## 🛠️ 開発

```bash
npm ci          # 依存導入
npm run dev     # 開発起動
npm test        # ユニットテスト
npm run typecheck
npm run dist    # インストーラー作成 (release/)
```

主要構成: Electron + React + TypeScript / ComfyUI をヘッドレス起動し HTTP+WebSocket API で制御 / ffmpeg で編集・書き出し。ComfyUI ワークフロー定義は [resources/workflows](resources/workflows) にあり、公式テンプレート・ノード定義と突き合わせて検証済みです([NOTES.md](resources/workflows/NOTES.md))。

---

<a id="english"></a>
# English

**Movie Creator Studio** is a Windows desktop app that turns your local NVIDIA GPU (up to 24GB VRAM) into an all-in-one AI video studio. It embeds **ComfyUI** as a headless engine and gives seven video-generation models their own purpose-built screens:

- **AnimeGen** (AIdeaLab) — animate anime/2D illustrations while keeping the art style
- **Wan2.2** (Alibaba) — cinematic footage with camera/lighting/color-grade prompt builders
- **HunyuanVideo 1.5** (Tencent) — intense motion and realistic physics (water, fire, cloth), with 1080p super-resolution
- **CogVideoX-5B-I2V** (Zhipu AI) — animate a character image without changing the face
- **CosmoVideo** (NVIDIA Cosmos Predict2) — drone-style aerial shots and 3D-consistent backgrounds (Built on NVIDIA Cosmos)
- **LTX-2.3** (Lightricks) — video with natively synchronized audio (dialogue/music/ambience) in one pass, plus image+voice talking avatars
- **Wan2.2 Fun Control** (Alibaba PAI) — drive motion with a control video via auto-extracted lineart / pose / depth

A unified library manages every generation (with one-click re-generation), and the editor adds trimming, concatenation, BGM mixing, Japanese-ready text overlays, and one-click export presets for YouTube, Shorts, TikTok, Instagram Reels/Feed and X — including blur-pad/crop aspect conversion and motion-interpolated frame-rate upconversion.

**Requirements:** Windows 11, NVIDIA GPU (12GB+ VRAM recommended, 24GB ideal), 80–250GB disk for models. ComfyUI, ffmpeg and all models are downloaded from their official sources by the in-app setup wizard (SHA256-verified) — nothing is bundled or redistributed.

**Install:** grab the installer from [Releases](https://github.com/utausnskareshi/movie-creator-studio/releases). The binary is unsigned; pass SmartScreen via "More info" → "Run anyway".

App code is MIT. ComfyUI (GPL-3.0) and FFmpeg (GPL) run as separate user-installed processes. Each model has its own license — see the in-app License Center. HunyuanVideo is unavailable in the EU/UK/South Korea; CogVideoX commercial use requires free registration with Zhipu.
