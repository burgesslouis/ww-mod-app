import { AlertTriangle, ArrowRight, Check, ChevronDown, ChevronUp, Eye, History, RotateCcw, RotateCw, Settings2, Skull, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { GameCommand, GameSession, RoleDefinition } from '../domain/types'
import { availableCommand, currentState, effectiveProperties, factionName } from '../engine/engine'

interface Props {
  session: GameSession; roles: RoleDefinition[]; onChange: (session: GameSession) => void; onExit: () => void
  onUndo: () => void; onRedo: () => void; onCommand: (command: GameCommand) => void
}

export default function GameView({ session, roles, onExit, onUndo, onRedo, onCommand }: Props) {
  const state = currentState(session), pending = availableCommand(state)
  const [selected, setSelected] = useState<string[]>([])
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const [acceptMismatch, setAcceptMismatch] = useState(false)
  const [showRoster, setShowRoster] = useState(false)
  const [showTrace, setShowTrace] = useState(false)
  const [showOverride, setShowOverride] = useState(false)
  const [showPublic, setShowPublic] = useState(false)

  const commandKey = pending.type === 'choose' ? `choose:${pending.actorId}:${pending.abilityId}` : pending.type === 'vote' ? `vote:${state.phaseId}:${pending.candidates.join(',')}` : pending.type === 'advance' ? `advance:${state.phaseId}:${pending.title}` : `game-over:${pending.winners.join(',')}`
  useEffect(() => { setSelected([]); setError(''); setAcceptMismatch(false); setTotals(pending.type === 'vote' ? pending.existing : {}) }, [commandKey])
  const alive = state.players.filter((player) => player.alive)
  const currentTotals = pending.type === 'vote' ? Object.fromEntries(pending.candidates.map((id) => [id, Number(totals[id] ?? 0)])) : {}
  const entered = Object.values(currentTotals).reduce((sum, value) => sum + value, 0)
  const expected = pending.type === 'vote' ? pending.expected : 0
  const voteProgress = expected > 0 ? Math.min(100, (entered / expected) * 100) : entered === 0 ? 100 : 0
  const roleFor = (id: string) => state.rules.roles.find((role) => role.id === id) ?? roles.find((role) => role.id === id)
  const label = (id: string): string => state.players.find((player) => player.id === id)?.name ?? roleFor(id)?.meta.name ?? id.split('.').at(-1) ?? id
  const factionLabel = (id: string): string => factionName(state, id)
  const victoryMessage = [...state.events].reverse().find((event) => event.type === 'victory.check' && event.visibility === 'public')?.message.replace(/^Game over\.\s*/, '')
  const formatList = (items: string[]): string => items.length < 2 ? items[0] ?? '' : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`

  function submit(command: GameCommand) { try { setError(''); onCommand(command) } catch (caught) { setError(caught instanceof Error ? caught.message : 'That command could not be applied.') } }
  function toggleTarget(id: string) {
    if (pending.type !== 'choose') return
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < pending.max ? [...current, id] : pending.max === 1 ? [id] : current)
  }
  function submitVote() {
    if (entered !== expected && !acceptMismatch) { setError(`Entered ${entered} votes; expected ${expected}. Recount, or accept this mismatch permanently.`); return }
    submit({ type: 'vote', totals: currentTotals, acceptInvalid: entered !== expected && acceptMismatch })
  }

  const phaseLabel = state.pipeline === 'setup' ? 'FIRST NIGHT' : state.phaseId.includes('day') ? `DAY ${state.cycle}` : state.phaseId.includes('morning') ? `MORNING ${state.cycle + 1}` : `NIGHT ${state.cycle}`

  return <div className="game-page">
    <div className="game-statusbar"><div><span className="pulse" /><strong>{phaseLabel}</strong><small>{state.rules.scenario.meta.name}</small></div><div><Users /> {alive.length} alive</div></div>
    <div className="game-layout">
      <aside className={`secret-roster ${showRoster ? 'open' : ''}`}>
        <header><div><span className="eyebrow">CURRENT GAME</span><h2>Player roster</h2></div><button className="icon-button mobile-only" onClick={() => setShowRoster(false)}><X /></button></header>
        <div className="roster-list">{state.players.map((player) => {
          const properties = effectiveProperties(state, player.id)
          return <article key={player.id} className={!player.alive ? 'dead' : ''}>
            <div className="roster-identity"><div className="avatar">{player.name.slice(0, 1).toUpperCase()}</div><div><strong>{player.name}</strong><span>{roleFor(player.roleId)?.meta.name ?? player.roleId}</span></div>{!player.alive && <Skull />}</div>
            <details className="current-properties"><summary>Current properties <ChevronDown /></summary><div>{properties.map((property) => <span className={`property-chip ${property.kind}`} style={property.colour ? { borderColor: property.colour } : undefined} key={property.id}>{property.label}</span>)}</div></details>
          </article>
        })}</div>
        <button className="secondary full" onClick={() => setShowPublic(true)}><Eye /> Read-aloud role list</button>
      </aside>

      <section className="command-stage">
        <div className="command-topline"><button className="icon-button mobile-only" onClick={() => setShowRoster(true)}><Users /> Roster</button><div className="history-actions"><button className="icon-button" onClick={onUndo} disabled={session.cursor <= 0} title="Undo"><RotateCcw /></button><button className="icon-button" onClick={onRedo} disabled={session.cursor >= session.snapshots.length - 1} title="Redo"><RotateCw /></button><button className="icon-button" onClick={() => setShowTrace(true)}><History /> History</button><button className="icon-button" onClick={() => setShowOverride(true)}><Settings2 /> Override</button></div></div>

        <div className={`phase-card ${pending.type === 'game-over' ? 'game-over-card' : ''}`}>
          <span className="eyebrow">{pending.type === 'choose' ? 'ROLE ACTION' : pending.type === 'vote' ? 'VOTE' : pending.type === 'game-over' ? 'GAME OVER' : 'NEXT STEP'}</span>
          <h1>{pending.title}</h1>
          {pending.type === 'choose' && <>
            <p className="phase-instruction">{pending.instructions}</p>
            {(pending.participantIds?.length || pending.information?.length) && <div className="wake-together">{pending.participantIds?.length && <><span>{pending.participantIds.length > 1 ? 'WAKE TOGETHER' : 'WAKE THIS PLAYER'}</span><div className="wake-participants">{pending.participantIds.map((id) => <strong key={id}>{label(id)}</strong>)}</div></>}{pending.information?.length && <div className="action-information">{pending.information.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.status === 'in-play' ? 'In play' : 'Not in play'}</small></div>)}</div>}</div>}
            <div className="target-grid">{pending.candidates.map((id) => <button key={id} className={selected.includes(id) ? 'selected' : ''} onClick={() => toggleTarget(id)}><span>{selected.includes(id) ? <Check /> : label(id).slice(0, 1)}</span><strong>{label(id)}</strong>{state.players.some((player) => player.id === id) && <small>{state.players.find((player) => player.id === id)?.alive ? 'Alive' : 'Dead'}</small>}</button>)}</div>
            {!pending.candidates.length && pending.max > 0 && <div className="empty-action">There are no legal targets. Confirm to record that this action had no effect.</div>}
            <button className="primary command-button" disabled={selected.length < pending.min || selected.length > pending.max} onClick={() => submit({ type: 'choose', actorId: pending.actorId, abilityId: pending.abilityId, targets: selected })}>{selected.length ? `Confirm ${selected.length} selection${selected.length === 1 ? '' : 's'}` : pending.max === 0 ? 'Confirm' : 'Confirm no target'} <ArrowRight /></button>
          </>}
          {pending.type === 'vote' && <>
            <p className="phase-instruction">Enter the votes received by each candidate. Role abilities are applied after the total is checked.</p>
            <div className={`vote-meter ${entered === expected ? 'valid' : entered > expected ? 'excess' : ''}`}><div><strong>{entered}</strong><span>entered</span></div><div className="vote-progress" role="progressbar" aria-label="Votes entered" aria-valuemin={0} aria-valuemax={expected} aria-valuenow={entered}><span style={{ width: `${voteProgress}%` }} /></div><div><strong>{expected}</strong><span>expected</span></div><small>{entered === expected ? 'All votes entered' : entered < expected ? `${expected - entered} remaining` : `${entered - expected} too many`}</small></div>
            <div className="vote-list">{pending.candidates.map((id) => <div key={id}><div><strong>{label(id)}</strong>{state.ballot.includes(id) && <span className="tag">Ballot</span>}</div><div className="vote-stepper"><button onClick={() => setTotals((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) - 1) }))}>−</button><input aria-label={`${label(id)} votes`} inputMode="numeric" value={totals[id] ?? 0} onChange={(event) => setTotals((current) => ({ ...current, [id]: Math.max(0, Number(event.target.value) || 0) }))} /><button onClick={() => setTotals((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }))}>+</button></div></div>)}</div>
            {entered !== expected && <label className="accept-warning"><input type="checkbox" checked={acceptMismatch} onChange={(event) => setAcceptMismatch(event.target.checked)} /><span className="check-box">{acceptMismatch && <Check />}</span><div><strong>Save this tally anyway</strong><small>The mismatch will be marked in the game history.</small></div></label>}
            <button className="primary command-button" onClick={submitVote}>Record vote <ArrowRight /></button>
          </>}
          {pending.type === 'advance' && <><p className="phase-instruction">{pending.description}</p>{state.ballot.length > 0 && state.phaseId.includes('ballot') && <div className="ballot-banner"><span>THE BALLOT</span><strong>{formatList(state.ballot.map(label))}</strong></div>}<button className="primary command-button" onClick={() => submit({ type: 'advance' })}>{pending.actionLabel ?? 'Continue'} <ArrowRight /></button></>}
          {pending.type === 'game-over' && <>{victoryMessage && <p className="phase-instruction">{victoryMessage}</p>}<div className="victory-factions"><span>WINNING SIDE</span><strong>{pending.factions.map(factionLabel).join(' · ') || 'No faction recorded'}</strong></div><h2 className="winner-heading">Winners</h2>{pending.winners.length ? <><p className="phase-instruction">{pending.winners.map(label).join(', ')} {pending.winners.length === 1 ? 'wins' : 'win'} the game.</p><div className="winner-list">{pending.winners.map((id) => { const player = state.players.find((entry) => entry.id === id); const personal = state.personalWinners.find((winner) => winner.playerId === id); return <div key={id}><span>{label(id).slice(0, 1)}</span><div><strong>{label(id)}</strong><small>{roleFor(player?.roleId ?? '')?.meta.name}{personal ? ` · ${personal.reason}` : ''}</small></div></div> })}</div></> : <p className="phase-instruction">No individual winners were recorded.</p>}<button className="secondary command-button" onClick={onExit}>Return home</button></>}
          {error && <div className="error-banner"><AlertTriangle /> {error}</div>}
        </div>

        {state.votes && <details className="tally-details"><summary>Latest tally: raw → effective <ChevronDown /></summary><div>{state.votes.candidates.map((id) => <p key={id}><span>{label(id)}</span><strong>{state.votes!.raw[id] ?? 0} → {state.votes!.effective[id] ?? 0}</strong></p>)}</div></details>}
        <FarmerSetup state={state} onCommand={submit} roleFor={roleFor} />
      </section>
    </div>

    {showTrace && <Drawer title="Game history" onClose={() => setShowTrace(false)}><p className="muted">Actions, results and overrides appear here in order.</p><div className="trace-list">{[...state.trace].reverse().map((entry) => <article key={entry.id}><span>{entry.source}</span><strong>{entry.message}</strong>{entry.effects?.map((effect) => <small key={effect}>{effect}</small>)}</article>)}</div></Drawer>}
    {showOverride && <OverridePanel state={state} roles={roles} onClose={() => setShowOverride(false)} onSubmit={(command) => { submit(command); setShowOverride(false) }} />}
    {showPublic && <div className="modal-backdrop" onMouseDown={() => setShowPublic(false)}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowPublic(false)}><X /></button><span className="eyebrow">READ-ALOUD LIST</span><h2>Possible roles</h2><div className="public-summary">{state.setup.publicRoles.map((range) => { const role = roleFor(range.roleId)!; return <article key={range.roleId}><header><strong>{role.meta.name}</strong><span>{range.min === range.max ? range.min : `${range.min}–${range.max}`}</span></header><p>{role.text.summary}</p></article> })}</div></div></div>}
  </div>
}

function FarmerSetup({ state, onCommand, roleFor }: { state: ReturnType<typeof currentState>; onCommand: (command: GameCommand) => void; roleFor: (id: string) => RoleDefinition | undefined }) {
  const farmers = state.players.filter((player) => player.alive && roleFor(player.roleId)?.state.some((entry) => entry.key === 'latent'))
  if (!farmers.length) return null
  return <details className="farmer-setup" open><summary>Farmer variants <ChevronDown /></summary><p>You can change a Farmer’s variant until an attack resolves it. Changes are added to the game history.</p>{farmers.map((farmer) => <label key={farmer.id}><span>{farmer.name} · {roleFor(farmer.roleId)?.meta.name}</span><select value={String(farmer.roleState.latent)} onChange={(event) => onCommand({ type: 'override', reason: 'Set Farmer variant during setup.', operation: { type: 'roleState', playerId: farmer.id, key: 'latent', value: event.target.value } })}><option value="ordinary">Ordinary</option><option value="wolf_descendant">Wolf Descendent</option><option value="hero_farmer">Hero Farmer</option></select></label>)}</details>
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="drawer" onMouseDown={(event) => event.stopPropagation()}><header><h2>{title}</h2><button className="icon-button" onClick={onClose}><X /></button></header>{children}</aside></div> }

function OverridePanel({ state, roles, onClose, onSubmit }: { state: ReturnType<typeof currentState>; roles: RoleDefinition[]; onClose: () => void; onSubmit: (command: Extract<GameCommand, { type: 'override' }>) => void }) {
  const [reason, setReason] = useState(''), [playerId, setPlayerId] = useState(state.players[0]?.id ?? ''), [operation, setOperation] = useState<'life' | 'role'>('life'), [alive, setAlive] = useState(true), [roleId, setRoleId] = useState(roles[0]?.id ?? '')
  return <div className="modal-backdrop"><div className="modal override-modal"><button className="modal-close" onClick={onClose}><X /></button><span className="eyebrow">ADVANCED OVERRIDE</span><h2>Change the game state</h2><div className="warning-box"><AlertTriangle /> Use this for corrections and table rulings. Add a reason so the change is clear in the game history.</div><label className="field"><span>Player</span><select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>{state.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><label className="field"><span>Change</span><select value={operation} onChange={(event) => setOperation(event.target.value as 'life' | 'role')}><option value="life">Life state</option><option value="role">Role</option></select></label>{operation === 'life' ? <label className="field"><span>New state</span><select value={alive ? 'alive' : 'dead'} onChange={(event) => setAlive(event.target.value === 'alive')}><option value="alive">Alive</option><option value="dead">Dead</option></select></label> : <label className="field"><span>New role</span><select value={roleId} onChange={(event) => setRoleId(event.target.value)}>{roles.filter((role) => !role.categories.includes('Status')).map((role) => <option key={role.id} value={role.id}>{role.meta.name}</option>)}</select></label>}<label className="field"><span>Reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What was corrected or decided?" /></label><button className="danger-button full" disabled={!reason.trim()} onClick={() => onSubmit({ type: 'override', reason, operation: operation === 'life' ? { type: 'life', playerId, alive } : { type: 'role', playerId, roleId } })}>Apply override</button></div></div>
}
