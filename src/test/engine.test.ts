import { describe, expect, it } from 'vitest'
import { BASE_DEALT_ROLES, BASE_ROLES, BASE_SCENARIO } from '../data/base'
import { FACTION, ROLE } from '../domain/ids'
import { forkArtifact } from '../domain/artifacts'
import type { GameSetup, RoleDefinition } from '../domain/types'
import {
  applyCommand, applyToSession, availableCommand, createInitialState, createSession, currentState,
  executeAbilityForTest, killPlayerForTest, redo, resolveAttackForTest, resolveMorningForTest,
  runRoleTestBench, undo, validateSetup,
} from '../engine/engine'

function setupFor(roleIds: string[], customRoles: RoleDefinition[] = []): GameSetup {
  const roles = [...BASE_ROLES.filter((base) => !customRoles.some((custom) => custom.id === base.id)), ...customRoles]
  const players = roleIds.map((roleId, index) => ({ id: `p${index}`, name: `Player ${index + 1}` }))
  const counts = new Map<string, number>(); roleIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
  return {
    scenarioId: BASE_SCENARIO.id, packIds: [], players, exactDeck: roleIds,
    publicRoles: [...counts].map(([roleId, count]) => ({ roleId, min: count, max: count })),
    assignment: 'manual', manualAssignments: Object.fromEntries(players.map((player, index) => [player.id, roleIds[index]])),
    seed: 42, rules: { scenario: structuredClone(BASE_SCENARIO), roles },
  }
}

describe('Base artifact coverage', () => {
  it('defines Farmer as the repeatable Base role with a default maximum of three', () => {
    expect(BASE_ROLES.find((role) => role.id === ROLE.farmer)?.multiplicity).toEqual({ min: 0, max: 3 })
    expect(BASE_DEALT_ROLES.filter((role) => role.id !== ROLE.farmer).every((role) => role.multiplicity.max === 1)).toBe(true)
  })

  it('ships all 21 dealt roles plus the Romeo status', () => {
    expect(BASE_DEALT_ROLES).toHaveLength(21)
    expect(BASE_ROLES).toHaveLength(22)
    expect(BASE_DEALT_ROLES.some((role) => role.id === ROLE.romeo)).toBe(false)
    expect(BASE_ROLES.find((role) => role.id === ROLE.romeo)?.categories).toContain('Status')
  })

  it.each(BASE_ROLES.map((role) => [role.meta.name, role] as const))('%s has a valid data-driven behavior surface', (_name, role) => {
    expect(role.meta.checksum).toMatch(/^fnv1a-/)
    expect(role.text.summary.length).toBeGreaterThan(8)
    expect(role.abilities.every((ability) => ability.effects.length > 0)).toBe(true)
    for (const trigger of new Set(role.abilities.map((ability) => ability.trigger))) expect(() => runRoleTestBench(role, trigger)).not.toThrow()
  })
})

