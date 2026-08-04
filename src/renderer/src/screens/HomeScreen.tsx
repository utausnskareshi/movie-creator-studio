import { useApp } from '../store'
import { FAMILY_INTRO } from '../data/chips'
import { familyReady, lockReason } from '../lib/ready'
import type { Screen } from '../store'
import type { ModelFamily } from '@shared/types'

const GEN_CARDS: Array<{ family: ModelFamily; screen: Screen; icon: string; catch: string }> = [
  { family: 'animegen', screen: 'animegen', icon: '🎨', catch: 'アニメ・2Dイラストをそのまま動かしたい' },
  { family: 'wan22', screen: 'wan22', icon: '🎬', catch: 'とにかく映える、お洒落で映画のような映像が欲しい' },
  { family: 'hunyuan15', screen: 'hunyuan15', icon: '🌊', catch: '激しい動きや、水・炎・服のリアルな物理挙動を描きたい' },
  { family: 'cogvideox', screen: 'cogvideox', icon: '🧍', catch: 'お気に入りのキャラクター画像を、顔を変えずに動かしたい' },
  { family: 'cosmos', screen: 'cosmos', icon: '🚁', catch: 'ドローン空撮や、立体感のある圧倒的な背景映像を作りたい' },
  { family: 'ltx2', screen: 'ltx2', icon: '🎵', catch: '動画と「音声」を完全同期させ、MVや喋るAIアバターを作りたい' },
  { family: 'wanfun', screen: 'wanfun', icon: '🎛️', catch: '線画やポーズを指定して、思い通りの動きをさせたい' },
  { family: 'minimaxh3', screen: 'minimaxh3', icon: '🎭', catch: '歌声からリップシンク動画を作りたい・画像や音声を組み合わせて音付き動画にしたい' }
]

export default function HomeScreen(): React.JSX.Element {
  const { env, setupStatus, setScreen, videos, catalog } = useApp()
  const setupDone = setupStatus?.comfyui.installed && setupStatus?.ffmpeg.installed
  const anyModel = setupStatus ? Object.values(setupStatus.modelFiles).some(Boolean) : false
  // name exactly what is missing — models can be fully downloaded while e.g.
  // ffmpeg is still absent, and users read the locked nav as a malfunction
  const missingTools = setupStatus
    ? ([
        !setupStatus.comfyui.installed && 'ComfyUI(生成エンジン)',
        !setupStatus.ffmpeg.installed && 'ffmpeg'
      ].filter(Boolean) as string[])
    : []

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Movie Creator Studio</h1>
        <p className="text-sm text-slate-400 mt-1">
          8つの動画生成AIをローカルで — 生成からSNS書き出しまでオールインワン
        </p>
      </div>

      {/* setupStatus === null means "still loading" — render no banner yet,
          or installed users would see the setup banner flash on every start */}
      {setupStatus && !setupDone && (
        <div className="card p-4 border-amber-700 bg-amber-950/30">
          <div className="font-bold text-amber-300">🚀 はじめにセットアップが必要です</div>
          <p className="text-sm text-slate-300 mt-1">
            生成エンジン(ComfyUI)・ffmpeg・モデルのダウンロードを行います。GPUとディスク容量を自動診断します。
          </p>
          <p className="text-xs text-amber-400/90 mt-2">
            未導入: {missingTools.join('・')} — モデルをダウンロード済みでも、これらが揃うまで生成画面は開けません
          </p>
          <button className="btn-primary mt-3" onClick={() => setScreen('setup')}>
            セットアップを開始
          </button>
        </div>
      )}

      {setupStatus && setupDone && !anyModel && (
        <div className="card p-4 border-sky-800 bg-sky-950/30">
          <div className="font-bold text-sky-300">📦 モデルをダウンロードしましょう</div>
          <p className="text-sm text-slate-300 mt-1">
            エンジンは準備完了。使いたい動画生成AIのモデルをセットアップ画面から選んでダウンロードしてください。
          </p>
          <button className="btn-primary mt-3" onClick={() => setScreen('setup')}>
            モデルを選ぶ
          </button>
        </div>
      )}

      <div>
        <div className="text-sm font-bold text-slate-300 mb-3">🎯 やりたいことから選ぶ</div>
        <div className="grid grid-cols-1 gap-3">
          {GEN_CARDS.map((c) => {
            const ready = familyReady(c.family, setupStatus, catalog)
            return (
              <button
                key={c.family}
                onClick={() => setScreen(ready ? c.screen : 'setup')}
                title={ready ? undefined : `${lockReason(c.family, setupStatus)}(クリックでセットアップへ)`}
                className={`card p-4 text-left transition-colors flex items-center gap-4 ${
                  ready ? 'hover:border-accent' : 'opacity-60 hover:border-amber-600'
                }`}
              >
                <div className={`text-3xl ${ready ? '' : 'grayscale'}`}>{c.icon}</div>
                <div className="flex-1">
                  <div className="text-sm text-slate-300">{c.catch}</div>
                  <div className="font-bold mt-0.5">{FAMILY_INTRO[c.family].title.split(' — ')[0]}</div>
                </div>
                {!ready && (
                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-amber-400">🔒 未導入</div>
                    <div className="text-[11px] text-slate-500">セットアップへ</div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-slate-400">GPU</div>
          <div className="font-bold mt-1 text-sm">{env?.gpu?.name ?? '未検出'}</div>
          {env?.gpu && <div className="text-xs text-slate-400">VRAM {Math.round(env.gpu.vramMB / 1024)}GB</div>}
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400">ライブラリ</div>
          <div className="font-bold mt-1 text-sm">{videos.length} 本の動画</div>
          <button className="text-xs text-accent mt-1" onClick={() => setScreen('library')}>
            開く
          </button>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400">メモリ</div>
          <div className="font-bold mt-1 text-sm">RAM {env?.ramGB ?? '--'}GB</div>
          <div className="text-xs text-slate-400">推奨: 64GB(モデル切替時)</div>
        </div>
      </div>
    </div>
  )
}
