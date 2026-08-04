import type { ReactNode } from 'react'

/**
 * In-app manual. Content mirrors the ACTUAL behavior of each screen —
 * when a screen's controls change, update the matching <ScreenDoc> here.
 */

const TOC = [
  { id: 'help-overview', label: '① アプリ概要' },
  { id: 'help-flow', label: '② はじめての使い方' },
  { id: 'help-screens', label: '③ 画面ごとの操作ガイド' },
  { id: 'help-install', label: '④ インストールと削除' },
  { id: 'help-limits', label: '⑤ 制限事項・注意事項' },
  { id: 'help-trouble', label: '⑥ 困ったときは' },
  { id: 'help-locations', label: '⑦ データの保存場所' }
] as const

function jump(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section id={id} className="card p-4 space-y-3 scroll-mt-4">
      <h2 className="font-bold text-base">{title}</h2>
      {children}
    </section>
  )
}

/** collapsible per-screen manual entry */
function ScreenDoc({ icon, title, children }: { icon: string; title: string; children: ReactNode }): React.JSX.Element {
  return (
    <details className="border border-line rounded-lg bg-panel2/40">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold hover:bg-panel2 rounded-lg">
        {icon} {title}
      </summary>
      <div className="px-4 pb-3 pt-1 space-y-2 text-xs text-slate-300 leading-relaxed">{children}</div>
    </details>
  )
}

function H(props: { children: ReactNode }): React.JSX.Element {
  return <div className="font-semibold text-slate-200 mt-2">{props.children}</div>
}

function UL(props: { children: ReactNode }): React.JSX.Element {
  return <ul className="list-disc pl-4 space-y-1">{props.children}</ul>
}

function OL(props: { children: ReactNode }): React.JSX.Element {
  return <ol className="list-decimal pl-4 space-y-1">{props.children}</ol>
}

/** symptom → remedy row for the troubleshooting table */
function TR({ s, children }: { s: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[210px_1fr] gap-3 border-t border-line py-2 text-xs">
      <div className="font-semibold text-slate-200">{s}</div>
      <div className="text-slate-300 leading-relaxed">{children}</div>
    </div>
  )
}

