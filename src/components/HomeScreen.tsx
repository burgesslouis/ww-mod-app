import { BookOpen, Clock3, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { GameSession } from '../domain/types'
import { currentState } from '../engine/engine'
import { listSessions } from '../storage/db'

export default function HomeScreen({ onNew, onResume, onLibrary }: { onNew: () => void; onResume: (session: GameSession) => void; onLibrary: () => void }) {
  const [sessions, setSessions] = useState<GameSession[]>([])
  useEffect(() => { listSessions().then(setSessions) }, [])
  const active = sessions.find((session) => !currentState(session).gameOver)
  return <div className="home-screen">
    <section className="home-panel">
      <h1>Wherewolf moderator</h1>
      <p>Set up players and roles, then record votes and work through night actions and announcements.</p>
      <div className="home-actions">
        {active && <button className="primary home-action" onClick={() => onResume(active)}><Clock3 /><span>Resume game</span><small>Day {currentState(active).cycle} · {currentState(active).players.filter((player) => player.alive).length} alive</small></button>}
        <button className={active ? 'secondary home-action' : 'primary home-action'} onClick={onNew}><Plus /><span>New game</span></button>
        <button className="secondary home-action" onClick={onLibrary}><BookOpen /><span>Roles and rules</span></button>
      </div>
    </section>
  </div>
}