describe('Setup validation and deterministic history', () => {
  it('validates ranges, capabilities and exact player count', () => {
    const setup = setupFor([ROLE.alphaWolf, ROLE.farmer, ROLE.clairvoyant])
    expect(validateSetup(setup).valid).toBe(true)
    setup.publicRoles[0].max = 0
    expect(validateSetup(setup).issues.some((entry) => entry.message.includes('outside'))).toBe(true)
  })

  it('blocks dependency order violations with a precise explanation', () => {
    const setup = setupFor([ROLE.alphaWolf, ROLE.witch, ROLE.farmer])
    setup.nightOrder = ['wherewolf.base.ability.wolf-bite', `${ROLE.witch}.protect`]
    const result = validateSetup(setup)
    expect(result.valid).toBe(false)
    expect(result.issues.some((entry) => entry.message.includes('Protection must exist'))).toBe(true)
  })

  it('offers Clairvoyant and Wizard checks on N0', () => {
    const state = createInitialState(setupFor([ROLE.clairvoyant, ROLE.wizard, ROLE.alphaWolf]))
    const first = availableCommand(state)
    expect(first.type).toBe('choose')
    expect(first.type === 'choose' && first.abilityId).toBe(`${ROLE.clairvoyant}.setup-check`)
    expect(first.type === 'choose' && first.instructions).toContain('Say “Clairvoyant, wake up and check a player for corruption.”')
  })

  it('wakes all Wolves together and shows the Pack and Defector once', () => {
    let state = createInitialState(setupFor([ROLE.alphaWolf, ROLE.packWolf, ROLE.wolfPup, ROLE.defector]))
    const action = availableCommand(state)
    expect(action).toMatchObject({
      type: 'choose',
      abilityId: 'wherewolf.base.ability.wolf-intro',
      title: 'Wolf Pack · Meet the Pack',
      participantIds: ['p0', 'p1', 'p2'],
      information: [{ label: 'Defector', value: 'Player 4', status: 'in-play' }],
    })
    if (action.type !== 'choose') return
    state = applyCommand(state, { type: 'choose', actorId: action.actorId, abilityId: action.abilityId, targets: [] }).state
    expect(state.completedActions.filter((key) => key.endsWith(':wherewolf.base.ability.wolf-intro'))).toHaveLength(3)
    expect(availableCommand(state)).toMatchObject({ type: 'advance', title: 'Day 1 discussion', actionLabel: 'Begin first vote' })
  })

  it('shows the Monk more than the minimum absent roles prepared before play', () => {
    const setup = setupFor([ROLE.monk, ROLE.farmer, ROLE.alphaWolf])
    setup.publicRoles.push({ roleId: ROLE.bard, min: 0, max: 1 }, { roleId: ROLE.innkeeper, min: 0, max: 1 }, { roleId: ROLE.hermit, min: 0, max: 1 })
    setup.absentRoleSelections = { [ROLE.monk]: { [`${ROLE.monk}.reveal`]: [ROLE.bard, ROLE.innkeeper, ROLE.hermit] } }
    const pending = availableCommand(createInitialState(setup))
    expect(pending.type).toBe('choose')
    expect(pending).toMatchObject({ min: 0, max: 0, candidates: [], information: [{ label: 'Absent roles', value: 'Bard, Innkeeper, and Hermit' }] })
  })

  it('replays assignment from the stored random state and supports undo/redo', () => {
    const setup = setupFor([ROLE.alphaWolf, ROLE.farmer, ROLE.clairvoyant])
    setup.assignment = 'random'; delete setup.manualAssignments
    expect(createInitialState(setup).players.map((player) => player.roleId)).toEqual(createInitialState(setup).players.map((player) => player.roleId))
    const session = createSession(setup)
    const advanced = applyToSession(session, { type: 'override', reason: 'Provider-free history test.', operation: { type: 'life', playerId: 'p1', alive: false } })
    expect(currentState(advanced).players[1].alive).toBe(false)
    expect(currentState(undo(advanced)).players[1].alive).toBe(true)
    expect(currentState(redo(undo(advanced))).players[1].alive).toBe(false)
  })
})

