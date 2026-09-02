import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BASE_PACK, BASE_ROLES } from '../data/base'
import { DARKEST_NIGHT_PACK, DARKEST_NIGHT_ROLES, HIDDEN_MOTIVES_PACK, HIDDEN_MOTIVES_ROLES, OFFICIAL_SCENARIO } from '../data/expansions'
import { DARKEST_ROLE as D, HIDDEN_ROLE as H, ROLE, FACTION } from '../domain/ids'
import { checksum, forkArtifact, previewImport, withChecksum } from '../domain/artifacts'
import type { Effect, GameSetup, GameState, RoleDefinition } from '../domain/types'
import { applyCommand, availableCommand, createInitialState, effectiveProperties, evaluateVictoryForTest, executeAbilityForTest, killPlayerForTest } from '../engine/engine'
import Editor from '../components/Editor'
import SetupWizard from '../components/SetupWizard'
import { reconcileGardenedSeats } from '../ui/setup'
import { friendlyFactionLabel, moderatorTraits } from '../ui/labels'

const allRoles = [...BASE_ROLES, ...DARKEST_NIGHT_ROLES, ...HIDDEN_MOTIVES_ROLES]
function makeSetup(ids: string[]): GameSetup {
  const counts = new Map<string, number>(); ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1))
  return { scenarioId: OFFICIAL_SCENARIO.id, packIds: [BASE_PACK.id, DARKEST_NIGHT_PACK.id, HIDDEN_MOTIVES_PACK.id],
    players: ids.map((id, index) => ({ id: `p${index}`, name: `Player ${index + 1}` })), exactDeck: ids,
    publicRoles: [...counts].map(([roleId, count]) => ({ roleId, min: count, max: count })),
    assignment: 'manual', manualAssignments: Object.fromEntries(ids.map((id, index) => [`p${index}`, id])), seed: 9, silentNight: true,
    rules: { scenario: structuredClone(OFFICIAL_SCENARIO), roles: structuredClone(allRoles) } }
}
function phase(state: GameState, phaseId: string, cycle = 1) {
  state.pipeline = 'cycle'; state.cycle = cycle; state.phaseId = phaseId
  state.phaseIndex = state.rules.scenario.cyclePipeline.findIndex(p => p.id === phaseId)
  state.pendingAnnouncements = []
  return state
}
function choose(state: GameState, targets: string[], abilityId?: string) {
  const action = availableCommand(state)
  expect(action.type).toBe('choose')
  if (action.type !== 'choose') throw new Error(JSON.stringify(action))
  if (abilityId) expect(action.abilityId).toBe(abilityId)
  return applyCommand(state, { type: 'choose', actorId: action.actorId, abilityId: action.abilityId, targets }).state
}
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Audit: gameplay regressions', () => {
  it('blocks the ritual while either cursed player is alive, including after revival', () => {
    let state = createInitialState(makeSetup([D.necromancer, ROLE.farmer, ROLE.farmer]))
    state = executeAbilityForTest(state, 'p0', `${D.necromancer}.curse`, ['p1', 'p2'])
    const ritual = { type: 'choose' as const, actorId: 'p0', abilityId: `${D.necromancer}.ritual`, targets: ['p0'] }
    expect(() => applyCommand(phase(state, 'official.night.actions'), ritual)).toThrow()
    state = killPlayerForTest(state, 'p1', 'Burned')
    expect(() => applyCommand(phase(state, 'official.night.actions'), ritual)).toThrow()
    state = killPlayerForTest(state, 'p2', 'Burned')
    expect(availableCommand(phase(state, 'official.night.actions'))).toMatchObject({ abilityId: ritual.abilityId })
    state.players[1].alive = true
    expect(() => applyCommand(phase(state, 'official.night.actions'), ritual)).toThrow()
    expect(state.players[0].roleState.ritualStarted).toBe(false)
    expect(state.gameOver).toBe(false)
  })
  it('starts a legal ritual only on confirmation and completes it on a later night', () => {
    let state = createInitialState(makeSetup([D.necromancer, ROLE.farmer, ROLE.farmer]))
    state = executeAbilityForTest(state, 'p0', `${D.necromancer}.curse`, ['p1', 'p2'])
    state = killPlayerForTest(killPlayerForTest(state, 'p1', 'Burned'), 'p2', 'Burned')
    state = choose(phase(state, 'official.night.actions'), [], `${D.necromancer}.ritual`)
    expect(state.players[0].roleState.ritualStarted).toBe(false)
    state = choose(phase(state, 'official.night.actions', 2), ['p0'], `${D.necromancer}.ritual`)
    expect(state.players[0].roleState.ritualStarted).toBe(true)
    expect(state.gameOver).toBe(false)
    state = choose(phase(state, 'official.night.actions', 3), [], `${D.necromancer}.ritual`)
    expect(state.gameOver).toBe(false)
    state = choose(phase(state, 'official.night.actions', 4), ['p0'], `${D.necromancer}.ritual`)
    expect(state.gameOver).toBe(true)
    expect(state.winners).toEqual(['p0'])
  })
  it.each([[H.thief, 'interrupt'], [H.guildMaster, 'recruit'], [H.assassin, 'kill']])('skipping %s preserves its power; using it consumes it', (roleId, suffix) => {
    const abilityId = `${roleId}.${suffix}`
    let state = createInitialState(makeSetup([roleId, ROLE.farmer, ROLE.alphaWolf, ROLE.farmer]))
    state = choose(phase(state, 'official.night.actions'), [], abilityId)
    expect(state.players[0].roleState[`ability-used:${abilityId}`]).not.toBe(true)
    state = choose(phase(state, 'official.night.actions', 2), ['p1'], abilityId)
    expect(state.players[0].roleState[`ability-used:${abilityId}`]).toBe(true)
    expect(availableCommand(phase(state, 'official.night.actions', 3))).not.toMatchObject({ abilityId })
  })
  it('skipping the Assassin must preserve its once-per-game power', () => {
    let state = createInitialState(makeSetup([H.assassin, ROLE.farmer, ROLE.alphaWolf, ROLE.farmer]))
    state = choose(phase(state, 'official.night.actions'), [], `${H.assassin}.kill`)
    expect(state.players[0].roleState[`ability-used:${H.assassin}.kill`]).not.toBe(true)
    expect(availableCommand(phase(state, 'official.night.actions', 2))).toMatchObject({ type: 'choose', abilityId: `${H.assassin}.kill` })
  })
  it('skipping the Healer must preserve the revive', () => {
    let state = createInitialState(makeSetup([ROLE.healer, ROLE.farmer, ROLE.alphaWolf, ROLE.farmer]))
    state = choose(phase(state, 'official.night.after-attacks'), [], `${ROLE.healer}.revive`)
    expect(state.players[0].roleState[`ability-used:${ROLE.healer}.revive`]).not.toBe(true)
  })
  it('a living Hag alone must not block the Village after all Shadow creatures die', () => {
    let state = createInitialState(makeSetup([D.hag, ROLE.alphaWolf, ROLE.farmer, ROLE.farmer]))
    state = evaluateVictoryForTest(killPlayerForTest(state, 'p1', 'Burned'))
    expect(state.gameOver).toBe(true)
    expect(state.winningFactions).toContain(FACTION.village)
    expect(state.winners).not.toContain('p0')
  })
  it('Outcast may win if Alpha dies before the final victory', () => {
    let state = createInitialState(makeSetup([D.outcastWolf, ROLE.alphaWolf, ROLE.farmer, ROLE.farmer, ROLE.farmer]))
    state = evaluateVictoryForTest(state)
    expect(state.gameOver).toBe(false)
    expect(state.personalLosers).toEqual([])
    for (const id of ['p1', 'p2', 'p3']) state = killPlayerForTest(state, id, 'Burned')
    state = evaluateVictoryForTest(state)
    expect(state.winningFactions).toContain(FACTION.wolves)
    expect(state.winners).toContain('p0')
  })
  it('Outcast still loses when Alpha survives to the actual ending', () => {
    const state = evaluateVictoryForTest(createInitialState(makeSetup([D.outcastWolf, ROLE.alphaWolf, ROLE.farmer])))
    expect(state.gameOver).toBe(true)
    expect(state.winners).toEqual(['p1'])
  })
  it('Vagrant must not bank survival before the game ends', () => {
    let state = createInitialState(makeSetup([D.vagrant, ROLE.alphaWolf, ROLE.farmer, ROLE.farmer, ROLE.farmer, ROLE.witch, ROLE.wizard, ROLE.clairvoyant]))
    state = evaluateVictoryForTest(state)
    expect(state.gameOver).toBe(false)
    expect(state.personalWinners).toEqual([])
    state = killPlayerForTest(state, 'p0', 'Burned')
    state = killPlayerForTest(state, 'p1', 'Burned')
    state = evaluateVictoryForTest(state)
    expect(state.winners).not.toContain('p0')
  })
  it('Vagrant still earns its six-player morning victory', () => {
    const state = evaluateVictoryForTest(createInitialState(makeSetup([D.vagrant, ROLE.alphaWolf, ROLE.farmer, ROLE.farmer, ROLE.witch, ROLE.wizard])))
    expect(state.players[0].alive).toBe(false)
    expect(state.personalWinners).toContainEqual({ playerId: 'p0', reason: 'Survived a night with six or fewer players.' })
  })
  it('a Necromancer ritual victory must include the Goblin', () => {
    let state = createInitialState(makeSetup([D.necromancer, H.goblin, H.leprechaun, ROLE.farmer]))
    state.players[0].roleState.ritualStarted = true
    state = choose(phase(state, 'official.night.actions'), ['p0'], `${D.necromancer}.ritual`)
    expect(state.gameOver).toBe(true)
    expect(state.winners).toContain('p1')
  })
  it('Undertaker team label must agree with its winning faction', () => {
    let state = createInitialState(makeSetup([D.undertaker, D.necromancer, ROLE.farmer, ROLE.farmer]))
    expect(effectiveProperties(state, 'p0').map(p => p.label)).toContain('Necromancer')
    state.players[1].roleState.ritualStarted = true
    state = choose(phase(state, 'official.night.actions'), ['p1'], `${D.necromancer}.ritual`)
    expect(state.winners).toContain('p0')
  })
  it('Vagrant earns end-of-game survival on an ability-triggered ending', () => {
    let state = createInitialState(makeSetup([D.necromancer, D.vagrant, ROLE.farmer]))
    state.players[0].roleState.ritualStarted = true
    state = choose(phase(state, 'official.night.actions'), ['p0'], `${D.necromancer}.ritual`)
    expect(state.winners).toEqual(['p0', 'p1'])
    expect(state.personalWinners).toContainEqual({ playerId: 'p1', reason: 'Survived to the end.' })
  })
  it('Crusades award Mystics without accidentally awarding unrelated factions', () => {
    let state = createInitialState(makeSetup([H.templar, H.inquisitor, ROLE.witch, ROLE.alphaWolf, ROLE.sinner]))
    state = killPlayerForTest(state, 'p1', 'Burned')
    state = evaluateVictoryForTest(state)
    expect(state.gameOver).toBe(true)
    expect(state.winners).toEqual(['p2'])
    expect(state.winningFactions).toEqual([])
  })
})

