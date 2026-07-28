import { useState } from 'react'
import { useApp } from '../store'
import { FAMILY_META } from '@shared/familyMeta'

const STATE_LABEL: Record<string, string> = {
  queued: '待機中',
  preparing: '準備中',
  running: '生成中',
  saving: '保存中',
  completed: '完了',
  failed: '失敗',
  cancelled: 'キャンセル'
}

export default function JobsPanel(): React.JSX.Element | null {
  const { jobs, setScreen } = useApp()
  const [open, setOpen] = useState(true)
  const active = jobs.filter((j) => ['queued', 'preparing', 'running', 'saving'].includes(j.state))
  const recent = jobs.filter((j) => ['completed', 'failed', 'cancelled'].includes(j.state)).slice(0, 5)
  // same rule the sidebar uses to lock navigation
  const genActive = active.length > 0
  if (jobs.length === 0) return null

  return (
    <div className="border-t border-line bg-panel">
      <button
        className="w-full px-4 py-1.5 flex items-center justify-between text-xs text-slate-400 hover:bg-panel2"
        onClick={() => setOpen(!open)}
      >
        <span>
          生成キュー — 実行中 {active.length} 件
          {active[0]?.progress ? ` (${Math.round(active[0].progress * 100)}%)` : ''}
        </span>
        <span>{open ? '▼' : '▲'}</span>
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto px-3 pb-3 space-y-2">
          {[...active, ...recent].map((job) => {
            const meta = FAMILY_META[job.request.options.family]
            return (
              <div key={job.id} className="card p-2 flex items-center gap-3">
                {job.previewDataUrl ? (
                  <img
                    src={job.previewDataUrl}
                    className="w-20 h-12 object-cover rounded-md border border-line"
                    alt=""
                  />
                ) : (
                  <div className="w-20 h-12 rounded-md border border-line bg-panel2 flex items-center justify-center text-lg">
                    {job.state === 'completed' ? '✅' : job.state === 'failed' ? '⚠️' : '🎞️'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">
                    [{meta.modelLabel.split(' ')[0]}] {job.request.prompt.slice(0, 60) || '(プロンプトなし)'}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>{STATE_LABEL[job.state] ?? job.state}</span>
                    {job.progressText && <span>{job.progressText}</span>}
                    {job.error && (
                      <span className="text-rose-400 truncate" title={job.error}>
                        {job.error.slice(0, 80)}
                      </span>
                    )}
                  </div>
                  {['running', 'preparing', 'saving'].includes(job.state) && (
                    <div className="h-1.5 bg-panel2 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${Math.round(job.progress * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                {['queued', 'preparing', 'running'].includes(job.state) && (
                  <button
                    className="btn-ghost text-xs px-2 py-1"
                    onClick={() => void window.mcs.cancelJob(job.id)}
                  >
                    中止
                  </button>
                )}
                {job.state === 'completed' && job.videoId && (
                  <button
                    className="btn-ghost text-xs px-2 py-1"
                    // the sidebar blocks navigation while a generation runs;
                    // this shortcut bypassed it and stranded the user on the
                    // library screen with every nav item disabled
                    disabled={genActive}
                    title={genActive ? '生成の実行中は移動できません' : undefined}
                    onClick={() => !genActive && setScreen('library')}
                  >
                    ライブラリへ
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
