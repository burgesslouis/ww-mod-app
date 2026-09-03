import { BookOpen, Clock3, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { GameSession } from '../domain/types'
import { currentState } from '../engine/engine'
import { listSessions } from '../storage/db'
import type { UpdateState } from '../pwa/updates'

export default function HomeScreen({ onNew, onResume, onLibrary, update, onUpdate }: { onNew: () => void; onResume: (session: GameSession) => void; onLibrary: () => void; update: UpdateState; onUpdate: () => void }) {
  const [sessions, setSessions] = useState<GameSession[]>([])
  useEffect(() => { listSessions().then(setSessions) }, [])
  const active = sessions.find((session) => !currentState(session).gameOver)
  return <div className="home-screen">
    <section className="home-panel">
      <h1>Wherewolf moderator</h1>
      <p>Set up players and roles, then record votes and work through night actions and announcements.</p>
      <div className="home-actions">
        {active && <button className="primary home-action" disabled={update.applying} onClick={() => onResume(active)}><Clock3 /><span>Resume game</span><small>{active.roleDeal && !active.roleDeal.finished ? `Dealing roles · ${active.roleDeal.picks.length} / ${active.setup.players.length} ready` : `Day ${currentState(active).cycle} · ${currentState(active).players.filter((player) => player.alive).length} alive`}</small></button>}
        <button className={active ? 'secondary home-action' : 'primary home-action'} disabled={update.applying} onClick={onNew}><Plus /><span>New game</span></button>
        <button className="secondary home-action" disabled={update.applying} onClick={onLibrary}><BookOpen /><span>Roles and rules</span></button>
      </div>
      {update.available && <section className="app-update" aria-label="App update">
        <div role="status"><strong>Update available</strong><p>Reload to use the latest version. Your saved games will stay on this device.</p></div>
        <button className="secondary" disabled={update.applying} onClick={onUpdate}>{update.applying ? 'Updating…' : 'Update now'}</button>
        {update.error && <p role="alert">{update.error}</p>}
      </section>}
    </section>
  </div>
}