describe('Audit: exports and compatibility', () => {
  it.each([DARKEST_NIGHT_PACK, HIDDEN_MOTIVES_PACK, OFFICIAL_SCENARIO])('$meta.name exports must reimport as identical', artifact => {
    const preview = previewImport(JSON.stringify(withChecksum(artifact)), [artifact])
    expect(preview.status, preview.issues.join('; ')).toBe('identical')
  })
  it('nested unsupported effects must be unavailable', () => {
    const role = structuredClone(BASE_ROLES[0])
    role.abilities[0].effects = [{ type: 'conditional', condition: { op: 'always' }, effects: [{ type: 'unknown-future-effect' }] }] as unknown as Effect[]
    const preview = previewImport(JSON.stringify(withChecksum(role)), [])
    expect(preview.status).toBe('unsupported')
  })
  it('canonical checksums match JSON for omitted fields and undefined array entries', () => {
    const value = { optional: undefined, values: [1, undefined, null], nested: { unused: undefined } }
    expect(checksum(value)).toBe(checksum(JSON.parse(JSON.stringify(value))))
  })
  it.each(['status-effect', 'status-condition', 'status-selector'])('rejects an unsupported nested %s', (variant) => {
    const role: RoleDefinition = structuredClone(BASE_ROLES[0])
    const ability = structuredClone(role.abilities[0])
    if (variant === 'status-effect') ability.effects = [{ type: 'future-effect' }] as unknown as Effect[]
    if (variant === 'status-condition') ability.condition = { op: 'future-condition' } as unknown as typeof ability.condition
    if (variant === 'status-selector') ability.effects = [{ type: 'learnPlayers', targets: { kind: 'future-selector' }, label: 'Test' }] as unknown as Effect[]
    role.abilities = [{ ...role.abilities[0], effects: [{ type: 'addStatus', targets: { kind: 'self' }, status: { id: 'test.status', name: 'Test', abilities: [ability] } }] }]
    expect(previewImport(JSON.stringify(withChecksum(role)), []).status).toBe('unsupported')
    role.statuses = [{ id: 'test.status', name: 'Test', abilities: [ability] }]
    role.abilities = []
    expect(previewImport(JSON.stringify(withChecksum(role)), []).status).toBe('unsupported')
  })
})

