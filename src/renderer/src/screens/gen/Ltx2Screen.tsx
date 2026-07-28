import { useState } from 'react'
import type { FamilyOptions } from '@shared/types'
import { FAMILY_META } from '@shared/familyMeta'
import {
  AudioPick,
  ChipsBox,
  CommonParams,
  GenHeader,
  GenerateBar,
  ImagePick,
  ModeTabs,
  PromptBox,
  TipsCard,
  useGenForm
} from '../../components/gen/common'

export default function Ltx2Screen(): React.JSX.Element {
  const form = useGenForm('ltx2', 't2v')
  const [submode, setSubmode] = useState<'video' | 'avatar'>('video')

  const options: FamilyOptions = { family: 'ltx2', ltx2: { submode } }

  // avatar: match the video length to the picked audio — smallest frame
  // preset that covers the audio, else the longest one
  function syncFramesToAudio(sec: number): void {
    const presets = FAMILY_META.ltx2.framePresets
    const needed = Math.ceil(sec * FAMILY_META.ltx2.fps) + 1
    form.setFrames(presets.find((f) => f >= needed) ?? presets[presets.length - 1])
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <GenHeader family="ltx2" />
      <div className="inline-flex rounded-lg border border-line overflow-hidden mb-3">
        {(
          [
            ['video', '🎵 音声付き映像 (MV)'],
            ['avatar', '🗣️ 喋るアバター']
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            className={`px-4 py-1.5 text-sm ${submode === m ? 'bg-accent text-white' : 'bg-panel2 text-slate-300'}`}
            onClick={() => setSubmode(m)}
          >
            {label}
          </button>
        ))}
      </div>
      {submode === 'video' && <ModeTabs form={form} family="ltx2" />}
      <div className="grid grid-cols-[1fr_340px] gap-5">
        <div className="space-y-4">
          {submode === 'avatar' ? (
            <>
              <ImagePick form={form} always label="顔画像(アバター)" />
              <AudioPick form={form} onDuration={syncFramesToAudio} />
            </>
          ) : (
            <ImagePick form={form} />
          )}
          <PromptBox
            form={form}
            family="ltx2"
            presetMode={submode === 'avatar' ? 'avatar' : form.mode}
            placeholder={
              submode === 'avatar'
                ? '例: 正面を向いた女性が笑顔で自己紹介、口の動きが音声に同期(日本語OK)'
                : '例: ネオンの雨の街を歩く歌手のMV。アップビートなシンセポップ(映像と"音"の両方を書く)'
            }
          />
          <div className="card p-3">
            <div className="text-xs font-bold text-slate-300 mb-2">🎬 プロンプトビルダー(音も指定)</div>
            <ChipsBox family="ltx2" selected={form.selectedChips} toggle={form.toggleChip} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            {submode === 'avatar' && (
              <div className="text-[11px] text-slate-400 bg-panel2 border border-line rounded-lg p-2">
                画像(顔)+ 音声を指定すると、音声にリップシンクした喋る動画を生成します(IA2V)。
              </div>
            )}
            <CommonParams form={form} family="ltx2" />
            <GenerateBar
              form={form}
              options={options}
              estimate="目安: 音声込みのため生成に数分〜(初回はfp8モデルのロードに時間)"
            />
          </div>
          <TipsCard family="ltx2" />
          <div className="card p-3 text-[11px] text-amber-300/90 border-amber-800">
            ⚠️ ライセンス: LTX-2 Community License(年商$10M未満は商用可)。テキストエンコーダにGoogle Gemma 3を使用。
          </div>
        </div>
      </div>
    </div>
  )
}
