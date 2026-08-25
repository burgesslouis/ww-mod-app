import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, ChevronLeft, Home as HomeIcon, Moon, Plus } from 'lucide-react'
import { BASE_PACK, BASE_ROLES, BASE_SCENARIO } from './data/base'
import { DARKEST_NIGHT_PACK, HIDDEN_MOTIVES_PACK, OFFICIAL_SCENARIO } from './data/expansions'
import type { GameSession, PackDefinition, RoleDefinition, ScenarioDefinition, TraitDefinition } from './domain/types'
import { applyToSession, createSession, currentState, redo, undo } from './engine/engine'
import { listArtifacts, saveSession, seedBuiltIns } from './storage/db'
import HomeScreen from './components/HomeScreen'
import SetupWizard from './components/SetupWizard'
import GameView from './components/GameView'
import Library from './components/Library'
import Editor from './components/Editor'

type Screen = 'home' | 'setup' | 'game' | 'library' | 'editor'
const logoUrl = `${import.meta.env.BASE_URL}lantern-logo.png`
type Artifact = RoleDefinition | PackDefinition | ScenarioDefinition

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [session, setSession] = useState<GameSession | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [editArtifact, setEditArtifact] = useState<Artifact | null>(null)
  const [ready, setReady] = useState(false)

  const refreshArtifacts = useCallback(async () => setArtifacts(await listArtifacts()), [])
  useEffect(() => { seedBuiltIns().then(refreshArtifacts).finally(() => setReady(true)) }, [refreshArtifacts])

  const roles = useMemo(() => {
    const all = artifacts.filter((artifact) => !artifact.meta.unavailableReasons?.length).flatMap((artifact): RoleDefinition[] => 'faction' in artifact ? [artifact] : 'roles' in artifact ? artifact.roles : artifact.packs.flatMap((pack) => pack.roles))
    return [...new Map([...BASE_ROLES, ...DARKEST_NIGHT_PACK.roles, ...HIDDEN_MOTIVES_PACK.roles, ...all].map((role) => [role.id, role])).values()]
  }, [artifacts])
  const packs = useMemo(() => {
    const available = artifacts.filter((item) => !item.meta.unavailableReasons?.length)
    const embedded = available.filter((item): item is ScenarioDefinition => 'packs' in item).flatMap((scenario) => scenario.packs)
    return [...new Map([BASE_PACK, DARKEST_NIGHT_PACK, HIDDEN_MOTIVES_PACK, ...available.filter((item): item is PackDefinition => 'roles' in item), ...embedded].map((pack) => [pack.id, pack])).values()]
  }, [artifacts])
  const scenarios = useMemo(() => [...new Map([OFFICIAL_SCENARIO, BASE_SCENARIO, ...artifacts.filter((item): item is ScenarioDefinition => 'packs' in item && !item.meta.unavailableReasons?.length)].map((scenario) => [scenario.id, scenario])).values()], [artifacts])
  const traits = useMemo(() => {
    const catalogue = new Map<string, TraitDefinition>()
    roles.flatMap((role) => role.traitDefinitions ?? []).forEach((trait) => catalogue.set(trait.id, trait))
    roles.flatMap((role) => role.traits).forEach((id) => { if (!catalogue.has(id)) catalogue.set(id, { id, label: id.split('.').at(-1)?.replace(/-/g, ' ') ?? id, colour: '#8c857b' }) })
    return [...catalogue.values()].sort((left, right) => left.label.localeCompare(right.label))
  }, [roles])

  async function openSession(next: GameSession) { setSession(next); setScreen('game'); await saveSession(next) }
  async function updateSession(next: GameSession) { setSession(next); await saveSession(next) }
  function openEditor(artifact: Artifact) { setEditArtifact(artifact); setScreen('editor') }

  if (!ready) return <div className="boot"><img src={logoUrl} alt="" /><p>Lighting the lantern…</p></div>

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setScreen('home')} aria-label="Wherewolf home">
          <img src={logoUrl} alt="" /><span>WHEREWOLF</span><small>MODERATOR</small>
        </button>
        {screen !== 'home' && <button className="icon-button desktop-back" onClick={() => setScreen(screen === 'editor' ? 'library' : 'home')}><ChevronLeft size={18} /> Back</button>}
        <div className="offline-pill"><span /> Offline ready</div>
      </header>

      <main className={`main-content screen-${screen}`}>
        {screen === 'home' && <HomeScreen onNew={() => setScreen('setup')} onResume={openSession} onLibrary={() => setScreen('library')} />}
        {screen === 'setup' && <SetupWizard roles={roles} packs={packs} scenarios={scenarios} onCancel={() => setScreen('home')} onStart={(setup) => openSession(createSession(setup, `${new Date().toLocaleDateString()} game`))} />}
        {screen === 'game' && session && <GameView session={session} roles={roles} onChange={updateSession} onExit={() => setScreen('home')} onUndo={() => updateSession(undo(session))} onRedo={() => updateSession(redo(session))} onCommand={(command) => updateSession(applyToSession(session, command))} />}
        {screen === 'library' && <Library artifacts={artifacts} roles={roles} packs={packs} scenarios={scenarios} traitCatalogue={traits} onRefresh={refreshArtifacts} onEdit={openEditor} />}
        {screen === 'editor' && editArtifact && <Editor artifact={editArtifact} traitCatalogue={traits} onSaved={async (artifact) => { await refreshArtifacts(); setEditArtifact(artifact) }} onClose={() => setScreen('library')} />}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <button className={screen === 'home' ? 'active' : ''} onClick={() => setScreen('home')}><HomeIcon /><span>Home</span></button>
        <button className={screen === 'game' ? 'active' : ''} disabled={!session} onClick={() => session && setScreen('game')}><Moon /><span>Game</span></button>
        <button className={screen === 'setup' ? 'active' : ''} onClick={() => setScreen('setup')}><Plus /><span>New</span></button>
        <button className={screen === 'library' || screen === 'editor' ? 'active' : ''} onClick={() => setScreen('library')}><BookOpen /><span>Rules</span></button>
      </nav>
    </div>
  )
}
