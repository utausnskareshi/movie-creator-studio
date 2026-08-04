# モデルライセンス一覧

本アプリはモデルを同梱・再配布しません。各モデルはユーザーがセットアップ時に公式配布元からダウンロードし、それぞれのライセンスに従って利用します。**商用利用の前に必ず各ライセンス全文を確認してください。**(本書は要約であり法的助言ではありません)

## AnimeGen (AIdeaLab)
- **ライセンス**: Apache License 2.0
- **商用利用**: 可
- **配布元**: https://huggingface.co/aidealab/AnimeGen-I2V / https://huggingface.co/aidealab/AnimeGen-T2V
- 備考: 日本のAIdeaLab社がGENIAC(経産省/NEDO)支援で開発

## Wan2.2 (Alibaba)
- **ライセンス**: Apache License 2.0
- **商用利用**: 可
- **配布元**: https://github.com/Wan-Video/Wan2.2 / https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged

## HunyuanVideo 1.5 (Tencent)
- **ライセンス**: Tencent Hunyuan Community License
- **商用利用**: 条件付き可(月間アクティブユーザー1億人超の製品・サービスは別途ライセンスが必要)
- **重要な制限**:
  - **EU・英国・韓国では利用不可**(ライセンスの適用地域外)
  - 生成物を他のAIモデルの学習・改良に使用することは禁止
  - AI生成コンテンツであることの開示義務あり
- **配布元**: https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5

## CogVideoX-5B / 5B-I2V (Zhipu AI / Z.ai)
- **ライセンス**: CogVideoX License(コードはApache-2.0)
- **商用利用**: **Zhipu AIへの無料登録が必要**(https://open.bigmodel.cn/mla/form)。商用サービスは月間100万アクセスまで(超える場合は別途商談)
- **禁止事項**: 軍事目的・違法目的等
- **配布元**: https://github.com/zai-org/CogVideo(MODEL_LICENSE参照)

## NVIDIA Cosmos Predict2
- **ライセンス**: NVIDIA Open Model License
- **商用利用**: 可(生成物の権利はユーザーに帰属)
- **表記義務**: 本アプリは規約に基づき「**Built on NVIDIA Cosmos**」を表示しています
- **禁止事項**: 安全ガードレールの回避・無効化。モデルに関する訴訟提起でライセンス終了
- **配布元**: https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/

## LTX-2.3 (Lightricks)
- **ライセンス**: LTX-2 Community License(ソース利用可能ライセンス。OSIオープンソースではありません)
- **商用利用**: 条件付き可(**年商1,000万米ドル未満**の個人・事業者は無償で商用可。以上は別途商用ライセンスが必要)
- **備考**: テキストエンコーダにGoogle Gemma 3を使用(Gemma利用規約が併せて適用)。重みの再配布に制限あり
- **配布元**: https://github.com/Lightricks/LTX-2 / https://huggingface.co/Lightricks

## Wan2.2 Fun Control (Alibaba PAI)
- **ライセンス**: Apache License 2.0
- **商用利用**: 可
- **配布元**: https://huggingface.co/alibaba-pai/Wan2.2-Fun-5B-Control / https://huggingface.co/alibaba-pai/Wan2.2-Fun-A14B-Control(ComfyUI再パッケージ: Comfy-Org/Wan_2.2_ComfyUI_Repackaged)
- 備考: ポーズ/深度の制御には comfyui_controlnet_aux(Apache-2.0)を併用

## MiniMax H3 (MiniMax)
- **ライセンス**: MiniMax H3 Community License
- **商用利用**: 条件付き可(**年間収益2,000万米ドル超**の事業者は MiniMax の事前書面許諾が必要。商用製品はUIに「MiniMax H3」を明示する義務)
- **重要な制限**:
  - **EU・英国・韓国・米国では利用不可**(ライセンスの適用地域外)
  - 生成物を他のAIモデル(競合モデル)の学習・改善に使用することは禁止
  - 生成物へのAI生成識別子の付与義務あり(SNS投稿時は各プラットフォームの開示設定を)
  - Acceptable Use Policy による禁止用途(虚偽情報・なりすまし・軍事利用等)
- **配布元**: https://huggingface.co/MiniMaxAI/MiniMax-H3(ComfyUI再パッケージ: https://huggingface.co/Comfy-Org/MiniMax-H3)
- 備考: 公開されているのは768pクラスの H3-Base(FL2VA / Ref2VA)。2K生成モジュール(H3-Regenerate-2K)は未公開のため本アプリは対象外

---

## エンジン・ツール(参考)

| ソフトウェア | ライセンス | 扱い |
|---|---|---|
| ComfyUI | GPL-3.0 | 同梱せず。セットアップ時にユーザーが公式GitHubからダウンロードし、**別プロセス**として起動(HTTP API連携) |
| FFmpeg (BtbN build) | GPLv3 | 同梱せず。セットアップ時にダウンロードし、別プロセスとして実行 |
| ComfyUI-CogVideoXWrapper (Kijai) | Apache-2.0 | CogVideoX利用時のみカスタムノードとして導入 |
| comfyui_controlnet_aux (Fannovel16) | Apache-2.0 | Wan2.2 Fun Control のポーズ/深度抽出に導入(線画は本体機能で完結) |
| llama.cpp + Qwen3-4B-Instruct | MIT / Apache-2.0 | プロンプト変換AI(ローカルCPU実行・任意導入) |
| DWPose 検出モデル (yolox_l / dw-ll bs5) | Apache-2.0 | ポーズ抽出用。アプリが事前配置 |
| Depth Anything V2 **Small** | Apache-2.0 | 深度抽出用。**Large(CC-BY-NC-4.0・非商用)は商用整合のため不採用** |

## SNS投稿時のAI開示について

生成した動画を投稿する際は、各プラットフォームのポリシーに従ってください:
- **YouTube**: 「変更または合成されたコンテンツ」の開示設定
- **TikTok**: AI生成コンテンツラベル
- **Instagram**: AIラベル(Made with AI)
- HunyuanVideoのライセンスはAI生成である旨の開示を**義務**としています

本アプリは書き出し動画のメタデータに「AI-generated content」の注記を自動で埋め込みます。