export default function HelpScreen(): React.JSX.Element {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5 text-sm text-slate-300">
      <div>
        <h1 className="text-lg font-bold">❓ ヘルプ</h1>
        <p className="text-sm text-slate-400 mt-1">
          Movie Creator Studio の使い方・各画面の説明・注意事項・トラブル対処をまとめています。
        </p>
      </div>

      {/* 目次 */}
      <div className="card p-4">
        <div className="text-xs font-bold text-slate-400 mb-2">目次</div>
        <div className="flex flex-wrap gap-2">
          {TOC.map((t) => (
            <button key={t.id} className="btn-ghost text-xs" onClick={() => jump(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ① 概要 */}
      <Section id="help-overview" title="① アプリ概要">
        <p className="text-xs leading-relaxed">
          Movie Creator Studio は、8種類の動画生成AIをローカルPCで実行できるオールインワンの動画制作アプリです。
          生成した動画はライブラリで一元管理し、そのままBGM・テロップ・フェードを付けてSNS向けに書き出せます。
          生成エンジン(ComfyUI)はアプリが内蔵・自動管理するため、エンジンの操作知識は不要です。
        </p>
        <H>搭載モデルと得意分野</H>
        <UL>
          <li><b>AnimeGen</b> — アニメ・2Dイラストをそのまま動かす(日本製・イラスト向け)</li>
          <li><b>Wan2.2</b> — 映画のようなシネマティック映像(カメラ・照明・色調の指示が効く)</li>
          <li><b>HunyuanVideo 1.5</b> — 激しい動き・水/炎/布のリアルな物理表現</li>
          <li><b>CogVideoX</b> — キャラクター画像を顔を変えずに動かす(1フレーム目=入力画像)</li>
          <li><b>CosmoVideo</b>(NVIDIA Cosmos Predict2)— ドローン空撮・3D的に一貫した背景映像</li>
          <li><b>LTX-2.3</b> — 動画と音声(セリフ・BGM・環境音)を1回の生成で同時に作る/喋るアバター</li>
          <li><b>Wan2.2 Fun Control</b> — 線画・ポーズ・深度で動きを指定するControlNet動画</li>
          <li><b>MiniMax H3</b> — テキスト・画像・動画・音声を組み合わせて入力できるオムニモーダル。音声付き動画(最大約15秒)を生成。歌声からのリップシンクや参照画像による登場人物指定が可能</li>
        </UL>
        <H>動作環境</H>
        <UL>
          <li>Windows 11(64bit)/ NVIDIA GPU(VRAM 8GB以上。モデルごとの最低VRAMはセットアップ画面に表示)</li>
          <li>システムRAM 64GB推奨(モデル切替時のオフロード先として使用)</li>
          <li>ディスク空き容量: 使うモデルによる(全モデル導入時は150GB以上を推奨)</li>
          <li>インターネット接続はセットアップ(ダウンロード)時のみ必要。生成・編集はオフラインで動作します</li>
        </UL>
        <p className="text-[11px] text-slate-500">
          プロンプトや画像が外部サーバーへ送信されることはありません(モデル等のダウンロード先は HuggingFace / GitHub の公開リポジトリです)。
        </p>
      </Section>

      {/* ② はじめての使い方 */}
      <Section id="help-flow" title="② はじめての使い方(セットアップから最初の動画まで)">
        <OL>
          <li><b>セットアップ画面</b>で「ComfyUI(生成エンジン)」と「ffmpeg」をインストールします(順番に1つずつ)。</li>
          <li>同じ画面の「④ 動画生成モデル」から、使いたいモデルを選んで「ダウンロード」します。ライセンス確認に同意すると開始されます。迷ったら「推奨」バッジ付きから。日本語でプロンプトを書きたい場合は「プロンプト変換AI」の導入もおすすめです。</li>
          <li>ダウンロードが終わると左メニューの該当モデルが解放されます。生成画面でプロンプトを入力(日本語OK)し、「✨ 日本語から変換」→「🎬 生成開始」。</li>
          <li>進捗は画面下部の<b>生成キュー</b>に表示されます。完了すると自動でライブラリに登録されます。</li>
          <li>ライブラリで動画を選び「✂️ 編集・書き出しへ」→ BGMやテロップを付けて「📤 SNS向けに書き出し」。</li>
        </OL>
        <p className="text-[11px] text-slate-500">
          ※ 生成の実行中は他の画面へ移動できません(誤操作防止)。中止は生成キューの「中止」ボタンから。
        </p>
      </Section>

      {/* ③ 画面ガイド */}
      <Section id="help-screens" title="③ 画面ごとの操作ガイド(クリックで開閉)">
        <div className="space-y-2">
          <ScreenDoc icon="🏠" title="ホーム">
            <H>できること</H>
            <UL>
              <li>セットアップ状況の確認と誘導(未導入時は「セットアップを開始」カードが表示されます)</li>
              <li>「やりたいことから選ぶ」— 目的別の8枚のカードから生成画面へ移動。未導入のモデルは 🔒 表示になり、クリックするとセットアップ画面へ案内します</li>
              <li>下部にGPU名・ライブラリの本数・搭載メモリを表示(メモリはモデル切替時のオフロード用に64GB推奨)</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="🧰" title="セットアップ">
            <H>① 環境診断</H>
            <UL>
              <li>GPU/VRAM・システムRAM・ディスク空きを自動診断します。VRAM 12GB未満の場合は軽量モデル(Wan2.2 5B / Cosmos 2B)の利用を推奨する警告が出ます</li>
            </UL>
            <H>② インストール先(データフォルダ)</H>
            <UL>
              <li>エンジン・モデル・生成動画の保存先です(既定 C:\MCS-Data)。短いパスを推奨(Windowsの260文字制限対策)</li>
              <li>ダウンロード・生成・書き出しの実行中は変更できません</li>
              <li>変更しても既存ファイルは移動されません(モデルを再ダウンロードするか手動で移動してください)</li>
              <li>ドライブ直下(例 D:\)を選んだ場合は自動的に「MCS-Data」フォルダが作られます</li>
            </UL>
            <H>③ エンジンとツール</H>
            <UL>
              <li><b>ComfyUI(生成エンジン)</b> — 動画生成の本体。動作検証済みバージョンに固定されています(約2GB DL・展開後約7GB)</li>
              <li><b>ffmpeg / ffprobe</b> — 編集・書き出しに必要(約150MB)</li>
              <li><b>プロンプト変換AI(任意)</b> — 日本語→そのモデルに最適な英語プロンプトへ変換。CPUで動作しGPUは使いません(約2.6GB DL・RAM約4GB使用)</li>
              <li>安全のためインストールは同時に1つずつ。動画の生成・書き出し中は(再)インストールできません</li>
            </UL>
            <H>④ 動画生成モデル</H>
            <UL>
              <li>カードには「推奨」バッジ・最低VRAM・容量・ライセンス名を表示。ダウンロードにはライセンス確認への同意が必要です</li>
              <li><b>VRAMによる制限</b>スイッチ: ONのとき、このPCのVRAMで実用にならないモデルのダウンロードをブロックします。OFFで解除できますが自己責任です(対象外モデルのダウンロードを開始すると、ONに戻せなくなります)</li>
              <li>複数パックの同時ダウンロード可。共通ファイル(テキストエンコーダ・VAE・高速化LoRA等)は重複ダウンロードされません</li>
              <li>共通ファイルの進捗は、それを使う<b>すべてのモデルのカードに表示されます</b>。ダウンロードボタンを押していないモデルのバーが進んで見えるのはこのためで、そのモデル自体が自動でダウンロードされることはありません(🔗マークの注記があるモデルが対象)</li>
              <li>各ファイル行の「キャンセル」でそのパックのダウンロードを停止できます。「ダウンロード再開」で続きから再開(ダウンロード済み部分は保持されます)</li>
              <li>回線エラーは自動で再試行されます(最大3周)。全ファイルはSHA256で完全性検証されます</li>
              <li>カスタムノードを使うモデル(CogVideoX / Fun Control)は、先にComfyUIのインストールが必要です</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="🎬" title="生成画面の共通操作(8画面共通)">
            <H>基本の流れ</H>
            <OL>
              <li>上部のタブで「テキストから (T2V)」「画像から (I2V)」等のモードを選択(対応画面のみ)</li>
              <li>プロンプトを入力。日本語のままでも生成できますが、「✨ 日本語から変換」でそのモデルに最適な英語へ自動変換されます(要: プロンプト変換AI)。変換後は「送信されるプロンプト」欄で確認でき、「戻す」で元に戻せます</li>
              <li>「📚 プリセット」から完成度の高いプロンプト例を選べます(T2V/I2V別・カテゴリ別・検索可)。画面ごとのチップ(カメラ・照明・動き等)をクリックすると英語フレーズが自動追記されます</li>
              <li>解像度・長さ(フレーム数)・シードを設定。シードは「固定」にすると同じ構図で再現・微調整ができます</li>
              <li>「🎬 生成開始」。ボタンが押せないときは、ボタンの下に理由が表示されます(画像未選択・モデル未導入など)</li>
            </OL>
            <H>生成キュー(画面下部)</H>
            <UL>
              <li>状態(待機中→準備中→生成中→保存中→完了)とステップ進捗を表示。「中止」で停止できます</li>
              <li>完了すると自動でライブラリに登録され、「ライブラリへ」ボタンで移動できます</li>
              <li>生成の実行中は他の画面へ移動できません(生成キューから中止すれば移動可)</li>
            </UL>
            <H>ネガティブプロンプト</H>
            <UL>
              <li>「ネガティブプロンプト」を開くと編集できます。各モデルに公式推奨値が設定済みのため、通常は変更不要です</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="🎨" title="AnimeGen — アニメ・イラストを動かす">
            <UL>
              <li>イラストを動かす<b>I2V</b>が主役。画像を選び、「✨ 動きビルダー」のチップ(まばたき・髪揺れ・振り向く等)を選ぶだけで生成できます</li>
              <li>プロンプト先頭に「Japanese anime style」が自動付与されます(公式推奨・チェックで無効化可)</li>
              <li>⚡ 高速モード(lightning・公式推奨設定)が既定。高品質モードは時間がかかりますが精細です</li>
              <li>コツ: 動きは1〜2種類に絞ると画風が安定します。手指・目の崩れは再生成やシード変更で改善することがあります</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="🎬" title="Wan2.2 — シネマティック映像">
            <UL>
              <li>モデルは <b>A14B</b>(高品質・MoE)と <b>TI2V-5B</b>(軽量・低VRAM)を選択できます(導入済みのもののみ)</li>
              <li>「🎥 シネマティック・ビルダー」でカメラワーク・構図・照明・カラーグレード・レンズを日本語チップから選ぶと英語プロンプトに合成されます</li>
              <li>おすすめの流れ: ⚡高速モード(4ステップ)で構図を試作 → 気に入ったらシードを固定して高品質モード(20ステップ)で本番</li>
              <li>プロンプトは「シーン描写→カメラ→被写体の動き→照明・色調」の順で80〜120語が目安</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="🌊" title="HunyuanVideo — 激しい動き・物理表現">
            <UL>
              <li>品質モード: <b>720p 標準</b>(T2V/I2V)と <b>480p 高速プレビュー</b>(蒸留版・I2Vのみ)。480pで構図確認→720pで本番が効率的です</li>
              <li>🔍 <b>1080p 超解像(SR)</b>をONにすると、720p生成後に1080pへ高精細化します</li>
              <li>動きは「まず→次に→最後に」と時系列で書くと正確に再現されます。物理現象は英語名で明示(water splashing 等)が有効</li>
              <li>720p×121フレームはVRAM 24GBでは処理できず停止します。61フレームにするか、480pプレビューをご利用ください(画面上にも警告が表示されます)</li>
              <li>ライセンス注意: EU・英国・韓国では利用不可/生成物のAI開示が必要(詳細はライセンス画面)</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="🧍" title="CogVideoX — キャラ画像を顔を変えずに動かす">
            <UL>
              <li>最初のフレームに入力画像がそのまま使われるため、1フレーム目は完全に一致します</li>
              <li>モデル仕様で<b>720x480固定</b>。縦長画像は「余白を追加(推奨)/中央クロップ/引き伸ばし」のいずれかで収めます。縦動画を作りたい場合は Wan2.2 / AnimeGen をご利用ください</li>
              <li>「動きの強さ」3段階: 忠実重視(動き最小)⇔ 動き重視(顔が変わりやすい)。「📌 アイデンティティ固定」をONにすると最終フレームも同じ画像になり、顔はさらに安定します(動きは減ります)</li>
              <li>🐢 省VRAMモード: VRAM 12GB級GPU向け(低速になります)</li>
              <li>動きが出ないとき: ①動きの強さを上げる ②プロンプトを長く具体的に(✨変換ボタンで拡張)③静止指定を外す ④ステップ数を50に</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="🚁" title="CosmoVideo — 空撮・背景映像(Built on NVIDIA Cosmos)">
            <UL>
              <li>T2Vは「①プロンプト→静止画生成 ②その画像を動画化」の2段構成を自動実行します。手持ちの画像から直接動画化(I2V)も可能です</li>
              <li>「🚁 空撮ビルダー」にドローン前進・渓谷フライスルー等のプリセットがあります</li>
              <li>プロンプトは長文が有効。地形・光・カメラの動きを具体的に書くほど物理的に正確になります(NVIDIA公式の長文ネガティブプロンプトを自動適用)</li>
              <li>人物のアップやアニメ調は苦手です — その用途は Wan2.2 / AnimeGen へ</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="🎵" title="LTX-2.3 — 動画と音声を同時生成">
            <UL>
              <li>モード: <b>🎵 音声付き映像 (MV)</b> と <b>🗣️ 喋るアバター</b></li>
              <li>MVモード: プロンプトに映像と「音」の両方を書きます(例: 曲調・環境音・セリフ)。チップに音楽・環境音の例があります</li>
              <li>アバターモード: 顔画像+音声ファイル(mp3/wav等)を指定すると、音声にリップシンクした喋る動画を生成します</li>
              <li>蒸留モデルの高速設定(固定ステップ)で動作するため、ステップ数やCFGの調整は不要です</li>
              <li>初回はモデル(約29GB)のロードに数分かかります。編集画面で「クリップ本来の音声を残す」をONにすると生成音声を書き出しに使えます</li>
              <li>ライセンス注意: 年商1,000万ドル未満は商用可(詳細はライセンス画面)</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="🎛️" title="Fun Control — 線画・ポーズ・深度で動きを指定">
            <UL>
              <li><b>制御動画</b>(動きの見本となる既存動画)をアップロードし、制御の種類を選びます: 線画(輪郭)/ポーズ(人物の骨格)/深度(奥行き)。いずれも制御動画から自動抽出されるため、ポーズ等を手で指定する必要はありません</li>
              <li>プロンプトには「動き」ではなく<b>見た目</b>(被写体・服装・背景・画風)を書きます — 動きは制御動画が決めます</li>
              <li>参照画像(任意)で1フレーム目の見た目を指定できます</li>
              <li>モデルは 5B(軽量・高速)と A14B(高品質・低速)。制御動画が指定フレーム数より短い場合、足りない部分は制御なしの自由生成になります</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="🎭" title="MiniMax H3 — 映像と音声を同時生成するオムニモーダル">
            <H>モード</H>
            <UL>
              <li><b>T2V / I2V</b>(標準モデル): テキストまたは画像から、音声付き動画を生成。I2Vでは<b>最後のフレーム</b>(任意)も指定でき、「最初→最後」をつなぐ動画になります</li>
              <li><b>リファレンス (R2V)</b>(専用モデル・別途ダウンロード): 参照メディアを添付して生成 — 画像 最大9枚 / 動画 最大3本 / 音声 最大3つ(合計12個まで)</li>
            </UL>
            <H>リファレンスの使い方</H>
            <UL>
              <li>参照ファイルはプロンプト内で <b>{'<Picture 1>'}</b> <b>{'<Video 1>'}</b> <b>{'<Audio 1>'}</b> のタグで指定します(追加すると表示される「タグを挿入」ボタンが便利)</li>
              <li>歌わせる/喋らせる: 人物画像+音声を追加し「{'<Picture 1>'}の人物が{'<Audio 1>'}に合わせて歌う」のように書くとリップシンクします</li>
              <li><b>音声参照には画像または動画の同伴が必須</b>です(音声だけでは生成できません)</li>
              <li>参照動画は自動で24fps・最大15秒・無音に変換されます(動きやカメラワークの参照用)。音はプロンプトで記述するか音声参照で渡します</li>
              <li>「参照画像の解像度」を「最大」にすると顔の再現性が上がりますが、数倍遅くなります</li>
            </UL>
            <H>注意</H>
            <UL>
              <li>映像と一緒に<b>ステレオ音声</b>(セリフ・効果音・BGM)が生成されます。音の内容もプロンプトに書いてください(このモデルにネガティブプロンプトはありません)</li>
              <li>33Bの大型モデルのため生成は低速です(5秒で十数分〜)。初回はモデルロードで数分間進捗が止まって見えますが正常です</li>
              <li>解像度は768pクラス(短辺768px)です。2K生成モジュールは未公開のため搭載していません</li>
              <li>ライセンス注意: <b>EU・英国・韓国・米国では使用不可</b>/生成物で他のAIモデルの学習禁止/AI生成の開示義務(詳細はライセンス画面)</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="🗂️" title="ライブラリ">
            <UL>
              <li>生成した動画がモデル名・プロンプト・シード・全設定と共に自動登録されます</li>
              <li>上部で モデル別フィルタ / ⭐お気に入り / プロンプト・タグ検索 ができます。「📁 フォルダで表示」で保存フォルダを開けます</li>
              <li>サムネイルの ⭐ でお気に入り、☑で編集用に複数選択 →「✂️ 選択した動画を編集(つなげる)」</li>
              <li>動画をクリックすると詳細パネル: 再生 / タグ編集(カンマ区切り)/ 「🎲 別シードで再生成」「同じ設定で再生成」(元の生成画面に設定を復元)/ 「✂️ 編集・書き出しへ」 / 削除(ディスクからも削除)</li>
              <li>モデルを削除・未導入の状態では再生成できません(セットアップで該当モデルを導入すると再度可能)</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="✂️" title="編集・書き出し">
            <H>クリップ(結合)</H>
            <UL>
              <li>ライブラリで選択した動画が上から順に結合されます。「+ ライブラリから追加」で追加、各クリップの「開始/終了」で切り出し(終了 0 = 末尾まで)</li>
              <li>「クリップ本来の音声を残す」をONにすると、LTX-2.3の生成音声などがBGMとミックスされます(音声のないクリップは無音扱い)</li>
            </UL>
            <H>BGM・テロップ・フェード</H>
            <UL>
              <li>BGM: 音声ファイルを選択し、音量・開始位置(動画の何秒目から鳴らすか)・ループを設定</li>
              <li>💬 テロップ: 複数追加可。テキスト・表示の開始/終了秒・位置(上/中央/下)を指定(終了は開始より後に)</li>
              <li>🌅 フェード: 映像と音のフェードイン/アウト秒数</li>
            </UL>
            <H>📤 SNS向け書き出し</H>
            <UL>
              <li>プリセット: YouTube(1080p/4K)/ YouTube Shorts / TikTok / Instagram リール・フィード / X(Twitter)/ 元解像度のまま60fps化 など。SNSの長さ上限を超えると警告が出ます</li>
              <li>アスペクト比が合わないとき: 「ぼかし背景で埋める」または「中央クロップ」を選択</li>
              <li>「フレーム補間でなめらかに」: 低fpsの生成動画(8〜16fps)を滑らかにします(時間がかかります)</li>
              <li>AI生成コンテンツの開示: 各SNSの規約に従い投稿時に開示設定をしてください。動画メタデータにはAI生成の注記が自動で埋め込まれます</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="⚙️" title="設定">
            <UL>
              <li><b>データフォルダ</b>: 保存先の確認・変更(実行中の処理があるときは変更不可。既存ファイルは移動されません)</li>
              <li><b>NVENC ハードウェアエンコード</b>: 書き出しを高速化(推奨ON)</li>
              <li><b>HuggingFace ミラー</b>: 通常は空欄。ダウンロードが著しく遅い/失敗する環境でのみ設定(空欄で保存すると解除)</li>
              <li><b>エンジン(ComfyUI)</b>: 状態表示と手動の起動/停止。通常は生成時に自動起動するため操作不要です。「📁 ログフォルダを開く」でトラブル時のログを確認できます</li>
            </UL>
          </ScreenDoc>

          <ScreenDoc icon="📜" title="ライセンス">
            <UL>
              <li>各モデルの商用利用条件・地域制限・注意事項の要約と、ライセンス全文へのリンクがあります。<b>商用利用の前に必ず確認してください</b></li>
              <li>本アプリ本体(MIT)・ComfyUI(GPL-3.0・別プロセス)・FFmpeg(GPL・別プロセス)などの構成も記載しています</li>
            </UL>
          </ScreenDoc>
        </div>
      </Section>

      {/* ④ インストールと削除 */}
      <Section id="help-install" title="④ インストールとアンインストール">
        <H>インストール</H>
        <OL>
          <li>「Movie Creator Studio Setup x.x.x.exe」を実行します</li>
          <li>Windows SmartScreenの警告が出た場合は「詳細情報」→「実行」を選択してください(コード署名を行っていないためです)</li>
          <li>インストール先を選んで進めます(アプリ本体のみ。モデル等は含まれません)</li>
          <li>初回起動後、セットアップ画面からエンジン・モデルを導入します(上記「② はじめての使い方」)</li>
        </OL>
        <H>アップデート</H>
        <UL>
          <li>
            新しいバージョンが公開されると<b>自動的にバックグラウンドでダウンロード</b>され、通知が表示されます。適用はアプリを終了したタイミングで行われます(生成・書き出しの実行中に勝手に再起動することはありません)
          </li>
          <li>更新してもデータ・設定・ダウンロード済みモデルはそのまま引き継がれます</li>
          <li>手動で更新する場合は、新しいインストーラーを実行して上書きインストールしてください(アンインストールは不要です)</li>
        </UL>
        <H>アンインストール</H>
        <OL>
          <li>Windowsの「設定 → アプリ → インストールされているアプリ」から Movie Creator Studio を選んでアンインストール</li>
          <li>
            確認ダイアログで削除範囲を選択します:
            <UL>
              <li><b>「はい」= 完全削除</b> — ダウンロードしたモデル・生成した動画・設定をすべて削除し、インストール前の状態に戻します</li>
              <li><b>「いいえ」= アプリ本体のみ削除</b> — データは残り、再インストールすればそのまま使えます</li>
            </UL>
          </li>
        </OL>
        <UL>
          <li>完全削除の対象は、データフォルダ内で<b>アプリが作成したサブフォルダのみ</b>(engine / models / ffmpeg / llm / work / library / exports)。同じ場所にご自身で置いたファイルは削除されません</li>
          <li>インストール先も同様に、削除されるのは<b>インストーラーが作成したものだけ</b>です。インストール前から存在していたフォルダを選んでいた場合、そのフォルダとご自身のファイルは残ります(アプリの実行ファイル等のみ削除されます)</li>
          <li>「いいえ」を選んで後からデータだけ消す場合: データフォルダ(既定 C:\MCS-Data)と %APPDATA%\movie-creator-studio を手動で削除してください</li>
        </UL>
      </Section>

      {/* ⑤ 制限事項 */}
      <Section id="help-limits" title="⑤ 制限事項・注意事項">
        <H>環境</H>
        <UL>
          <li>NVIDIA GPU 専用です(AMD / Intel GPU・CPUのみの環境では生成できません)</li>
          <li>モデルごとに最低VRAMがあります(セットアップ画面のカードに表示)。「VRAMによる制限」をOFFにして対象外モデルを使うと、生成が極端に遅い・途中で停止する場合があります</li>
          <li>初回の生成はモデルのロードで数分かかることがあります。2回目以降は高速です</li>
        </UL>
        <H>操作上の制限(安全のための仕様)</H>
        <UL>
          <li>動画の生成中は他の画面へ移動できません(生成キューから中止すれば移動可)</li>
          <li>生成・書き出しの実行中は、エンジン/ツールの再インストールとデータフォルダの変更ができません</li>
          <li>モデルのダウンロード中は、そのモデルの生成画面には入れません(完了後に解放)</li>
          <li>CogVideoX は仕様上 720x480(横)固定で、縦動画は作れません</li>
          <li>LTX-2.3 はステップ数・CFGが最適値に固定されています(調整UIなし)</li>
        </UL>
        <H>ライセンス・公開時の注意</H>
        <UL>
          <li>モデルごとに商用条件が異なります: HunyuanVideo(EU・英国・韓国で利用不可 / AI開示義務)、CogVideoX(商用はZhipu AIへの無料登録)、Cosmos(「Built on NVIDIA Cosmos」表記)、LTX-2.3(年商1,000万ドル未満)。<b>詳細は必ずライセンス画面で確認してください</b></li>
          <li>YouTube・TikTok・Instagram等へ投稿する際は、各SNSの規約に従い「AI生成」の開示設定を行ってください</li>
          <li>実在の人物の画像・音声を本人の同意なく使用しないでください</li>
        </UL>
      </Section>

      {/* ⑥ トラブルシューティング */}
      <Section id="help-trouble" title="⑥ 困ったときは(トラブルシューティング)">
        <div>
          <div className="grid grid-cols-[210px_1fr] gap-3 pb-1 text-[11px] font-bold text-slate-500">
            <div>症状</div>
            <div>対処</div>
          </div>
          <TR s="モデルのダウンロードが失敗する/止まる">
            回線エラーは自動で再試行されます。止まったままの場合は「ダウンロード再開」(続きから再開されます)。
            それでも失敗する場合はディスク空き容量を確認し、時間をおいて再試行してください。プロキシ環境では設定画面のHFミラーも検討を。
          </TR>
          <TR s="「fetch failed」「GitHub への接続に失敗」と表示される">
            一時的な回線混雑です。他のダウンロードが完了してから、再度「インストール」を押してください。
          </TR>
          <TR s="モデル導入済みなのに生成画面(ナビ)が開けない">
            生成画面は「ComfyUI+ffmpeg+そのモデル」の3点が揃うと解放されます(生成時の入力変換・サムネイル作成にffmpegを使うため)。
            セットアップ画面の「③ エンジンとツール」で未導入のものがないか確認してください。ロック中のメニューにマウスを乗せると理由が表示されます。
          </TR>
          <TR s="エンジンが起動しない/生成開始で失敗する">
            設定画面のエンジン状態を確認し、「📁 ログフォルダを開く」→ comfyui.log を確認。GPUドライバを最新にして、アプリを再起動してください。
          </TR>
          <TR s="VRAM不足(OOM)で生成が止まる">
            解像度・フレーム数を下げる/他のGPU使用アプリ(ゲーム・ブラウザのハードウェアアクセラレーション)を終了。
            モデル切替時は自動でVRAMを解放しますが、改善しない場合はアプリを再起動してください。軽量モデル(5B系)への切替も有効です。
          </TR>
          <TR s="生成が非常に遅い">
            ⚡高速モード(lightning / 蒸留版)を使用してください。初回はモデルロードに数分かかります。VRAM対象外モデルを制限OFFで使っている場合は大幅に遅くなります。
          </TR>
          <TR s="生成結果が乱れる(手指・顔の崩れ等)">
            シードを変えて再生成/動きの指定を減らす/プロンプトに外見の説明を追加(CogVideoXで有効)。AnimeGenは動き1〜2種類が安定します。
          </TR>
          <TR s="「日本語から変換」が使えない">
            セットアップ画面で「プロンプト変換AI」をインストールしてください。動作にはRAM約4GBの空きが必要です。失敗する場合は logs/llm.log を確認。
          </TR>
          <TR s="書き出しが失敗する">
            ffmpegが導入済みか確認(セットアップ画面)。出力先のファイルを他のアプリ(プレーヤー等)で開いたままにしないでください。
          </TR>
          <TR s="画面にエラーが表示された/表示が壊れた">
            エラーカードの「🔄 アプリを再読み込み」を押してください。実行中のダウンロードや生成は中断されません(メイン処理は別プロセスで動作しています)。
          </TR>
          <TR s="アプリが起動しない・すぐ落ちる">
            %APPDATA%\movie-creator-studio\logs\main-crash.log を確認してください。改善しない場合は再インストール(データは保持可能)をお試しください。
          </TR>
          <TR s="ライブラリの動画が再生できない/見つからない">
            ファイルを直接移動・削除した可能性があります。「📁 フォルダで表示」で実体を確認してください。データフォルダを変更した場合、過去のファイルは自動では移動されません。
          </TR>
        </div>
      </Section>

      {/* ⑦ 保存場所 */}
      <Section id="help-locations" title="⑦ データの保存場所">
        <H>データフォルダ(既定 C:\MCS-Data — 設定画面で変更可)</H>
        <UL>
          <li><code>engine\</code> — ComfyUI本体(生成エンジン)</li>
          <li><code>models\</code> — ダウンロードした生成モデル</li>
          <li><code>ffmpeg\</code> / <code>llm\</code> — ffmpeg / プロンプト変換AI</li>
          <li><code>library\</code> — 生成した動画とサムネイル</li>
          <li><code>exports\</code> — SNS向けに書き出した動画の既定出力先</li>
          <li><code>work\</code> — 生成時の一時ファイル</li>
        </UL>
        <H>設定・ログ(%APPDATA%\movie-creator-studio)</H>
        <UL>
          <li><code>settings.json</code> — アプリ設定 / <code>library.json</code> — ライブラリ情報(動画のメタデータ)</li>
          <li><code>logs\comfyui.log</code> — エンジンログ / <code>logs\llm.log</code> — 変換AIログ / <code>logs\main-crash.log</code> — アプリ異常時のログ</li>
        </UL>
        <p className="text-[11px] text-slate-500">
          問い合わせ・不具合報告の際は、症状と合わせて該当ログの内容を添えるとスムーズです。
        </p>
      </Section>
    </div>
  )
}
