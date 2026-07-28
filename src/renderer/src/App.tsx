import { Component, useEffect, type ReactNode } from 'react'
import type { ModelFamily } from '@shared/types'
import { useApp } from './store'
import { editorReady, familyReady } from './lib/ready'
import Sidebar from './components/Sidebar'
import JobsPanel from './components/JobsPanel'
import HomeScreen from './screens/HomeScreen'
import SetupScreen from './screens/SetupScreen'
import Wan22Screen from './screens/gen/Wan22Screen'
import AnimeGenScreen from './screens/gen/AnimeGenScreen'
import HunyuanScreen from './screens/gen/HunyuanScreen'
import CogVideoScreen from './screens/gen/CogVideoScreen'
import CosmosScreen from './screens/gen/CosmosScreen'
import Ltx2Screen from './screens/gen/Ltx2Screen'
import WanFunScreen from './screens/gen/WanFunScreen'
import LibraryScreen from './screens/LibraryScreen'
import EditorScreen from './screens/EditorScreen'
import SettingsScreen from './screens/SettingsScreen'
import LicensesScreen from './screens/LicensesScreen'
import HelpScreen from './screens/HelpScreen'

const GEN_SCREENS: Record<string, ModelFamily> = {
  animegen: 'animegen',
  wan22: 'wan22',
  hunyuan15: 'hunyuan15',
  cogvideox: 'cogvideox',
  cosmos: 'cosmos',
  ltx2: 'ltx2',
  wanfun: 'wanfun'
}

/**
 * A render error in one screen must not white-screen the whole app —
 * show a recoverable fallback instead. Keyed by screen so navigating
 * away (sidebar stays alive) automatically retries a clean mount.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }
  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="p-8 max-w-xl mx-auto">
          <div className="card p-5 border-rose-800 bg-rose-950/30 space-y-3">
            <div className="font-bold text-rose-300">画面の表示中にエラーが発生しました</div>
            <div className="text-xs text-slate-400 whitespace-pre-wrap break-all">
              {String(this.state.error)}
            </div>
            <div className="text-xs text-slate-400">
              他の画面へは左のメニューから移動できます。解決しない場合は再読み込みしてください。
            </div>
            <button className="btn-primary text-sm" onClick={() => window.location.reload()}>
              🔄 アプリを再読み込み
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App(): React.JSX.Element {
  const { screen, init, setScreen, setupStatus, catalog } = useApp()

  useEffect(() => {
    void init()
  }, [init])

  // never show a screen whose prerequisites are missing
  useEffect(() => {
    if (!setupStatus) return
    const family = GEN_SCREENS[screen]
    if (family && !familyReady(family, setupStatus, catalog)) setScreen('home')
    if (screen === 'editor' && !editorReady(setupStatus)) setScreen('home')
  }, [screen, setupStatus, catalog, setScreen])

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ErrorBoundary key={screen}>
          {screen === 'home' && <HomeScreen />}
          {screen === 'setup' && <SetupScreen />}
          {screen === 'wan22' && <Wan22Screen />}
          {screen === 'animegen' && <AnimeGenScreen />}
          {screen === 'hunyuan15' && <HunyuanScreen />}
          {screen === 'cogvideox' && <CogVideoScreen />}
          {screen === 'cosmos' && <CosmosScreen />}
          {screen === 'ltx2' && <Ltx2Screen />}
          {screen === 'wanfun' && <WanFunScreen />}
          {screen === 'library' && <LibraryScreen />}
          {screen === 'editor' && <EditorScreen />}
          {screen === 'settings' && <SettingsScreen />}
          {screen === 'licenses' && <LicensesScreen />}
          {screen === 'help' && <HelpScreen />}
          </ErrorBoundary>
        </div>
        <ErrorBoundary key="jobs-panel">
          <JobsPanel />
        </ErrorBoundary>
      </main>
    </div>
  )
}