describe('Voting rules', () => {
  function atFirstVote(roleIds: string[]) {
    const state = createInitialState(setupFor(roleIds)); state.pipeline = 'cycle'; state.cycle = 1; state.phaseIndex = 1; state.phaseId = 'base.day.nomination-vote'; return state
  }

  it('halves Seducer votes received in the first vote, rounding up', () => {
    const state = atFirstVote([ROLE.seducer, ROLE.farmer, ROLE.alphaWolf, ROLE.clairvoyant])
    const result = applyCommand(state, { type: 'vote', totals: { p0: 3, p1: 1, p2: 0, p3: 0 } }).state
    expect(result.votes?.raw.p0).toBe(3)
    expect(result.votes?.effective.p0).toBe(2)
  })

  it('dispatches one post-tally event after effective totals are stored', () => {
    const state = atFirstVote([ROLE.farmer, ROLE.farmer, ROLE.alphaWolf])
    state.players[0].statuses.push({
      id: 'test.observe-tally', name: 'Observe tally', duration: 'permanent', appliedCycle: 1,
      abilities: [{ id: 'test.observe-tally.ability', name: 'Remember tally', kind: 'status', trigger: 'vote.afterTally', effects: [{ type: 'setState', key: 'sawFinalTally', value: true }] }],
    })
    const result = applyCommand(state, { type: 'vote', totals: { p0: 2, p1: 1, p2: 0 } }).state
    expect(result.players[0].roleState.sawFinalTally).toBe(true)
    const events = result.events.filter((event) => event.type === 'vote.afterTally')
    expect(events).toHaveLength(1)
    expect(events[0].data).toMatchObject({ raw: { p0: 2, p1: 1, p2: 0 }, effective: { p0: 2, p1: 1, p2: 0 } })
  })

  it('lets a Seducer candidate vote on the final Ballot', () => {
    const state = atFirstVote([ROLE.seducer, ROLE.farmer, ROLE.alphaWolf, ROLE.clairvoyant])
    state.phaseIndex = 3; state.phaseId = 'base.day.ballot-vote'; state.ballot = ['p0', 'p1']
    const pending = availableCommand(state)
    expect(pending.type).toBe('vote')
    expect(pending.type === 'vote' && pending.expected).toBe(3)
  })

  it('warns on an invalid raw total but can permanently accept and resolve it', () => {
    const state = atFirstVote([ROLE.farmer, ROLE.farmer, ROLE.alphaWolf])
    expect(() => applyCommand(state, { type: 'vote', totals: { p0: 1, p1: 0, p2: 0 } })).toThrow(/expected 3/i)
    const accepted = applyCommand(state, { type: 'vote', totals: { p0: 1, p1: 0, p2: 0 }, acceptInvalid: true }).state
    expect(accepted.acceptedInvalidTallies).toBe(1)
    expect(accepted.votes?.acceptedInvalid).toBe(true)
  })

  it('calculates the Ballot automatically and tells the moderator what to announce', () => {
    const state = applyCommand(atFirstVote([ROLE.farmer, ROLE.alphaWolf, ROLE.clairvoyant]), { type: 'vote', totals: { p0: 2, p1: 1, p2: 0 } }).state
    expect(state.ballot).toEqual(['p0', 'p1'])
    expect(availableCommand(state)).toMatchObject({
      type: 'advance',
      title: 'On the ballot: Player 1 and Player 2.',
      actionLabel: 'Begin Ballot vote',
    })
  })

  it('uses commas and an Oxford comma for a Ballot of more than two players', () => {
    const state = applyCommand(atFirstVote([ROLE.farmer, ROLE.alphaWolf, ROLE.clairvoyant]), { type: 'vote', totals: { p0: 1, p1: 1, p2: 1 } }).state
    expect(availableCommand(state)).toMatchObject({ type: 'advance', title: 'On the ballot: Player 1, Player 2, and Player 3.' })
  })

  it('applies a unique Ballot result automatically and states who the village burns', () => {
    let state = atFirstVote([ROLE.farmer, ROLE.alphaWolf, ROLE.clairvoyant])
    state.phaseIndex = 3; state.phaseId = 'base.day.ballot-vote'; state.ballot = ['p0', 'p1']
    state = applyCommand(state, { type: 'vote', totals: { p0: 1, p1: 0 } }).state
    expect(state.players[0].alive).toBe(false)
    expect(state.phaseId).toBe('base.night.actions')
    expect(availableCommand(state)).toMatchObject({
      type: 'advance',
      title: 'The village has decided to burn Player 1.',
      actionLabel: 'Continue to night',
    })
  })

  it('qualifies highest plus second, then substitutes Guardian after qualification', () => {
    let state = atFirstVote([ROLE.guardian, ROLE.farmer, ROLE.alphaWolf, ROLE.clairvoyant])
    state.relationships.push({ type: 'wherewolf.base.relationship.guarded', from: 'p0', to: 'p1' })
    state = applyCommand(state, { type: 'vote', totals: { p0: 0, p1: 2, p2: 1, p3: 1 } }).state
    state = applyCommand(state, { type: 'advance' }).state
    expect(state.ballot).toEqual(expect.arrayContaining(['p0', 'p2', 'p3']))
    expect(state.ballot).not.toContain('p1')
  })

  it('states that a substituted Guardian burns when the guarded player was the only qualifier', () => {
    let state = atFirstVote([ROLE.guardian, ROLE.farmer, ROLE.alphaWolf])
    state.relationships.push({ type: 'wherewolf.base.relationship.guarded', from: 'p0', to: 'p1' })
    state = applyCommand(state, { type: 'vote', totals: { p0: 0, p1: 3, p2: 0 } }).state
    expect(state.ballot).toEqual(['p0'])
    expect(state.players[0].alive).toBe(false)
    expect(state.players[1].alive).toBe(true)
    expect(availableCommand(state)).toMatchObject({ type: 'advance', title: 'The village has decided to burn Player 1.' })
  })

  it('immediately resolves a single-candidate Ballot and moves to night', () => {
    let state = atFirstVote([ROLE.farmer, ROLE.alphaWolf, ROLE.clairvoyant])
    state = applyCommand(state, { type: 'vote', totals: { p0: 3, p1: 0, p2: 0 } }).state
    state = applyCommand(state, { type: 'advance' }).state
    expect(state.ballot).toEqual(['p0'])
    expect(state.players[0].alive).toBe(false)
    expect(state.phaseId).toBe('base.night.actions')
  })

  it('skips the single-candidate burn after a Jester cancellation and moves to night', () => {
    let state = atFirstVote([ROLE.farmer, ROLE.alphaWolf, ROLE.clairvoyant])
    state.facts.cancelBurnCycle = 1
    state = applyCommand(state, { type: 'vote', totals: { p0: 3, p1: 0, p2: 0 } }).state
    expect(availableCommand(state)).toMatchObject({ type: 'advance', title: 'The village is undecided.', actionLabel: 'Continue to night' })
    state = applyCommand(state, { type: 'advance' }).state
    expect(state.players[0].alive).toBe(true)
    expect(state.facts.cancelBurnCycle).toBeUndefined()
    expect(state.events.some((event) => event.type === 'burn.resolved' && event.data?.cancelled === true)).toBe(true)
    expect(state.phaseId).toBe('base.night.actions')
  })

  it('shows role information as the next step before another action', () => {
    let state = createInitialState(setupFor([ROLE.clairvoyant, ROLE.alphaWolf, ROLE.farmer]))
    const action = availableCommand(state)
    expect(action.type).toBe('choose')
    if (action.type !== 'choose') return
    state = applyCommand(state, { type: 'choose', actorId: action.actorId, abilityId: action.abilityId, targets: ['p1'] }).state
    const result = availableCommand(state)
    expect(result).toMatchObject({ type: 'advance', title: 'Result' })
    state = applyCommand(state, { type: 'advance' }).state
    expect(availableCommand(state).type).toBe('choose')
  })

  it('cancels only the Jester’s following chronological day burn', () => {
    let state = atFirstVote([ROLE.jester, ROLE.farmer, ROLE.alphaWolf])
    state.phaseIndex = 4; state.phaseId = 'base.day.burn'; state.ballot = ['p0']; state.votes = { kind: 'ballot', candidates: ['p0'], raw: { p0: 2 }, effective: { p0: 2 }, expected: 2, acceptedInvalid: false }
    state = applyCommand(state, { type: 'advance' }).state
    expect(state.personalWinners.map((winner) => winner.playerId)).toContain('p0')
    expect(state.facts.cancelBurnCycle).toBe(2)
    state.gameOver = false; state.cycle = 2; state.phaseIndex = 4; state.phaseId = 'base.day.burn'; state.ballot = ['p1']; state.votes = { kind: 'ballot', candidates: ['p1'], raw: { p1: 2 }, effective: { p1: 2 }, expected: 2, acceptedInvalid: false }
    state = applyCommand(state, { type: 'advance' }).state
    expect(state.players.find((player) => player.id === 'p1')?.alive).toBe(true)
    expect(state.facts.cancelBurnCycle).toBeUndefined()
  })
})

