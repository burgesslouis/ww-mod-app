import { AlertTriangle, ArrowRight, Check, ChevronDown, ChevronUp, Eye, History, RotateCcw, RotateCw, Settings2, Skull, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { GameCommand, GameSession, PhaseDefinition, RoleDefinition, VoteState } from '../domain/types'
import { availableCommand, currentState, effectiveProperties, factionName, phasePeriod } from '../engine/engine'

interface Props {
  session: GameSession; roles: RoleDefinition[]; onChange: (session: GameSession) => void; onExit: () => void
  onUndo: () => void; onRedo: () => void; onCommand: (command: GameCommand) => void; onReturnToSetup?: () => void
}

export function canReturnToSetup(session: GameSession): boolean {
  const state = currentState(session)
  return session.cursor === 0 && session.snapshots.length === 1 && state.pipeline === 'setup' && state.cycle === 0 && !state.gameOver && state.events.length === 1 && state.events[0]?.type === 'game.started' && (!session.roleDeal || session.roleDeal.finished)
}

function phaseTitle(title: string) {
  return title.split(/(\d+)/g).map((part, index) => part.match(/^\d+$/) ? <span className="heading-number" key={`${part}-${index}`}>{part}</span> : part)
}

export function voteUiContext(phase: PhaseDefinition | undefined, latestVoteKind?: VoteState['kind']) {
  const activeVoteKind = phase?.type === 'aggregate-vote' ? phase.vote : undefined
  return {
    activeVoteKind,
    showLatestTally: Boolean(latestVoteKind && (activeVoteKind === 'ballot' || latestVoteKind === activeVoteKind)),
  }
}

export type PrivateResultTone = 'danger' | 'mystic' | 'positive' | 'neutral' | 'information'

export interface PrivateResultItem {
  subject?: string
  value: string
  tone: PrivateResultTone
}

function privateResultTone(value: string): PrivateResultTone {
  const result = value.trim().toUpperCase()
  if (/^(?:NOT\b|NO RESULT$|ABSENT$|NONE$|NOT IN PLAY$)/.test(result)) return 'neutral'
  if (result.includes('CORRUPT') || result.includes('CURSED')) return 'danger'
  if (result.includes('MYSTIC')) return 'mystic'
  if (result === 'PRESENT' || result === 'VILLAGE') return 'positive'
  return 'information'
}

export function privateResultItems(message: string): PrivateResultItem[] {
  return message.split(/\s+·\s+/).map((part) => {
    const separator = part.indexOf(':')
    const subject = separator >= 0 ? part.slice(0, separator).trim() : undefined
    const value = (separator >= 0 ? part.slice(separator + 1) : part).trim()
    return { ...(subject ? { subject } : {}), value, tone: privateResultTone(value) }
  }).filter((item) => item.value)
}

function PrivateResult({ message }: { message: string }) {
  const results = privateResultItems(message)
  return <section className="private-result-reveal" role="status" aria-label="Private check result">
    <header><Eye /><span>SHOW PRIVATELY</span><small>Check result</small></header>
    <div className={`private-result-list ${results.length > 1 ? 'multiple' : ''}`}>
      {results.map((result, index) => <article className={`private-result-outcome ${result.tone}`} key={`${result.subject ?? 'result'}-${index}`}>
        <div className="private-result-icon" aria-hidden="true">{result.tone === 'danger' ? <AlertTriangle /> : result.tone === 'neutral' ? <X /> : result.tone === 'positive' ? <Check /> : <Eye />}</div>
        {result.subject && <span className="private-result-subject">{result.subject}</span>}
        <strong>{result.value}</strong>
      </article>)}
    </div>
    <p>Show this result to the player, then take the phone back before continuing.</p>
  </section>
}

export default function GameView({ session, roles, onExit, onUndo, onRedo, onCommand, onReturnToSetup }: Props) {
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
  const phases = state.pipeline === 'setup' ? state.rules.scenario.setupPipeline : state.rules.scenario.cyclePipeline
  const { activeVoteKind, showLatestTally } = voteUiContext(phases[state.phaseIndex], state.votes?.kind)
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

  const period = phasePeriod(state)
  const phaseLabel = period === 'setup' ? 'N0' : period === 'day' ? `DAY ${state.cycle}` : period === 'morning' ? `MORNING ${state.cycle + 1}` : `N${state.cycle}`

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
        <div className="command-topline"><button className="icon-button mobile-only" onClick={() => setShowRoster(true)}><Users /> Roster</button><div className="history-actions">{onReturnToSetup && canReturnToSetup(session) && <button className="icon-button edit-setup-button" onClick={onReturnToSetup}><Settings2 /> Edit setup</button>}<button className="icon-button" onClick={onUndo} disabled={session.cursor <= 0} title="Undo"><RotateCcw /></button><button className="icon-button" onClick={onRedo} disabled={session.cursor >= session.snapshots.length - 1} title="Redo"><RotateCw /></button><button className="icon-button" onClick={() => setShowTrace(true)}><History /> History</button><button className="icon-button" onClick={() => setShowOverride(true)}><Settings2 /> Override</button></div></div>

        {state.setup.setupWarnings?.map((warning) => <div className="warning-box" role="status" key={warning}><AlertTriangle /> {warning}</div>)}
        <div className={`phase-card ${pending.type === 'game-over' ? 'game-over-card' : ''}`}>
          <span className="eyebrow">{pending.type === 'choose' ? 'ROLE ACTION' : pending.type === 'vote' ? 'VOTE' : pending.type === 'game-over' ? 'GAME OVER' : 'NEXT STEP'}</span>
          <h1>{phaseTitle(pending.title)}</h1>
          {pending.type === 'choose' && <>
            <p className="phase-instruction">{pending.instructions}</p>
            {(pending.participantIds?.length || pending.information?.length) && <div className="wake-together">{pending.participantIds?.length && <><span>{pending.participantIds.length > 1 ? 'WAKE TOGETHER' : 'WAKE THIS PLAYER'}</span><div className="wake-participants">{pending.participantIds.map((id) => <strong key={id}>{label(id)}</strong>)}</div></>}{pending.information?.length && <div className="action-information">{pending.information.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.status === 'in-play' ? 'In play' : 'Not in play'}</small></div>)}</div>}</div>}
            <div className="target-grid">{pending.candidates.map((id) => <button key={id} className={selected.includes(id) ? 'selected' : ''} onClick={() => toggleTarget(id)}><span>{selected.includes(id) ? <Check /> : label(id).slice(0, 1)}</span><strong>{label(id)}</strong>{state.players.some((player) => player.id === id) && <small>{state.players.find((player) => player.id === id)?.alive ? 'Alive' : 'Dead'}</small>}</button>)}</div>
            {!pending.candidates.length && pending.max > 0 && <div className="empty-action">There are no eligible targets. Skip this action; the power remains available.</div>}
            <button className="primary command-button" disabled={selected.length < pending.min || selected.length > pending.max} onClick={() => submit({ type: 'choose', actorId: pending.actorId, abilityId: pending.abilityId, targets: selected })}>{selected.length < pending.min ? pending.min === 1 ? 'Choose a target' : `Choose ${pending.min} targets` : selected.length ? `Confirm ${selected.length} selection${selected.length === 1 ? '' : 's'}` : pending.max === 0 ? 'Confirm' : 'Skip'} <ArrowRight /></button>
          </>}
          {pending.type === 'vote' && <>
            <p className="phase-instruction">Enter the votes received by each candidate. Role abilities are applied after the total is checked.</p>
            <div className={`vote-meter ${entered === expected ? 'valid' : entered > expected ? 'excess' : ''}`}><div><strong>{entered}</strong><span>entered</span></div><div className="vote-progress" role="progressbar" aria-label="Votes entered" aria-valuemin={0} aria-valuemax={expected} aria-valuenow={entered}><span style={{ width: `${voteProgress}%` }} /></div><div><strong>{expected}</strong><span>expected</span></div><small>{entered === expected ? 'All votes entered' : entered < expected ? `${expected - entered} remaining` : `${entered - expected} too many`}</small></div>
            <div className="vote-list">{pending.candidates.map((id) => <div key={id}><div><strong>{label(id)}</strong>{activeVoteKind === 'ballot' && state.ballot.includes(id) && <span className="tag">Ballot</span>}</div><div className="vote-stepper"><button onClick={() => setTotals((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) - 1) }))}>−</button><input aria-label={`${label(id)} votes`} inputMode="numeric" value={totals[id] ?? 0} onChange={(event) => setTotals((current) => ({ ...current, [id]: Math.max(0, Number(event.target.value) || 0) }))} /><button onClick={() => setTotals((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }))}>+</button></div></div>)}</div>
            {entered !== expected && <label className="accept-warning"><input type="checkbox" checked={acceptMismatch} onChange={(event) => setAcceptMismatch(event.target.checked)} /><span className="check-box">{acceptMismatch && <Check />}</span><div><strong>Save this tally anyway</strong><small>The mismatch will be marked in the game history.</small></div></label>}
            <button className="primary command-button" onClick={submitVote}>Record vote <ArrowRight /></button>
          </>}
          {pending.type === 'advance' && <>{pending.title === 'Result' ? <PrivateResult message={pending.description} /> : <p className="phase-instruction">{pending.description}</p>}{pending.kind === 'tap' && pending.targetIds?.length ? <div className="tap-panel"><span className="eyebrow">TAP NOW</span><strong>{formatList(pending.targetIds.map(label))}</strong><small>These players were bitten successfully. Tap them before continuing.</small></div> : null}{state.ballot.length > 0 && state.phaseId.includes('ballot') && <div className="ballot-banner"><span>THE BALLOT</span><strong>{formatList(state.ballot.map(label))}</strong></div>}<button className="primary command-button" onClick={() => submit({ type: 'advance' })}>{pending.actionLabel ?? 'Continue'} <ArrowRight /></button></>}
          {pending.type === 'game-over' && <>{victoryMessage && <p className="phase-instruction">{victoryMessage}</p>}{pending.factions.length > 0 && <div className="victory-factions"><span>WINNING SIDE</span><strong>{pending.factions.map(factionLabel).join(' · ')}</strong></div>}<h2 className="winner-heading">Winners</h2>{pending.winners.length ? <><p className="phase-instruction">{formatList(pending.winners.map(label))} {pending.winners.length === 1 ? 'wins' : 'win'} the game.</p><div className="winner-list">{pending.winners.map((id) => { const player = state.players.find((entry) => entry.id === id); const personal = state.personalWinners.find((winner) => winner.playerId === id); return <div key={id}><span>{label(id).slice(0, 1)}</span><div><strong>{label(id)}</strong><small>{roleFor(player?.roleId ?? '')?.meta.name}{personal ? ` · ${personal.reason}` : ''}</small></div></div> })}</div></> : <p className="phase-instruction">No individual winners were recorded.</p>}<button className="secondary command-button" onClick={onExit}>Return home</button></>}
          {error && <div className="error-banner"><AlertTriangle /> {error}</div>}
        </div>

        {state.votes && showLatestTally && <details className="tally-details"><summary>Latest tally: raw → effective <ChevronDown /></summary><div>{state.votes.candidates.map((id) => <p key={id}><span>{label(id)}</span><strong>{state.votes!.raw[id] ?? 0} → {state.votes!.effective[id] ?? 0}</strong></p>)}</div></details>}
        {!state.gameOver && <FarmerSetup state={state} onCommand={submit} roleFor={roleFor} />}
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

