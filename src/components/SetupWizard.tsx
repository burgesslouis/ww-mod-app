import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Eye, Leaf, Minus, Plus, Shuffle, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { GameSetup, PackDefinition, PlayerSetup, PublicRoleRange, RoleDefinition, ScenarioDefinition } from '../domain/types'
import { PACK_ID, TRAIT } from '../domain/ids'
import { validateSetup } from '../engine/engine'
import { capitaliseLabel, friendlyFactionLabel } from '../ui/labels'

interface Props { roles: RoleDefinition[]; packs: PackDefinition[]; scenarios: ScenarioDefinition[]; onCancel: () => void; onStart: (setup: GameSetup) => void | Promise<void> }
type RoleConfig = { possible: boolean; min: number; max: number; exact: number }

const player = (index: number): PlayerSetup => ({ id: crypto.randomUUID(), name: '' })
const defaultRoleConfig = (role: RoleDefinition, possible = false): RoleConfig => ({ possible, min: role.multiplicity.min, max: role.multiplicity.max, exact: role.multiplicity.min })
const initialRoleConfig = (roles: RoleDefinition[], packs: PackDefinition[]): Record<string, RoleConfig> => {
  const baseRoleIds = new Set(packs.find((pack) => pack.id === PACK_ID)?.roleIds ?? [])
  return Object.fromEntries(roles.filter((role) => baseRoleIds.has(role.id) && !role.categories.includes('Status')).map((role) => [role.id, defaultRoleConfig(role, true)]))
}