describe('Typed attack lifecycle', () => {
  function guardianState(custom?: RoleDefinition) {
    const state = createInitialState(setupFor([custom?.id ?? ROLE.guardian, ROLE.farmer, ROLE.alphaWolf, ROLE.witch], custom ? [custom] : []))
    state.pipeline = 'cycle'; state.cycle = 1; state.phaseIndex = 6; state.phaseId = 'base.night.attacks'
    state.relationships.push({ type: 'wherewolf.base.relationship.guarded', from: 'p0', to: 'p1' })
    return state
  }

  it('prevents the original shadow attack before Guardian can trigger', () => {
    const state = guardianState()
    state.players[1].statuses.push({ id: 'ward', name: 'Protected from shadow attacks', data: { attackType: 'shadow' }, duration: 'night', appliedCycle: 1 })
    const result = resolveAttackForTest(state, 'p1')
    expect(result.players[0].alive).toBe(true); expect(result.players[1].alive).toBe(true)
    expect(result.events.some((event) => event.type === 'attack.redirected')).toBe(false)
  })

  it('Base Guardian retargets a successful attack and remains protectable', () => {
    const state = guardianState()
    state.players[0].statuses.push({ id: 'ward', name: 'Protected from shadow attacks', data: { attackType: 'shadow' }, duration: 'night', appliedCycle: 1 })
    state.players[3].statuses.push({
      id: 'test.observe-attack-outcomes', name: 'Observe attack outcomes', duration: 'permanent', appliedCycle: 1,
      abilities: [
        { id: 'test.observe-attack-redirect', name: 'Remember redirect', kind: 'status', trigger: 'attack.redirected', effects: [{ type: 'setState', key: 'sawAttackRedirect', value: true }] },
        { id: 'test.observe-attack-prevention', name: 'Remember prevention', kind: 'status', trigger: 'attack.prevented', effects: [{ type: 'setState', key: 'sawAttackPrevention', value: true }] },
      ],
    })
    const result = resolveAttackForTest(state, 'p1')
    expect(result.players[0].alive).toBe(true); expect(result.players[1].alive).toBe(true)
    expect(result.events.some((event) => event.type === 'attack.redirected' && event.targetId === 'p0')).toBe(true)
    expect(result.events.some((event) => event.type === 'attack.prevented' && event.targetId === 'p0')).toBe(true)
    expect(result.players[3].roleState).toMatchObject({ sawAttackRedirect: true, sawAttackPrevention: true })
  })

  it('re-runs the direct-kill attempt lifecycle on a redirected target', () => {
    const killer = forkArtifact(BASE_ROLES.find((role) => role.id === ROLE.farmer)!) as RoleDefinition
    killer.meta.name = 'Direct killer'
    killer.abilities = [{
      id: `${killer.id}.kill`, name: 'Kill', kind: 'active', trigger: 'night.action',
      target: { label: 'Target', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true },
      effects: [{ type: 'kill', targets: { kind: 'chosen' }, cause: 'test direct kill', modifiers: { guardable: true } }],
    }]
    const state = createInitialState(setupFor([ROLE.guardian, killer.id, ROLE.farmer], [killer]))
    state.pipeline = 'cycle'; state.cycle = 1; state.phaseIndex = 5; state.phaseId = 'base.night.actions'
    state.relationships.push({ type: 'wherewolf.base.relationship.guarded', from: 'p0', to: 'p2' })
    state.players[0].statuses.push({
      id: 'test.redirected-kill-shield', name: 'Redirected kill shield', duration: 'permanent', appliedCycle: 1,
      abilities: [
        { id: 'test.prevent-redirected-kill', name: 'Prevent redirected kill', kind: 'status', trigger: 'kill.attempted', condition: { op: 'targetIsSelf' }, effects: [{ type: 'preventEvent', reason: 'Redirected target reacted.' }] },
        { id: 'test.observe-kill-redirect', name: 'Remember redirect', kind: 'status', trigger: 'kill.redirected', effects: [{ type: 'setState', key: 'sawKillRedirect', value: true }] },
        { id: 'test.observe-kill-prevention', name: 'Remember prevention', kind: 'status', trigger: 'kill.prevented', effects: [{ type: 'setState', key: 'sawKillPrevention', value: true }] },
      ],
    })
    const result = executeAbilityForTest(state, 'p1', `${killer.id}.kill`, ['p2'])
    expect(result.players[0].alive).toBe(true)
    expect(result.players[2].alive).toBe(true)
    expect(result.events.filter((event) => event.type === 'kill.attempted').map((event) => event.targetId)).toEqual(['p2', 'p0'])
    expect(result.events.some((event) => event.type === 'kill.prevented' && event.targetId === 'p0')).toBe(true)
    expect(result.players[0].roleState).toMatchObject({ sawKillRedirect: true, sawKillPrevention: true })
  })

  it('bounds a direct-kill redirection cycle and records prevention', () => {
    const killer = forkArtifact(BASE_ROLES.find((role) => role.id === ROLE.farmer)!) as RoleDefinition
    killer.abilities = [{
      id: `${killer.id}.kill`, name: 'Kill', kind: 'active', trigger: 'night.action',
      target: { label: 'Target', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true },
      effects: [{ type: 'kill', targets: { kind: 'chosen' }, cause: 'cyclic kill', modifiers: { guardable: true } }],
    }]
    const state = createInitialState(setupFor([ROLE.guardian, killer.id, ROLE.farmer], [killer]))
    state.relationships.push(
      { type: 'wherewolf.base.relationship.guarded', from: 'p0', to: 'p2' },
      { type: 'test.relationship.guarded', from: 'p2', to: 'p0' },
    )
    state.players[2].statuses.push({
      id: 'test.second-guardian', name: 'Second guardian', duration: 'permanent', appliedCycle: 0,
      abilities: [{
        id: 'test.second-guardian.redirect', name: 'Redirect', kind: 'status', trigger: 'kill.attempted',
        condition: { op: 'targetIsRelationship', relationship: 'test.relationship.guarded' },
        effects: [{ type: 'redirectEvent', targets: { kind: 'self' }, reason: 'Second guard', preventable: true }],
      }],
    })
    const result = executeAbilityForTest(state, 'p1', `${killer.id}.kill`, ['p2'])
    expect(result.players[0].alive).toBe(true)
    expect(result.players[2].alive).toBe(true)
    expect(result.events.some((event) => event.type === 'kill.prevented' && event.data?.reason === 'Redirection cycle')).toBe(true)
  })

  it('a cloned role can make mandatory absorption without scenario or engine changes', () => {
    const guardian = forkArtifact(BASE_ROLES.find((role) => role.id === ROLE.guardian)! as RoleDefinition)
    guardian.meta.name = 'Doomed Guardian'
    guardian.abilities = guardian.abilities.map((ability) => ({ ...ability, effects: ability.effects.map((effect) => effect.type === 'redirectEvent' ? { ...effect, preventable: false } : effect) }))
    const state = guardianState(guardian)
    state.players[0].statuses.push({ id: 'ward', name: 'Protected from shadow attacks', data: { attackType: 'shadow' }, duration: 'night', appliedCycle: 1 })
    const result = resolveAttackForTest(state, 'p1')
    expect(result.players[0].alive).toBe(false); expect(result.players[1].alive).toBe(true)
  })

  it('resolves Defector awakening and Farmer variants through role data', () => {
    const defectorState = createInitialState(setupFor([ROLE.defector, ROLE.alphaWolf, ROLE.farmer])); defectorState.cycle = 1; defectorState.phaseId = 'base.night.attacks'
    expect(resolveAttackForTest(defectorState, 'p0').players[0].alive).toBe(true)
    const farmer = createInitialState(setupFor([ROLE.farmer, ROLE.alphaWolf, ROLE.clairvoyant])); farmer.cycle = 1; farmer.phaseId = 'base.night.attacks'; farmer.players[0].roleState.latent = 'wolf_descendant'
    const transformed = resolveAttackForTest(farmer, 'p0')
    expect(transformed.players[0].roleId).toBe(ROLE.packWolf)
    expect(transformed.players[0].alive).toBe(true)
  })

  it('uses the strongest living Wolf attacker regardless of seat order', () => {
    const state = createInitialState(setupFor([ROLE.packWolf, ROLE.farmer, ROLE.alphaWolf]))
    state.pipeline = 'cycle'; state.cycle = 1; state.phaseIndex = 5; state.phaseId = 'base.night.actions'
    const pending = availableCommand(state)
    expect(pending.type === 'choose' && pending.actorId).toBe('p2')
  })

  it('allows the Pack to bite the acting Wolf or another Wolf', () => {
    const state = createInitialState(setupFor([ROLE.packWolf, ROLE.farmer, ROLE.alphaWolf]))
    state.pipeline = 'cycle'; state.cycle = 1; state.phaseIndex = 5; state.phaseId = 'base.night.actions'
    const pending = availableCommand(state)
    expect(pending.type).toBe('choose')
    expect(pending.type === 'choose' && pending.actorId).toBe('p2')
    expect(pending.type === 'choose' && pending.candidates).toEqual(expect.arrayContaining(['p0', 'p2']))
  })

  it('grows a lone Pup only after its skipped night', () => {
    const state = createInitialState(setupFor([ROLE.wolfPup, ROLE.farmer, ROLE.clairvoyant])); state.pipeline = 'cycle'; state.cycle = 2; state.phaseIndex = 8; state.phaseId = 'base.morning.victory'
    const result = applyCommand(state, { type: 'advance' }).state
    expect(result.players[0].roleId).toBe(ROLE.packWolf)
  })

  it('Madman cancels only the first attack on the following night', () => {
    let state = createInitialState(setupFor([ROLE.madman, ROLE.farmer, ROLE.alphaWolf])); state.pipeline = 'cycle'; state.cycle = 1; state.phaseId = 'base.night.attacks'
    state = resolveAttackForTest(state, 'p0')
    expect(state.personalWinners.map((winner) => winner.playerId)).toContain('p0')
    expect(state.facts.cancelShadowAttackCycle).toBe(2)
    state.cycle = 2
    state = resolveAttackForTest(state, 'p1')
    expect(state.players[1].alive).toBe(true)
    expect(state.facts.cancelShadowAttackCycle).toBeUndefined()
  })
})