describe('Audit: editor and setup interactions', () => {
  it('typing a multiword team label should preserve spaces', () => {
    const role = forkArtifact(BASE_ROLES[0])
    render(<Editor artifact={role} traitCatalogue={[]} onSaved={() => {}} onClose={() => {}} />)
    const input = screen.getByLabelText('Team / win condition label') as HTMLInputElement
    for (const letter of 'Wolf Pack') fireEvent.change(input, { target: { value: input.value + letter } })
    expect(input.value).toBe('Wolf Pack')
  })
  it('removing a gardened role from the deck must clear the hidden lock', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { container } = render(<SetupWizard roles={allRoles} packs={[BASE_PACK, DARKEST_NIGHT_PACK, HIDDEN_MOTIVES_PACK]} scenarios={[OFFICIAL_SCENARIO]} onCancel={() => {}} onStart={() => {}} />)
    const next = () => fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }))
    next()
    for (let i = 1; i <= 6; i++) fireEvent.change(screen.getByLabelText(`Player ${i} name`), { target: { value: `Person ${i}` } })
    next()
    for (const name of ['Alpha Wolf', 'Clairvoyant', 'Wizard', 'Medium', 'Witch', 'Healer']) fireEvent.click(screen.getByLabelText(`${name} in play`))
    next()
    fireEvent.click(screen.getByRole('button', { name: /Gardened allocation/i }))
    fireEvent.change(container.querySelector('.assignment-list select')!, { target: { value: ROLE.alphaWolf } })
    expect(screen.getByRole('button', { name: /Deal roles & begin/i })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }))
    fireEvent.click(screen.getByLabelText('Alpha Wolf in play'))
    fireEvent.click(screen.getByLabelText('Sinner in play'))
    next()
    expect((container.querySelector('.assignment-list select') as HTMLSelectElement).value).toBe('')
    expect(container.querySelector('.validation-box')).toBeNull()
    expect(screen.getByRole('button', { name: /Deal roles & begin/i })).not.toBeDisabled()
  })
  it('releases excess copies without disturbing other gardened seats', () => {
    const players = [{ id: 'a', name: 'A', lockedRoleId: ROLE.farmer }, { id: 'b', name: 'B', lockedRoleId: ROLE.farmer }, { id: 'c', name: 'C', lockedRoleId: ROLE.alphaWolf }]
    const seats = reconcileGardenedSeats(players, [ROLE.farmer, ROLE.alphaWolf, ROLE.sinner])
    expect(seats.map(p => p.lockedRoleId)).toEqual([ROLE.farmer, undefined, ROLE.alphaWolf])
    expect(reconcileGardenedSeats(seats, [ROLE.farmer, ROLE.alphaWolf, ROLE.sinner])).toBe(seats)
    expect(reconcileGardenedSeats(seats, [ROLE.sinner, ROLE.sinner, ROLE.sinner]).every(p => !p.lockedRoleId)).toBe(true)
  })
  it('uses friendly team names and only Corrupt / Mystic display traits', () => {
    expect(friendlyFactionLabel(FACTION.neutral)).toBe('Third Party')
    expect(friendlyFactionLabel(FACTION.necromancer)).toBe('Necromancer')
    expect(friendlyFactionLabel(FACTION.loneWolf)).toBe('Lone Wolf')
    const wolf = BASE_ROLES.find(role => role.id === ROLE.alphaWolf)!
    expect(moderatorTraits(wolf.traits, wolf.traitDefinitions ?? []).map(trait => trait.label)).toEqual(['Corrupt'])
    expect(moderatorTraits(wolf.traits, (wolf.traitDefinitions ?? []).map(trait => ({ ...trait, label: trait.label.toLowerCase() }))).map(trait => trait.label)).toEqual(['Corrupt'])
  })
})
