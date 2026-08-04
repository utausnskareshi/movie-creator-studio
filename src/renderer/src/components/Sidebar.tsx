import type { ModelFamily, ModelPack } from '@shared/types'
import { useApp, type Screen } from '../store'
import { editorReady, familyReady, lockReason, packReady } from '../lib/ready'

const NAV: Array<{
  id: Screen
  label: string
  icon: string
  section?: string
  family?: ModelFamily
  needsFfmpeg?: boolean
}> = [
  { id: 'home', label: 'ホーム', icon: '🏠' },
  { id: 'setup', label: 'セットアップ', icon: '🧰' },
  { id: 'animegen', label: 'AnimeGen', icon: '🎨', section: '生成', family: 'animegen' },
  { id: 'wan22', label: 'Wan2.2', icon: '🎬', family: 'wan22' },
  { id: 'hunyuan15', label: 'HunyuanVideo', icon: '🌊', family: 'hunyuan15' },
  { id: 'cogvideox', label: 'CogVideoX', icon: '🧍', family: 'cogvideox' },
  { id: 'cosmos', label: 'CosmoVideo', icon: '🚁', family: 'cosmos' },
  { id: 'ltx2', label: 'LTX-2.3 (音声)', icon: '🎵', family: 'ltx2' },
  { id: 'wanfun', label: 'Fun Control', icon: '🎛️', family: 'wanfun' },
  { id: 'minimaxh3', label: 'MiniMax H3', icon: '🎭', family: 'minimaxh3' },
  { id: 'library', label: 'ライブラリ', icon: '🗂️', section: '管理' },
  { id: 'editor', label: '編集・書き出し', icon: '✂️', needsFfmpeg: true },
  { id: 'settings', label: '設定', icon: '⚙️', section: 'その他' },
  { id: 'licenses', label: 'ライセンス', icon: '📜' },
  { id: 'help', label: 'ヘルプ', icon: '❓' }
]

export default function Sidebar(): React.JSX.Element {
  const { screen, setScreen, engine, setupStatus, catalog, jobs, downloads, busyKeys } = useApp()
  // while a generation is running, keep the user on the current screen —
  // navigating away mid-job caused confusion (cancel from the queue panel)
  const genActive = jobs.some((j) => ['queued', 'preparing', 'running', 'saving'].includes(j.state))

  // a pack that is being downloaded/installed right now must not make its
  // screen enterable — customNodes[] flips true at zip-extract time, BEFORE
  // pip deps finish, so packReady alone can lie during an install
  function packTouched(p: ModelPack): boolean {
    if (busyKeys[`pack:${p.id}`]) return true
    if (p.files.some((f) => ['downloading', 'verifying'].includes(downloads[f.id]?.status ?? ''))) {
      return true
    }
    return p.requiresCustomNodes.some((n) =>
      ['downloading', 'verifying', 'extracting'].includes(downloads[`customnode:${n}`]?.status ?? '')
    )
  }

  /** null = enterable; otherwise the reason shown in the tooltip */
  function itemLockReason(item: (typeof NAV)[number]): string | null {
    if (item.family) {
      if (!familyReady(item.family, setupStatus, catalog)) {
        return `${lockReason(item.family, setupStatus)}(セットアップ画面から導入できます)`
      }
      // ready, but only via packs that are mid-download/install? then wait.
      // A ready & untouched pack keeps the screen open (e.g. Wan2.2 5B stays
      // usable while the 14B pack downloads)
      const packs = catalog.filter((p) => p.family === item.family)
      if (packs.some((p) => packReady(p, setupStatus) && !packTouched(p))) return null
      return 'モデルをダウンロード中です(完了までお待ちください)'
    }
    if (item.needsFfmpeg && !editorReady(setupStatus)) {
      return `${lockReason(null, setupStatus)}(セットアップ画面から導入できます)`
    }
    return null
  }

  return (
    <aside className="w-52 shrink-0 border-r border-line bg-panel flex flex-col">
      <div className="px-4 py-4 border-b border-line">
        <div className="text-base font-bold leading-tight">Movie Creator Studio</div>
        <div className="text-[11px] text-slate-400 mt-1">ローカルAI動画生成スタジオ</div>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map((item) => {
          const lockedReason = itemLockReason(item)
          const navBlocked = !lockedReason && genActive && screen !== item.id
          const disabled = !!lockedReason || navBlocked
          return (
            <div key={item.id}>
              {item.section && (
                <div className="px-4 pt-3 pb-1 text-[10px] font-bold tracking-wider text-slate-500">
                  {item.section}
                </div>
              )}
              <button
                disabled={disabled}
                title={
                  navBlocked
                    ? '動画の生成中は画面を移動できません(下の生成キューから中止できます)'
                    : (lockedReason ?? undefined)
                }
                onClick={() => !disabled && setScreen(item.id)}
                className={`w-full text-left px-4 py-2 flex items-center gap-2 text-sm transition-colors ${
                  screen === item.id
                    ? 'bg-indigo-500/20 text-indigo-200 border-r-2 border-accent'
                    : disabled
                      ? 'text-slate-600 cursor-not-allowed'
                      : 'hover:bg-panel2 text-slate-300'
                }`}
              >
                <span className={disabled ? 'grayscale opacity-50' : ''}>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {lockedReason && <span className="text-[10px]">🔒</span>}
                {navBlocked && <span className="text-[10px]">⏳</span>}
              </button>
            </div>
          )
        })}
      </nav>
      <div className="px-4 py-3 border-t border-line text-[11px]">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              engine?.state === 'running'
                ? 'bg-emerald-400'
                : engine?.state === 'starting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-slate-600'
            }`}
          />
          <span className="text-slate-400">
            エンジン:{' '}
            {engine?.state === 'running'
              ? '稼働中'
              : engine?.state === 'starting'
                ? '起動中…'
                : engine?.state === 'error'
                  ? 'エラー'
                  : '停止'}
          </span>
        </div>
        {engine?.state === 'running' && engine.vramFreeMB != null && (
          <div className="text-slate-500 mt-1">
            VRAM空き {Math.round(engine.vramFreeMB / 1024)}GB
          </div>
        )}
      </div>
    </aside>
  )
}