describe('Revival, grief and morning ordering', () => {
  it('Healer revives a night death once through its effect definition', () => {
    let state = createInitialState(setupFor([ROLE.healer, ROLE.farmer, ROLE.alphaWolf])); state.cycle = 1; state.phaseId = 'base.night.actions'
    state.players[1].alive = false; state.facts.nightDeaths = ['p1']
    state = executeAbilityForTest(state, 'p0', `${ROLE.healer}.revive`, ['p1'])
    expect(state.players[1].alive).toBe(true)
    expect(state.players[0].roleState['revive-used']).toBe(true)
  })

  it('schedules the Healer only after attacks have produced night deaths', () => {
    let state = createInitialState(setupFor([ROLE.healer, ROLE.farmer, ROLE.alphaWolf])); state.pipeline = 'cycle'; state.cycle = 1; state.phaseIndex = 5; state.phaseId = 'base.night.actions'
    const bite = availableCommand(state)
    expect(bite.type === 'choose' && bite.abilityId).toBe('wherewolf.base.ability.wolf-bite')
    state = applyCommand(state, { type: 'choose', actorId: 'p2', abilityId: 'wherewolf.base.ability.wolf-bite', targets: ['p1'] }).state
    expect(availableCommand(state)).toMatchObject({ type: 'advance', kind: 'tap', targetIds: ['p1'] })
    state = applyCommand(state, { type: 'advance' }).state
    expect(availableCommand(state)).toMatchObject({ type: 'advance' })
    state = applyCommand(state, { type: 'advance' }).state
    const healer = availableCommand(state)
    expect(healer.type === 'choose' && healer.abilityId).toBe(`${ROLE.healer}.revive`)
    expect(healer.type === 'choose' && healer.candidates).toContain('p1')
  })

  it('Lover grief waits until morning and is averted if the original death is revived', () => {
    let state = createInitialState(setupFor([ROLE.juliet, ROLE.farmer, ROLE.alphaWolf])); state.cycle = 1
    state.relationships.push({ type: 'wherewolf.base.relationship.romeo', from: 'p0', to: 'p1' }, { type: 'wherewolf.base.relationship.juliet', from: 'p1', to: 'p0' })
    state = killPlayerForTest(state, 'p1', 'Burned')
    expect(state.players[0].alive).toBe(true)
    expect(state.pendingDeaths.some((death) => death.playerId === 'p0')).toBe(true)
    const notRevived = resolveMorningForTest(state)
    expect(notRevived.players[0].alive).toBe(false)
    state.players[1].alive = true
    const revived = resolveMorningForTest(state)
    expect(revived.players[0].alive).toBe(true)
  })
})