function parseOverrideValue(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try { return JSON.parse(trimmed) } catch { return value }
}

function OverridePanel({ state, roles, onClose, onSubmit }: { state: ReturnType<typeof currentState>; roles: RoleDefinition[]; onClose: () => void; onSubmit: (command: Extract<GameCommand, { type: 'override' }>) => void }) {
  const allRoles = [...new Map([...state.rules.roles, ...roles].map((role) => [role.id, role])).values()]
  const factions = [...new Map([...state.rules.scenario.factions, ...state.rules.scenario.packs.filter((pack) => state.packIds.includes(pack.id)).flatMap((pack) => pack.factions ?? [])].map((faction) => [faction.id, faction])).values()]
  const [reason, setReason] = useState('')
  const [playerId, setPlayerId] = useState(state.players[0]?.id ?? '')
  const [operation, setOperation] = useState<'life' | 'role' | 'faction' | 'ability' | 'status' | 'roleState'>('life')
  const [alive, setAlive] = useState(true)
  const [roleId, setRoleId] = useState(allRoles[0]?.id ?? '')
  const [factionId, setFactionId] = useState(factions[0]?.id ?? '')
  const [winScope, setWinScope] = useState<'exact' | 'alignment'>('exact')
  const [abilityId, setAbilityId] = useState('')
  const [abilityStatus, setAbilityStatus] = useState<'available' | 'spent' | 'locked'>('available')
  const [unlockCycle, setUnlockCycle] = useState(state.cycle + 1)
  const [statusId, setStatusId] = useState('')
  const [statusName, setStatusName] = useState('')
  const [removeStatus, setRemoveStatus] = useState(false)
  const [stateKey, setStateKey] = useState('')
  const [stateValue, setStateValue] = useState('')
  const player = state.players.find((entry) => entry.id === playerId)
  const abilities = [...(state.rules.roles.find((role) => role.id === player?.roleId)?.abilities ?? []), ...((player?.statuses ?? []).flatMap((status) => status.abilities ?? []))]
  useEffect(() => { setAbilityId(abilities.length === 1 ? abilities[0].id : '') }, [playerId, player?.roleId])
  useEffect(() => {
    setStatusId(removeStatus ? player?.statuses[0]?.id ?? '' : '')
    setStatusName('')
  }, [playerId, removeStatus])
  const submitOverride = () => {
    let operationValue: Extract<GameCommand, { type: 'override' }>['operation']
    if (operation === 'life') operationValue = { type: 'life', playerId, alive }
    else if (operation === 'role') operationValue = { type: 'role', playerId, roleId }
    else if (operation === 'faction') operationValue = { type: 'faction', playerId, faction: factionId, winScope }
    else if (operation === 'ability') operationValue = { type: 'ability', playerId, abilityId, status: abilityStatus, ...(abilityStatus === 'locked' ? { unlockCycle } : {}) }
    else if (operation === 'status') {
      const existing = player?.statuses.find((status) => status.id === statusId)
      if (removeStatus && !existing) return
      operationValue = { type: 'status', playerId, status: existing ?? { id: statusId, name: statusName, duration: 'permanent', appliedCycle: state.cycle }, remove: removeStatus }
    }
    else operationValue = { type: 'roleState', playerId, key: stateKey, value: parseOverrideValue(stateValue) }
    onSubmit({ type: 'override', reason, operation: operationValue })
  }
  const statusReady = removeStatus ? Boolean(statusId) : Boolean(statusId.trim() && statusName.trim())
  return <div className="modal-backdrop">
    <div className="modal override-modal">
      <button className="modal-close" onClick={onClose}><X /></button>
      <span className="eyebrow">ADVANCED OVERRIDE</span>
      <h2>Change the game state</h2>
      <div className="warning-box"><AlertTriangle /> Use this for corrections and table rulings. Add a reason so the change is clear in the game history.</div>
      <label className="field"><span>Player</span><select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>{state.players.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      <label className="field"><span>Change</span><select value={operation} onChange={(event) => setOperation(event.target.value as typeof operation)}><option value="life">Life state</option><option value="role">Role (including status roles)</option><option value="faction">Faction and win scope</option><option value="ability">Ability availability</option><option value="status">Add or remove status</option><option value="roleState">Role state</option></select></label>
      {operation === 'life' && <label className="field"><span>New state</span><select value={alive ? 'alive' : 'dead'} onChange={(event) => setAlive(event.target.value === 'alive')}><option value="alive">Alive</option><option value="dead">Dead</option></select></label>}
      {operation === 'role' && <label className="field"><span>New role</span><select value={roleId} onChange={(event) => setRoleId(event.target.value)}>{allRoles.map((role) => <option key={role.id} value={role.id}>{role.meta.name}</option>)}</select></label>}
      {operation === 'faction' && <>
        <label className="field"><span>Faction</span><select value={factionId} onChange={(event) => setFactionId(event.target.value)}>{factions.map((faction) => <option key={faction.id} value={faction.id}>{faction.name}</option>)}</select></label>
        <label className="field"><span>Win scope</span><select value={winScope} onChange={(event) => setWinScope(event.target.value as typeof winScope)}><option value="exact">Exact faction</option><option value="alignment">Whole alignment</option></select></label>
      </>}
      {operation === 'ability' && <>
        <label className="field"><span>Ability</span><select value={abilityId} disabled={!abilities.length} onChange={(event) => setAbilityId(event.target.value)}><option value="" disabled>{abilities.length ? 'Choose an ability…' : 'No abilities available'}</option>{abilities.map((ability) => <option key={ability.id} value={ability.id}>{ability.name}</option>)}</select></label>
        <label className="field"><span>Availability</span><select value={abilityStatus} disabled={!abilities.length} onChange={(event) => setAbilityStatus(event.target.value as typeof abilityStatus)}><option value="available">Available</option><option value="spent">Spent</option><option value="locked">Locked until cycle</option></select></label>
        {abilityStatus === 'locked' && abilities.length > 0 && <label className="field"><span>Unlock cycle</span><input type="number" min={state.cycle + 1} value={unlockCycle} onChange={(event) => setUnlockCycle(Number(event.target.value))} /></label>}
      </>}
      {operation === 'status' && <>
        <label className="check-row"><input type="checkbox" checked={removeStatus} onChange={(event) => setRemoveStatus(event.target.checked)} /><span>Remove an existing status</span></label>
        {removeStatus
          ? <label className="field"><span>Existing status</span><select value={statusId} disabled={!player?.statuses.length} onChange={(event) => setStatusId(event.target.value)}><option value="" disabled>{player?.statuses.length ? 'Choose a status…' : 'No statuses to remove'}</option>{player?.statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select></label>
          : <><label className="field"><span>Status id</span><input value={statusId} onChange={(event) => setStatusId(event.target.value)} placeholder="wherewolf.core.status.example" /></label><label className="field"><span>Status name</span><input value={statusName} onChange={(event) => setStatusName(event.target.value)} placeholder="Visible status name" /></label></>}
      </>}
      {operation === 'roleState' && <>
        <label className="field"><span>State key</span><input value={stateKey} onChange={(event) => setStateKey(event.target.value)} placeholder="state key" /></label>
        <label className="field"><span>Value</span><input value={stateValue} onChange={(event) => setStateValue(event.target.value)} placeholder="Text or JSON value" /><small>Numbers, true, false, null, arrays and objects are stored as typed JSON; other input remains text.</small></label>
      </>}
      <label className="field"><span>Reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What was corrected or decided?" /></label>
      <button className="danger-button full" disabled={!reason.trim() || (operation === 'ability' && !abilityId) || (operation === 'status' && !statusReady) || (operation === 'roleState' && !stateKey.trim())} onClick={submitOverride}>Apply override</button>
    </div>
  </div>
}
