/**
 * ギャラリーのモードフィルタ。
 * t2v: 被写体・場面まで記述するフルシーン型
 * i2v: 入力画像に動きを与える指示型
 * avatar: LTX-2.3 の喋るアバター専用(画像+音声でリップシンク)
 */
export type PresetMode = 't2v' | 'i2v' | 'avatar'

export interface PromptPreset {
  /** 日本語タイトル(一覧表示用) */
  title: string
  /** カテゴリ(タブ表示用) */
  category: string
  /** そのまま使える英語プロンプト */
  prompt: string
  /** このプリセットが適する生成モード。省略時は全モードに表示。 */
  modes?: PresetMode[]
}