describe('Victory combinations', () => {
  it('ends at Village elimination and includes existing personal winners', () => {
    const state = createInitialState(setupFor([ROLE.farmer, ROLE.jester, ROLE.alphaWolf])); state.pipeline = 'cycle'; state.cycle = 2; state.phaseIndex = 8; state.phaseId = 'base.morning.victory'; state.players[2].alive = false; state.personalWinners.push({ playerId: 'p1', reason: 'Burned earlier.' })
    const result = applyCommand(state, { type: 'advance' }).state
    expect(result.gameOver).toBe(true)
    expect(result.winningFactions).toContain(FACTION.village)
    expect(result.winners).toEqual(expect.arrayContaining(['p0', 'p1']))
    expect(availableCommand(result)).toMatchObject({ type: 'game-over', title: 'Village victory', winners: expect.arrayContaining(['p0', 'p1']), factions: [FACTION.village] })
  })

  it('prepares plain-language morning announcements when no faction has won', () => {
    const state = createInitialState(setupFor([ROLE.farmer, ROLE.farmer, ROLE.alphaWolf])); state.pipeline = 'cycle'; state.cycle = 1; state.phaseIndex = 8; state.phaseId = 'base.morning.victory'
    const result = applyCommand(state, { type: 'advance' }).state
    expect(result.gameOver).toBe(false)
    expect(availableCommand(result)).toMatchObject({ type: 'advance', title: 'Make the morning announcements.', actionLabel: 'Begin the next day' })
    const announcement = availableCommand(result)
    expect(announcement.type === 'advance' && announcement.description).toContain('There were no deaths in the night.')
  })

  it('checks morning victory before emitting ordinary announcements', () => {
    const state = createInitialState(setupFor([ROLE.farmer, ROLE.innkeeper, ROLE.alphaWolf])); state.pipeline = 'cycle'; state.cycle = 2; state.phaseIndex = 8; state.phaseId = 'base.morning.victory'; state.players[2].alive = false; state.facts.nightDeaths = ['p2']; state.facts['last-clairvoyant-corrupt'] = true
    const result = applyCommand(state, { type: 'advance' }).state
    expect(result.gameOver).toBe(true)
    expect(result.events.some((event) => event.visibility === 'public' && event.message.startsWith('Deaths:'))).toBe(false)
    expect(result.events.some((event) => event.visibility === 'public' && event.message.startsWith('Innkeeper:'))).toBe(false)
  })

  it('allows a dead Guardian to win when the guarded player survives', () => {
    const state = createInitialState(setupFor([ROLE.guardian, ROLE.farmer, ROLE.alphaWolf])); state.pipeline = 'cycle'; state.cycle = 2; state.phaseIndex = 8; state.phaseId = 'base.morning.victory'; state.players[0].alive = false; state.players[2].alive = false; state.relationships.push({ type: 'wherewolf.base.relationship.guarded', from: 'p0', to: 'p1' })
    const result = applyCommand(state, { type: 'advance' }).state
    expect(result.winners).toContain('p0')
  })

  it('excludes a living Wolf Romeo from the Village elimination count', () => {
    const state = createInitialState(setupFor([ROLE.juliet, ROLE.alphaWolf, ROLE.farmer])); state.pipeline = 'cycle'; state.cycle = 2; state.phaseIndex = 8; state.phaseId = 'base.morning.victory'; state.players[1].factionOverride = FACTION.lovers; state.relationships.push({ type: 'wherewolf.base.relationship.romeo', from: 'p0', to: 'p1' })
    const result = applyCommand(state, { type: 'advance' }).state
    expect(result.gameOver).toBe(true)
    expect(result.winningFactions).toContain(FACTION.village)
  })
})
