import { useApp } from '../store'

export default function LicensesScreen(): React.JSX.Element {
  const { catalog } = useApp()
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-bold">📜 ライセンスセンター</h1>
        <p className="text-sm text-slate-400 mt-1">
          各モデルの利用条件の要約です。商用利用の前に必ず全文を確認してください。
        </p>
      </div>

      {catalog.map((pack) => (
        <section key={pack.id} className="card p-4">
          <div className="font-bold text-sm">{pack.name}</div>
          <div className="text-xs text-slate-400 mt-1">ライセンス: {pack.license.name}</div>
          <div className="text-xs text-slate-300 mt-2">{pack.license.commercialNote}</div>
          {pack.license.warnings.length > 0 && (
            <ul className="text-xs text-amber-400/90 mt-2 list-disc pl-4 space-y-1">
              {pack.license.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <button
            className="text-xs text-accent underline mt-2"
            onClick={() => void window.mcs.openExternal(pack.license.url)}
          >
            全文を開く ↗
          </button>
        </section>
      ))}

      <section className="card p-4 space-y-2 text-xs text-slate-400">
        <div className="font-bold text-sm text-slate-200">本アプリについて</div>
        <p>Movie Creator Studio 本体は MIT License のオープンソースソフトウェアです。</p>
        <p>
          生成エンジンとして <span className="text-slate-200">ComfyUI</span>(GPL-3.0)を別プロセスとして起動し、HTTP
          API 経由で利用します(本アプリには同梱されません。セットアップ時にユーザーがダウンロードします)。
        </p>
        <p>
          動画処理には <span className="text-slate-200">FFmpeg</span>(GPL ビルド)を別プロセスとして利用します。
        </p>
        <p>
          プロンプト変換AIは <span className="text-slate-200">llama.cpp</span>(MIT)+{' '}
          <span className="text-slate-200">Qwen3-4B-Instruct</span>(Apache-2.0)をローカルCPUで実行します。
        </p>
        <p>
          カスタムノード: ComfyUI-CogVideoXWrapper(Apache-2.0)/ comfyui_controlnet_aux(Apache-2.0)。
          Fun Controlの抽出モデルは DWPose(Apache-2.0)と Depth Anything V2{' '}
          <span className="text-slate-200">Small</span>(Apache-2.0)を使用します
          — 高精度版のLarge(CC-BY-NC-4.0・非商用)は商用利用の妨げになるため採用していません。
        </p>
        <p className="text-slate-300 font-semibold">Built on NVIDIA Cosmos</p>
        <p>
          CosmoVideo 画面は NVIDIA Cosmos モデルを使用します。Licensed by NVIDIA Corporation under the NVIDIA
          Open Model License.
        </p>
        <p>
          ⚠️ AI生成コンテンツの公開時は、各SNSの規約に従い「AI生成」であることを開示してください(YouTube:
          「変更されたコンテンツ」設定、TikTok: AIラベル、Instagram: AIラベル)。
        </p>
      </section>
    </div>
  )
}