export default function SetupWizard({ roles, packs, scenarios, onCancel, onStart }: Props) {
  const [step, setStep] = useState(0)
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? '')
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0]
  const [packIds, setPackIds] = useState<string[]>(scenario?.defaultPackIds ?? [])
  const [players, setPlayers] = useState<PlayerSetup[]>(Array.from({ length: 6 }, (_, index) => player(index)))
  const [roleConfig, setRoleConfig] = useState<Record<string, RoleConfig>>(() => initialRoleConfig(roles, packs))
  const [assignment, setAssignment] = useState<'random' | 'locked-random'>('random')
  const [nightOrder, setNightOrder] = useState<string[]>(scenario?.nightOrder ?? [])
  const [silentNight, setSilentNight] = useState(false)
  const [distributeRolesInApp, setDistributeRolesInApp] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [error, setError] = useState<string>('')
  const [starting, setStarting] = useState(false)

  const selectedPacks = useMemo(() => packs.filter((pack) => packIds.includes(pack.id)), [packs, packIds])
  const selectedRoles = useMemo(() => {
    const selectedIds = new Set(selectedPacks.flatMap((pack) => pack.roleIds))
    return roles.filter((role) => selectedIds.has(role.id))
  }, [roles, selectedPacks])
  const factionNames = useMemo(() => new Map([...scenario.factions, ...selectedPacks.flatMap((pack) => pack.factions ?? [])].map((faction) => [faction.id, faction.name === 'Neutral' ? 'Third Party' : faction.name])), [scenario.factions, selectedPacks])
  const availableRoles = useMemo(() => selectedRoles.filter((role) => !role.categories.includes('Status')), [selectedRoles])
  const spiritRoles = selectedRoles.filter((role) => role.categories.includes('Status') && role.traits.includes(TRAIT.spirit))
  const possibleSpirits = spiritRoles.filter((role) => roleConfig[role.id]?.possible)
  const activeRoles = availableRoles.filter((role) => roleConfig[role.id]?.possible)
  const nightOrderEntries = nightOrder.flatMap((abilityId) => {
    const owners = activeRoles.filter((role) => role.abilities.some((ability) => ability.id === abilityId))
    const ability = owners.flatMap((role) => role.abilities).find((candidate) => candidate.id === abilityId)
    return ability && owners.length ? [{ id: abilityId, name: capitaliseLabel(ability.name), roles: owners.map((role) => role.meta.name) }] : []
  })
  const exactDeck = activeRoles.flatMap((role) => Array.from({ length: roleConfig[role.id].exact }, () => role.id))
  const publicRoles: PublicRoleRange[] = [
    ...activeRoles.map((role) => ({ roleId: role.id, min: roleConfig[role.id].min, max: roleConfig[role.id].max })),
    ...possibleSpirits.map((role) => ({ roleId: role.id, min: 0, max: role.multiplicity.max })),
  ]
  const setup: GameSetup = {
    scenarioId, packIds, players: players.map((player) => assignment === 'random' ? { ...player, lockedRoleId: undefined } : player), publicRoles, exactDeck, assignment, distributeRolesInApp,
    nightOrder: nightOrderEntries.map((entry) => entry.id), silentNight, seed: Math.floor(Date.now() % 0xffffffff), rules: { scenario, roles: selectedRoles },
  }
  const validation = validateSetup(setup)

  useEffect(() => { window.scrollTo({ top: 0 }) }, [step])

  function togglePack(id: string) { setPackIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  function updatePlayer(id: string, patch: Partial<PlayerSetup>) { setPlayers((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)) }
  function setPossible(roleId: string, value: boolean) {
    const role = [...availableRoles, ...spiritRoles].find((item) => item.id === roleId)
    if (!role) return
    setRoleConfig((current) => ({ ...current, [roleId]: { ...(current[roleId] ?? defaultRoleConfig(role)), possible: value } }))
  }
  function setAllPossible(value: boolean) {
    setRoleConfig((current) => Object.fromEntries([...availableRoles, ...spiritRoles].map((role) => [role.id, { ...(current[role.id] ?? defaultRoleConfig(role)), possible: value }])))
  }
  function updateRole(roleId: string, key: keyof RoleConfig, value: number) {
    setRoleConfig((current) => {
      const role = availableRoles.find((item) => item.id === roleId)
      if (!role) return current
      const next = { ...(current[roleId] ?? defaultRoleConfig(role, true)), [key]: Math.max(0, value) }
      next.max = Math.max(next.min, next.max); next.exact = Math.max(next.min, Math.min(next.max, next.exact))
      return { ...current, [roleId]: next }
    })
  }
  function moveNight(abilityId: string, direction: -1 | 1) {
    const visibleIndex = nightOrderEntries.findIndex((entry) => entry.id === abilityId), destination = visibleIndex + direction
    if (visibleIndex < 0 || destination < 0 || destination >= nightOrderEntries.length) return
    const next = [...nightOrder], targetId = nightOrderEntries[destination].id
    const sourceIndex = next.indexOf(abilityId), targetIndex = next.indexOf(targetId)
    ;[next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]]; setNightOrder(next)
  }
  function nextStep() {
    if (step === 0 && !packIds.length) return setError('Attach at least one pack.')
    if (step === 1 && (players.length < 3 || players.some((item) => !item.name.trim()))) return setError('Enter a unique name for every player.')
    setError(''); setStep((current) => Math.min(3, current + 1))
  }
  async function start() {
    if (starting) return
    if (!validation.valid) return setError(validation.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message).join(' '))
    setStarting(true); setError('')
    try { await onStart(setup) }
    catch { setError('Could not save this game. Please try again.'); setStarting(false) }
  }

  return <div className="setup-page page-width">
    <div className="page-heading"><div><span className="eyebrow">NEW GAME</span><h1>Prepare the village</h1></div><button className="icon-button" onClick={onCancel}><X /> Cancel</button></div>
    <ol className="steps">{['Rules', 'Players', 'Role pool', 'Deal & review'].map((label, index) => <li key={label} className={index === step ? 'active' : index < step ? 'complete' : ''}><span>{index < step ? <Check /> : index + 1}</span><small>{label}</small></li>)}</ol>

    <section className="setup-card">
      {step === 0 && <>
        <div className="section-title"><div><span className="section-number">01</span><div><h2>Choose role packs</h2><p>The Official Game supports the Base Roles and both official expansions.</p></div></div></div>
        {scenarios.length > 1 && <label className="field"><span>Scenario</span><select value={scenarioId} onChange={(event) => { const next = scenarios.find((item) => item.id === event.target.value)!; setScenarioId(next.id); setPackIds(next.defaultPackIds); setNightOrder(next.nightOrder) }}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.meta.name}</option>)}</select></label>}
        <div className="scenario-preview"><strong>{scenario.meta.name}</strong><p>{scenario.description}</p></div>
        <h3>Attached packs</h3><div className="choice-grid">{packs.map((pack) => <button key={pack.id} className={`choice-card ${packIds.includes(pack.id) ? 'selected' : ''}`} onClick={() => togglePack(pack.id)}><span className="check-box">{packIds.includes(pack.id) && <Check />}</span><div><strong>{pack.meta.name}</strong><p>{pack.roles.filter((role) => !role.categories.includes('Status')).length} dealt roles · {pack.meta.builtIn ? 'Built in' : 'Custom'}</p></div></button>)}</div>
        <h3>Night calls</h3><button type="button" aria-pressed={silentNight} className={`choice-card night-mode ${silentNight ? 'selected' : ''}`} onClick={() => setSilentNight((value) => !value)}><span className="check-box">{silentNight && <Check />}</span><div><strong>Silent night</strong><p>Skip spoken role call-outs. Only show the moderator the players who actually need to wake.</p></div></button>
      </>}

      {step === 1 && <>
        <div className="section-title"><div><span className="section-number">02</span><div><h2>Who is playing?</h2><p>Enter the names you will use around the table.</p></div></div><span className="count-pill"><Users /> {players.length} players</span></div>
        <div className="player-list">{players.map((item, index) => <div className="player-row" key={item.id}><span className="seat-number">{index + 1}</span><input aria-label={`Player ${index + 1} name`} value={item.name} placeholder={`Player ${index + 1}`} onChange={(event) => updatePlayer(item.id, { name: event.target.value })} autoCapitalize="words" /><button className="icon-button danger" disabled={players.length <= 3} onClick={() => setPlayers((current) => current.filter((player) => player.id !== item.id))}><X /></button></div>)}</div>
        <button className="dashed-button" onClick={() => setPlayers((current) => [...current, player(current.length)])}><Plus /> Add player</button>
      </>}

      {step === 2 && <>
        <div className="section-title"><div><span className="section-number">03</span><div><h2>Choose the roles</h2><p>Set the range announced to the table and the number actually in play.</p></div></div><div className="heading-actions"><button className="icon-button" onClick={() => setAllPossible(true)}><Check /> Select all</button><button className="icon-button" onClick={() => setAllPossible(false)}><X /> Clear all</button></div></div>
        <div className="deck-meter"><span className={exactDeck.length === players.length ? 'ok' : ''}>{exactDeck.length} / {players.length}</span><div><i style={{ width: `${Math.min(100, (exactDeck.length / Math.max(1, players.length)) * 100)}%` }} /></div><small>{exactDeck.length === players.length ? 'Deck complete' : `${Math.abs(players.length - exactDeck.length)} role${Math.abs(players.length - exactDeck.length) === 1 ? '' : 's'} ${exactDeck.length < players.length ? 'still needed' : 'too many'}`}</small></div>
        <div className="role-config-table">
          <div className="role-config-head"><span>Available role</span><span>Announced min</span><span>Announced max</span><span>In play</span></div>
          {availableRoles.map((role) => { const config = roleConfig[role.id] ?? defaultRoleConfig(role); return <div className={`role-config-row ${config.possible ? 'enabled' : ''}`} key={role.id}>
            <label className="role-check"><input type="checkbox" checked={config.possible} onChange={(event) => setPossible(role.id, event.target.checked)} /><span className="check-box">{config.possible && <Check />}</span><div><strong>{role.meta.name}</strong><small>{factionNames.get(role.faction) ?? friendlyFactionLabel(role.faction)} · {role.categories.slice(0, 2).map(capitaliseLabel).join(', ')}</small></div></label>
            <div className="role-config-control"><small>Announced min</small><Stepper value={config.min} disabled={!config.possible} onChange={(value) => updateRole(role.id, 'min', value)} /></div>
            <div className="role-config-control"><small>Announced max</small><Stepper value={config.max} disabled={!config.possible} onChange={(value) => updateRole(role.id, 'max', value)} /></div>
            <div className="role-config-control"><small>In play</small><ExactCount role={role} config={config} onChange={(value) => updateRole(role.id, 'exact', value)} /></div>
          </div> })}
        </div>
      </>}

      {step === 2 && spiritRoles.length > 0 && <section className="spirit-options" aria-label="Possible Spirits">
        <h3>Possible Spirits</h3><p className="muted">Choose which Spirits may be assigned after a death. They are not part of the starting deck.</p>
        <div className="choice-grid">{spiritRoles.map((role) => <label className={`choice-card ${roleConfig[role.id]?.possible ? 'selected' : ''}`} key={role.id}>
          <input type="checkbox" aria-label={`${role.meta.name} possible`} checked={roleConfig[role.id]?.possible ?? false} onChange={(event) => setPossible(role.id, event.target.checked)} />
          <div><strong>{role.meta.name}</strong><p>{role.text.summary}</p></div>
        </label>)}</div>
      </section>}

      {step === 3 && <>
        <div className="section-title"><div><span className="section-number">04</span><div><h2>Deal and review</h2><p>Choose how roles are assigned, then review the night order.</p></div></div></div>
        <button type="button" aria-pressed={distributeRolesInApp} className={`choice-card deal-option ${distributeRolesInApp ? 'selected' : ''}`} onClick={() => setDistributeRolesInApp((value) => !value)}><span className="check-box">{distributeRolesInApp && <Check />}</span><div><strong>Use app to distribute roles</strong><p>Pass the phone around. Each player picks a card, reads their role and presses Ready.</p>{distributeRolesInApp && assignment === 'locked-random' && <p>Selected seats receive their assigned card. Other players draw from the remaining deck.</p>}</div></button>
        <div className="segmented"><button className={assignment === 'random' ? 'active' : ''} onClick={() => setAssignment('random')}><Shuffle /> Random allocation</button><button className={assignment === 'locked-random' ? 'active' : ''} onClick={() => setAssignment('locked-random')}><Leaf /> Gardened allocation</button></div>
        {assignment === 'locked-random' && <div className="assignment-list">{players.map((item) => <label key={item.id}><span>{item.name}</span><select value={item.lockedRoleId ?? ''} onChange={(event) => updatePlayer(item.id, { lockedRoleId: event.target.value || undefined })}><option value="">Shuffle this seat</option>{activeRoles.filter((role) => roleConfig[role.id].exact > 0).map((role) => { const usedElsewhere = players.filter((player) => player.id !== item.id && player.lockedRoleId === role.id).length; const unavailable = usedElsewhere >= roleConfig[role.id].exact && item.lockedRoleId !== role.id; return <option key={role.id} value={role.id} disabled={unavailable}>{role.meta.name}</option> })}</select></label>)}</div>}
        <div className="review-grid"><div><h3>Game summary</h3><dl><div><dt>Scenario</dt><dd>{scenario.meta.name}</dd></div><div><dt>Players</dt><dd>{players.length}</dd></div><div><dt>Possible roles</dt><dd>{publicRoles.length}</dd></div><div><dt>Roles in play</dt><dd>{exactDeck.length}</dd></div><div><dt>Night calls</dt><dd>{silentNight ? 'Silent' : 'Read aloud'}</dd></div></dl><button className="secondary" onClick={() => setShowSummary(true)}><Eye /> Preview read-aloud summary</button></div>
          <div><h3>Night order</h3><p className="muted">Actions for possible roles are shown in this order.</p><div className="night-order">{nightOrderEntries.map((entry, index) => <div key={entry.id}><span>{index + 1}</span><div className="night-action-label"><strong>{entry.name}</strong><div className="night-role-tags">{entry.roles.map((role) => <span key={role}>{role}</span>)}</div></div><button disabled={index === 0} onClick={() => moveNight(entry.id, -1)}><ChevronUp /></button><button disabled={index === nightOrderEntries.length - 1} onClick={() => moveNight(entry.id, 1)}><ChevronDown /></button></div>)}</div></div>
        </div>
        {!validation.valid && <div className="validation-box">{validation.issues.map((item, index) => <p key={index}>{item.message}</p>)}</div>}
      </>}

      {error && <div className="error-banner">{error}</div>}
      <div className="wizard-actions"><button className="secondary" disabled={starting} onClick={() => step === 0 ? onCancel() : setStep((current) => current - 1)}><ArrowLeft /> {step === 0 ? 'Cancel' : 'Back'}</button>{step < 3 ? <button className="primary" onClick={nextStep}>Continue <ArrowRight /></button> : <button className="primary" onClick={start} disabled={!validation.valid || starting}>{starting ? 'Saving…' : distributeRolesInApp ? 'Distribute roles' : 'Deal roles & begin'} <ArrowRight /></button>}</div>
    </section>

    {showSummary && <div className="modal-backdrop" onMouseDown={() => setShowSummary(false)}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowSummary(false)}><X /></button><span className="eyebrow">READ-ALOUD LIST</span><h2>Possible roles</h2><p className="muted">This shows only the ranges announced to the players.</p><div className="public-summary">{publicRoles.map((range) => { const role = roles.find((item) => item.id === range.roleId)!; return <article key={range.roleId}><header><strong>{role.meta.name}</strong><span>{range.min === range.max ? range.min : `${range.min}–${range.max}`}</span></header><p>{role.text.summary}</p></article> })}</div></div></div>}
  </div>
}

function ExactCount({ role, config, onChange }: { role: RoleDefinition; config: RoleConfig; onChange: (value: number) => void }) {
  if (config.max === 1) return <label className={`exact-checkbox ${config.exact === 1 ? 'checked' : ''}`}><input aria-label={`${role.meta.name} in play`} type="checkbox" checked={config.exact === 1} disabled={!config.possible || config.min === 1} onChange={(event) => onChange(event.target.checked ? 1 : 0)} /><span className="check-box">{config.exact === 1 && <Check />}</span></label>
  return <Stepper value={config.exact} disabled={!config.possible} onChange={onChange} />
}

function Stepper({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return <div className="stepper"><button disabled={disabled || value <= 0} onClick={() => onChange(value - 1)}><Minus /></button><span>{value}</span><button disabled={disabled} onClick={() => onChange(value + 1)}><Plus /></button></div>
}
