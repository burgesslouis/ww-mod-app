import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Eye, GripVertical, Minus, Plus, Shuffle, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { GameSetup, PackDefinition, PlayerSetup, PublicRoleRange, RoleDefinition, ScenarioDefinition } from '../domain/types'
import { roleName } from '../data/base'
import { validateSetup } from '../engine/engine'

interface Props { roles: RoleDefinition[]; packs: PackDefinition[]; scenarios: ScenarioDefinition[]; onCancel: () => void; onStart: (setup: GameSetup) => void }
type RoleConfig = { possible: boolean; min: number; max: number; exact: number }

const player = (index: number): PlayerSetup => ({ id: crypto.randomUUID(), name: '' })
const defaultRoleConfig = (role: RoleDefinition, possible = false): RoleConfig => ({ possible, min: role.multiplicity.min, max: role.multiplicity.max, exact: role.multiplicity.min })

export default function SetupWizard({ roles, packs, scenarios, onCancel, onStart }: Props) {
  const [step, setStep] = useState(0)
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? '')
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0]
  const [packIds, setPackIds] = useState<string[]>(scenario?.defaultPackIds ?? [])
  const [players, setPlayers] = useState<PlayerSetup[]>(Array.from({ length: 6 }, (_, index) => player(index)))
  const [roleConfig, setRoleConfig] = useState<Record<string, RoleConfig>>({})
  const [assignment, setAssignment] = useState<GameSetup['assignment']>('random')
  const [manual, setManual] = useState<Record<string, string>>({})
  const [nightOrder, setNightOrder] = useState<string[]>(scenario?.nightOrder ?? [])
  const [showSummary, setShowSummary] = useState(false)
  const [error, setError] = useState<string>('')

  const selectedPacks = useMemo(() => packs.filter((pack) => packIds.includes(pack.id)), [packs, packIds])
  const selectedRoles = useMemo(() => {
    const selectedIds = new Set(selectedPacks.flatMap((pack) => pack.roleIds))
    return roles.filter((role) => selectedIds.has(role.id))
  }, [roles, selectedPacks])
  const availableRoles = useMemo(() => selectedRoles.filter((role) => !role.categories.includes('Status')), [selectedRoles])
  const activeRoles = availableRoles.filter((role) => roleConfig[role.id]?.possible)
  const exactDeck = activeRoles.flatMap((role) => Array.from({ length: roleConfig[role.id].exact }, () => role.id))
  const publicRoles: PublicRoleRange[] = activeRoles.map((role) => ({ roleId: role.id, min: roleConfig[role.id].min, max: roleConfig[role.id].max }))
  const setup: GameSetup = {
    scenarioId, packIds, players, publicRoles, exactDeck, assignment, manualAssignments: assignment === 'manual' ? manual : undefined,
    nightOrder, seed: Math.floor(Date.now() % 0xffffffff), rules: { scenario, roles: selectedRoles },
  }
  const validation = validateSetup(setup)

  function togglePack(id: string) { setPackIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  function updatePlayer(id: string, patch: Partial<PlayerSetup>) { setPlayers((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)) }
  function setPossible(roleId: string, value: boolean) {
    const role = availableRoles.find((item) => item.id === roleId)
    if (!role) return
    setRoleConfig((current) => ({ ...current, [roleId]: { ...(current[roleId] ?? defaultRoleConfig(role)), possible: value } }))
  }
  function setAllPossible(value: boolean) {
    setRoleConfig((current) => Object.fromEntries(availableRoles.map((role) => [role.id, { ...(current[role.id] ?? defaultRoleConfig(role)), possible: value }])))
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
  function moveNight(index: number, direction: -1 | 1) {
    const next = [...nightOrder], destination = index + direction
    if (destination < 0 || destination >= next.length) return
    ;[next[index], next[destination]] = [next[destination], next[index]]; setNightOrder(next)
  }
  function nextStep() {
    if (step === 0 && !packIds.length) return setError('Attach at least one pack.')
    if (step === 1 && (players.length < 3 || players.some((item) => !item.name.trim()))) return setError('Enter a unique name for every player.')
    setError(''); setStep((current) => Math.min(3, current + 1))
  }
  function start() {
    if (!validation.valid) return setError(validation.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message).join(' '))
    onStart(setup)
  }

  const abilityName = (id: string) => availableRoles.flatMap((role) => role.abilities).find((ability) => ability.id === id)?.name ?? id.split('.').at(-1)

  return <div className="setup-page page-width">
    <div className="page-heading"><div><span className="eyebrow">NEW GAME</span><h1>Prepare the village</h1></div><button className="icon-button" onClick={onCancel}><X /> Cancel</button></div>
    <ol className="steps">{['Rules', 'Players', 'Role pool', 'Deal & review'].map((label, index) => <li key={label} className={index === step ? 'active' : index < step ? 'complete' : ''}><span>{index < step ? <Check /> : index + 1}</span><small>{label}</small></li>)}</ol>

    <section className="setup-card">
      {step === 0 && <>
        <div className="section-title"><div><span className="section-number">01</span><div><h2>Choose the rules</h2><p>Choose the scenario and the role packs you want to use.</p></div></div></div>
        <label className="field"><span>Scenario</span><select value={scenarioId} onChange={(event) => { const next = scenarios.find((item) => item.id === event.target.value)!; setScenarioId(next.id); setPackIds(next.defaultPackIds); setNightOrder(next.nightOrder) }}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.meta.name}</option>)}</select></label>
        <div className="scenario-preview"><strong>{scenario.meta.name}</strong><p>{scenario.description}</p></div>
        <h3>Attached packs</h3><div className="choice-grid">{packs.map((pack) => <button key={pack.id} className={`choice-card ${packIds.includes(pack.id) ? 'selected' : ''}`} onClick={() => togglePack(pack.id)}><span className="check-box">{packIds.includes(pack.id) && <Check />}</span><div><strong>{pack.meta.name}</strong><p>{pack.roles.filter((role) => !role.categories.includes('Status')).length} dealt roles · {pack.meta.builtIn ? 'Built in' : 'Custom'}</p></div></button>)}</div>
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
            <label className="role-check"><input type="checkbox" checked={config.possible} onChange={(event) => setPossible(role.id, event.target.checked)} /><span className="check-box">{config.possible && <Check />}</span><div><strong>{role.meta.name}</strong><small>{role.faction.split('.').at(-1)} · {role.categories.slice(0, 2).join(', ')}</small></div></label>
            <Stepper value={config.min} disabled={!config.possible} onChange={(value) => updateRole(role.id, 'min', value)} />
            <Stepper value={config.max} disabled={!config.possible} onChange={(value) => updateRole(role.id, 'max', value)} />
            <ExactCount role={role} config={config} onChange={(value) => updateRole(role.id, 'exact', value)} />
          </div> })}
        </div>
      </>}

      {step === 3 && <>
        <div className="section-title"><div><span className="section-number">04</span><div><h2>Deal and review</h2><p>Choose how roles are assigned, then review the night order.</p></div></div></div>
        <div className="segmented">{(['random', 'locked-random', 'manual'] as const).map((mode) => <button key={mode} className={assignment === mode ? 'active' : ''} onClick={() => setAssignment(mode)}>{mode === 'random' ? <><Shuffle /> Fully random</> : mode === 'locked-random' ? <><Shuffle /> Lock some</> : <><GripVertical /> Manual</>}</button>)}</div>
        {assignment !== 'random' && <div className="assignment-list">{players.map((item) => <label key={item.id}><span>{item.name}</span><select value={assignment === 'manual' ? manual[item.id] ?? '' : item.lockedRoleId ?? ''} onChange={(event) => assignment === 'manual' ? setManual((current) => ({ ...current, [item.id]: event.target.value })) : updatePlayer(item.id, { lockedRoleId: event.target.value || undefined })}><option value="">{assignment === 'manual' ? 'Choose role…' : 'Shuffle this seat'}</option>{activeRoles.flatMap((role) => Array.from({ length: roleConfig[role.id].exact }, (_, index) => <option key={`${role.id}-${index}`} value={role.id}>{role.meta.name}</option>))}</select></label>)}</div>}
        <div className="review-grid"><div><h3>Game summary</h3><dl><div><dt>Scenario</dt><dd>{scenario.meta.name}</dd></div><div><dt>Players</dt><dd>{players.length}</dd></div><div><dt>Possible roles</dt><dd>{publicRoles.length}</dd></div><div><dt>Roles in play</dt><dd>{exactDeck.length}</dd></div></dl><button className="secondary" onClick={() => setShowSummary(true)}><Eye /> Preview read-aloud summary</button></div>
          <div><h3>Night order</h3><p className="muted">Actions are shown to the moderator in this order.</p><div className="night-order">{nightOrder.map((ability, index) => <div key={ability}><span>{index + 1}</span><strong>{abilityName(ability)}</strong><button disabled={index === 0} onClick={() => moveNight(index, -1)}><ChevronUp /></button><button disabled={index === nightOrder.length - 1} onClick={() => moveNight(index, 1)}><ChevronDown /></button></div>)}</div></div>
        </div>
        {!validation.valid && <div className="validation-box">{validation.issues.map((item, index) => <p key={index}>{item.message}</p>)}</div>}
      </>}

      {error && <div className="error-banner">{error}</div>}
      <div className="wizard-actions"><button className="secondary" onClick={() => step === 0 ? onCancel() : setStep((current) => current - 1)}><ArrowLeft /> {step === 0 ? 'Cancel' : 'Back'}</button>{step < 3 ? <button className="primary" onClick={nextStep}>Continue <ArrowRight /></button> : <button className="primary" onClick={start} disabled={!validation.valid}>Deal roles & begin <ArrowRight /></button>}</div>
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
