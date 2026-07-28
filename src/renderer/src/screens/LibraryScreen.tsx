import { useMemo, useState } from 'react'
import type { GenerationRequest, ModelFamily, VideoRecord } from '@shared/types'
import { FAMILY_META } from '@shared/familyMeta'
import { useApp } from '../store'
import { fmtDate, fmtDuration } from '../lib/format'
import { editorReady } from '../lib/ready'

const FAMILY_FILTERS: Array<{ id: ModelFamily | 'all'; label: string }> = [
  { id: 'all', label: 'すべて' },
  { id: 'animegen', label: 'AnimeGen' },
  { id: 'wan22', label: 'Wan2.2' },
  { id: 'hunyuan15', label: 'Hunyuan' },
  { id: 'cogvideox', label: 'CogVideoX' },
  { id: 'cosmos', label: 'Cosmos' },
  { id: 'ltx2', label: 'LTX-2.3' },
  { id: 'wanfun', label: 'Fun Control' }
]

export default function LibraryScreen(): React.JSX.Element {
  const { videos, refreshVideos, setScreen, setEditorSeedIds, jobs, setupStatus } = useApp()
  const genActive = jobs.some((j) => ['queued', 'preparing', 'running', 'saving'].includes(j.state))
  const editorOk = editorReady(setupStatus)
  const [filter, setFilter] = useState<ModelFamily | 'all'>('all')
  const [favOnly, setFavOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<VideoRecord | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = useMemo(
    () =>
      videos.filter((v) => {
        if (filter !== 'all' && v.family !== filter) return false
        if (favOnly && !v.favorite) return false
        if (search && !`${v.prompt} ${v.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()))
          return false
        return true
      }),
    [videos, filter, favOnly, search]
  )

  function toggleSelect(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function regenerate(rec: VideoRecord, newSeed: boolean): Promise<void> {
    try {
      // requestJson lives in a user-editable file — a broken parse must not
      // blow up the screen
      const req = JSON.parse(rec.requestJson) as GenerationRequest
      if (newSeed) req.seed = -1
      await window.mcs.queueGeneration(req)
      setDetail(null)
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).replace(
        /^Error invoking remote method '[^']+': (Error: )?/,
        ''
      )
      // models may have been removed since this video was generated
      alert(
        /MISSING_MODELS:/.test(msg)
          ? 'この動画のモデルが未ダウンロードです。セットアップ画面から該当モデルをダウンロードすると再生成できます。'
          : msg
      )
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-lg font-bold">🗂️ ライブラリ</h1>
        <div className="flex gap-1">
          {FAMILY_FILTERS.map((f) => (
            <button
              key={f.id}
              className={`chip ${filter === f.id ? 'chip-on' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
          <button className={`chip ${favOnly ? 'chip-on' : ''}`} onClick={() => setFavOnly(!favOnly)}>
            ⭐ お気に入り
          </button>
        </div>
        <input
          className="input max-w-56 ml-auto"
          placeholder="プロンプト・タグ検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="btn-ghost text-xs whitespace-nowrap"
          title="生成動画の保存フォルダをエクスプローラーで開きます"
          onClick={() => void window.mcs.openLibraryFolder()}
        >
          📁 フォルダで表示
        </button>
      </div>

      {selected.size > 0 && (
        <div className="card p-3 mb-4 flex items-center gap-3">
          <span className="text-sm">{selected.size} 件選択中</span>
          <button
            className="btn-primary text-xs"
            disabled={!editorOk}
            title={!editorOk ? 'ffmpeg のインストールが必要です(セットアップ画面)' : undefined}
            onClick={() => {
              setEditorSeedIds([...selected])
              setSelected(new Set())
              setScreen('editor')
            }}
          >
            ✂️ 選択した動画を編集(つなげる)
          </button>
          <button className="btn-ghost text-xs" onClick={() => setSelected(new Set())}>
            選択解除
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center text-slate-500 py-20 text-sm">
          動画がまだありません。生成画面から作成してください。
        </div>
      ) : (
        <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((v) => (
            <div
              key={v.id}
              onClick={() => setDetail(v)}
              className={`card overflow-hidden cursor-pointer hover:border-accent transition-colors ${
                selected.has(v.id) ? 'border-accent ring-1 ring-accent' : ''
              }`}
            >
              <div className="relative">
                <img
                  src={window.mcs.toMediaUrl(v.thumbPath)}
                  className="w-full aspect-video object-cover bg-panel2"
                  alt=""
                />
                <span className="absolute bottom-1 right-1 text-[10px] bg-black/70 rounded px-1">
                  {fmtDuration(v.durationSec)}
                </span>
                <span className="absolute top-1 left-1 text-[10px] bg-black/70 rounded px-1">
                  {FAMILY_META[v.family].modelLabel.split(' ')[0]}
                </span>
              </div>
              <div className="p-2">
                <div className="text-[11px] text-slate-300 truncate" title={v.prompt}>
                  {v.prompt || '(プロンプトなし)'}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-slate-500">{fmtDate(v.createdAt)}</span>
                  {/* controls must not bubble into the card's open-detail click */}
                  <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      title="お気に入り"
                      className={v.favorite ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400'}
                      onClick={() =>
                        void window.mcs.updateVideo(v.id, { favorite: !v.favorite }).then(refreshVideos)
                      }
                    >
                      ★
                    </button>
                    <input
                      type="checkbox"
                      title="編集用に選択"
                      checked={selected.has(v.id)}
                      onChange={() => toggleSelect(v.id)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-8"
          onClick={() => setDetail(null)}
        >
          <div
            className="card p-4 max-w-3xl w-full max-h-full overflow-y-auto space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between -mb-1">
              <div className="text-xs text-slate-500">
                {FAMILY_META[detail.family].modelLabel.split(' ')[0]} / {fmtDate(detail.createdAt)}
              </div>
              <button className="btn-ghost text-xs px-2.5 py-1" onClick={() => setDetail(null)}>
                ✕ 閉じる
              </button>
            </div>
            <video
              src={window.mcs.toMediaUrl(detail.filePath)}
              controls
              autoPlay
              loop
              className="w-full rounded-lg bg-black max-h-[50vh]"
            />
            <div className="text-xs text-slate-300 whitespace-pre-wrap">{detail.prompt}</div>
            <div className="text-[11px] text-slate-500 grid grid-cols-2 gap-x-4 gap-y-1">
              <span>モデル: {detail.modelLabel}</span>
              <span>シード: {detail.seed}</span>
              <span>
                {detail.width}x{detail.height} / {detail.fps}fps / {fmtDuration(detail.durationSec)}
              </span>
              <span>{fmtDate(detail.createdAt)}</span>
            </div>
            <TagEditor rec={detail} onSaved={refreshVideos} />
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                className="btn-primary text-xs"
                disabled={genActive}
                title={genActive ? '生成の実行中は開始できません' : undefined}
                onClick={() => void regenerate(detail, true)}
              >
                🎲 別シードで再生成
              </button>
              <button
                className="btn-ghost text-xs"
                disabled={genActive}
                title={genActive ? '生成の実行中は開始できません' : undefined}
                onClick={() => void regenerate(detail, false)}
              >
                同じ設定で再生成
              </button>
              <button
                className="btn-ghost text-xs"
                disabled={!editorOk}
                title={!editorOk ? 'ffmpeg のインストールが必要です(セットアップ画面)' : undefined}
                onClick={() => {
                  setEditorSeedIds([detail.id])
                  setDetail(null)
                  setScreen('editor')
                }}
              >
                ✂️ 編集・書き出しへ
              </button>
              <button className="btn-ghost text-xs" onClick={() => void window.mcs.showInFolder(detail.id)}>
                📁 フォルダで表示
              </button>
              <button
                className="btn-danger text-xs ml-auto"
                onClick={() => {
                  if (confirm('この動画をライブラリとディスクから削除しますか?')) {
                    void window.mcs
                      .deleteVideo(detail.id, true)
                      .catch((e) =>
                        alert(
                          `削除できませんでした(書き出し等でファイル使用中の可能性があります)\n${e instanceof Error ? e.message : e}`
                        )
                      )
                      .then(() => {
                      setDetail(null)
                      void refreshVideos()
                    })
                  }
                }}
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TagEditor({ rec, onSaved }: { rec: VideoRecord; onSaved: () => Promise<void> }): React.JSX.Element {
  const [text, setText] = useState(rec.tags.join(', '))
  return (
    <div className="flex gap-2 items-center">
      <span className="label mb-0">タグ</span>
      <input
        className="input text-xs"
        value={text}
        placeholder="カンマ区切り (例: OP用, 空, 夕方)"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const tags = [...new Set(text.split(',').map((s) => s.trim()).filter(Boolean))]
          void window.mcs.updateVideo(rec.id, { tags }).then(onSaved)
        }}
      />
    </div>
  )
}
