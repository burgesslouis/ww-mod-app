import { describe, expect, it } from 'vitest'
import { BASE_PACK } from '../data/base'
import { DARKEST_NIGHT_PACK, DARKEST_NIGHT_ROLES, HIDDEN_MOTIVES_PACK, HIDDEN_MOTIVES_ROLES, OFFICIAL_SCENARIO } from '../data/expansions'
import { DARKEST_PACK_ID, DARKEST_ROLE as D, HIDDEN_PACK_ID, HIDDEN_ROLE as H, ROLE, TRAIT } from '../domain/ids'
import type { GameSetup } from '../domain/types'
import { applyCommand, availableCommand, createInitialState, effectiveProperties, evaluateVictoryForTest, executeAbilityForTest, killPlayerForTest, resolveAttackForTest } from '../engine/engine'

const allRoles = [...BASE_PACK.roles, ...DARKEST_NIGHT_ROLES, ...HIDDEN_MOTIVES_ROLES]

function officialSetup(roleIds: string[], possible = roleIds): GameSetup {
  const players = roleIds.map((roleId, index) => ({ id: `p${index}`, name: `Player ${index + 1}` }))
  const counts = new Map<string, number>(); roleIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
  return {
    scenarioId: OFFICIAL_SCENARIO.id, packIds: [BASE_PACK.id, DARKEST_PACK_ID, HIDDEN_PACK_ID], players, exactDeck: roleIds,
    publicRoles: [...new Set(possible)].map((roleId) => ({ roleId, min: counts.get(roleId) ?? 0, max: Math.max(1, counts.get(roleId) ?? 0) })),
    assignment: 'manual', manualAssignments: Object.fromEntries(players.map((player, index) => [player.id, roleIds[index]])), seed: 11,
    rules: { scenario: structuredClone(OFFICIAL_SCENARIO), roles: structuredClone(allRoles) },
  }
}

describe('Official expansion defaults', () => {
  it('ships every official role and keeps created roles out of the dealable set', () => {
    expect(DARKEST_NIGHT_ROLES).toHaveLength(20)
    expect(HIDDEN_MOTIVES_ROLES).toHaveLength(19)
    for (const id of [D.minion, D.thrall, H.ghost, H.presence, H.spectre]) {
      expect(allRoles.find((role) => role.id === id)?.categories).toContain('Status')
    }
    expect(DARKEST_NIGHT_PACK.meta.checksum).toMatch(/^fnv1a-/)
    expect(HIDDEN_MOTIVES_PACK.meta.checksum).toMatch(/^fnv1a-/)
    expect(OFFICIAL_SCENARIO.packs.map((pack) => pack.id)).toEqual([BASE_PACK.id, DARKEST_PACK_ID, HIDDEN_PACK_ID])
  })

  it('gives every built-in setup and night action an authored spoken phrase', () => {
    const orderedActions = allRoles.flatMap((role) => role.abilities.filter((ability) => (ability.trigger === 'setup.action' || ability.trigger === 'night.action') && (ability.kind === 'active' || ability.kind === 'shared-faction')))
    expect(orderedActions.length).toBeGreaterThan(0)
    expect(orderedActions.filter((ability) => !ability.callout?.trim()).map((ability) => ability.id)).toEqual([])
  })

  it('marks every Shadow Creature with the Shadow trait', () => {
    for (const id of [ROLE.alphaWolf, ROLE.packWolf, ROLE.wolfPup, D.outcastWolf, D.loneWolf, D.necromancer, D.nosferatu, D.vampire, D.possessed]) {
      expect(allRoles.find((role) => role.id === id)?.traits).toContain(TRAIT.shadow)
    }
    expect(allRoles.find((role) => role.id === D.shapeshifter)?.traits).not.toContain(TRAIT.shadow)
  })

  it('calls a publicly possible night role even when it was not dealt', () => {
    const state = createInitialState(officialSetup([ROLE.farmer, ROLE.alphaWolf, ROLE.witch], [ROLE.farmer, ROLE.alphaWolf, ROLE.witch, D.vampire]))
    state.pipeline = 'cycle'; state.cycle = 1; state.phaseIndex = OFFICIAL_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === 'official.night.actions'); state.phaseId = 'official.night.actions'
    const command = availableCommand(state)
    expect(command).toMatchObject({ type: 'advance', title: 'Call Vampire' })
    expect(command.type === 'advance' && command.description).toContain('“Vampire, wake up and choose a player to bite.”')
  })

  it('gives Vampire its bite on N1', () => {
    const state = createInitialState(officialSetup([D.vampire, ROLE.farmer, ROLE.farmer]))
    state.pipeline = 'cycle'; state.cycle = 1; state.phaseIndex = OFFICIAL_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === 'official.night.actions'); state.phaseId = 'official.night.actions'
    expect(availableCommand(state)).toMatchObject({ type: 'choose', actorId: 'p0', abilityId: `${D.vampire}.bite` })
  })

  it.each([
    [ROLE.bard, ROLE.farmer, 'Bard: A Non-Corrupt player was found by the Clairvoyant.'],
    [ROLE.innkeeper, ROLE.sinner, 'Innkeeper: A Corrupt player was found by the Clairvoyant.'],
  ])('announces %s news after N0', (newsgiver, targetRole, expectedNews) => {
    let state = createInitialState(officialSetup([ROLE.clairvoyant, newsgiver, targetRole]))
    const check = availableCommand(state)
    expect(check).toMatchObject({ type: 'choose', abilityId: `${ROLE.clairvoyant}.setup-check` })
    if (check.type !== 'choose') return
    state = applyCommand(state, { type: 'choose', actorId: check.actorId, abilityId: check.abilityId, targets: ['p2'] }).state
    expect(availableCommand(state)).toMatchObject({ type: 'advance', title: 'Result' })
    state = applyCommand(state, { type: 'advance' }).state
    expect(availableCommand(state)).toMatchObject({
      type: 'advance',
      title: 'Make the first morning announcement.',
      description: expectedNews,
      actionLabel: 'Begin Day 1',
    })
  })

  it('in silent-night mode skips absent-role calls and names only actual players to wake', () => {
    const setup = officialSetup([ROLE.farmer, ROLE.alphaWolf, ROLE.witch], [ROLE.farmer, ROLE.alphaWolf, ROLE.witch, ROLE.clairvoyant, D.vampire])
    setup.silentNight = true
    const state = createInitialState(setup)
    state.pipeline = 'cycle'; state.cycle = 2; state.phaseIndex = OFFICIAL_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === 'official.night.actions'); state.phaseId = 'official.night.actions'
    const command = availableCommand(state)
    expect(command).toMatchObject({ type: 'choose', actorId: 'p2', abilityId: `${ROLE.witch}.protect`, participantIds: ['p2'] })
    expect(command.type === 'choose' && command.instructions).toContain('Wake Player 3.')
    expect(command.type === 'choose' && command.instructions).not.toContain('Say “')
    expect(command.type === 'choose' && command.instructions).not.toContain('Clairvoyant')
  })

  it('lets the moderator decide whether to assign any Spirit after a death', () => {
    let state = killPlayerForTest(createInitialState(officialSetup([ROLE.farmer, ROLE.alphaWolf, ROLE.wizard])), 'p0', 'Burned')
    const pending = availableCommand(state)
    expect(pending).toMatchObject({ type: 'choose', actorId: 'p0', min: 0, max: 1 })
    expect(pending.type === 'choose' && pending.candidates).toEqual([H.ghost, H.presence, H.spectre])
    if (pending.type !== 'choose') return
    state = applyCommand(state, { type: 'choose', actorId: pending.actorId, abilityId: pending.abilityId, targets: [H.ghost] }).state
    expect(state.players[0].statuses.find((status) => status.id === 'wherewolf.hidden-motives.status.spirit')).toMatchObject({ name: 'Ghost', data: { winningAlignment: 'shadow' } })
  })

  it('limits the second-night Amnesiac choice to publicly possible roles', () => {
    const state = createInitialState(officialSetup([D.amnesiac, ROLE.alphaWolf, ROLE.farmer], [D.amnesiac, ROLE.alphaWolf, ROLE.farmer, D.sensitive]))
    state.pipeline = 'cycle'; state.cycle = 1; state.phaseIndex = OFFICIAL_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === 'official.night.actions'); state.phaseId = 'official.night.actions'
    const pending = availableCommand(state)
    expect(pending).toMatchObject({ type: 'choose', actorId: 'p0', abilityId: `${D.amnesiac}.remember` })
    expect(pending.type === 'choose' && pending.candidates).toEqual(expect.arrayContaining([ROLE.alphaWolf, ROLE.farmer, D.sensitive]))
  })

  it('makes Hag Hex information negative rather than inverted, starting on N0', () => {
    let state = createInitialState(officialSetup([ROLE.clairvoyant, D.hag, ROLE.farmer]))
    const setupCheck = availableCommand(state)
    expect(setupCheck).toMatchObject({ type: 'choose', abilityId: `${ROLE.clairvoyant}.setup-check` })
    if (setupCheck.type !== 'choose') return
    state = applyCommand(state, { type: 'choose', actorId: setupCheck.actorId, abilityId: setupCheck.abilityId, targets: ['p1'] }).state
    expect(state.players[0].statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'wherewolf.darkest-night.status.hex', data: expect.objectContaining({ forceNegativeInformation: true }) }),
    ]))
    expect(state.pendingAnnouncements.map((announcement) => announcement.message)).toContain('Player 2: NOT CORRUPT')

    state.pendingAnnouncements = []
    state.pipeline = 'cycle'; state.cycle = 1; state.phaseIndex = OFFICIAL_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === 'official.night.actions'); state.phaseId = 'official.night.actions'
    const laterCheck = availableCommand(state)
    expect(laterCheck).toMatchObject({ type: 'choose', abilityId: `${ROLE.clairvoyant}.check` })
    if (laterCheck.type !== 'choose') return
    state = applyCommand(state, { type: 'choose', actorId: laterCheck.actorId, abilityId: laterCheck.abilityId, targets: ['p2'] }).state
    expect(state.pendingAnnouncements.map((announcement) => announcement.message)).toContain('Player 3: NOT CORRUPT')
    expect(state.pendingAnnouncements.map((announcement) => announcement.message)).not.toContain('Player 3: CORRUPT')
  })

  it('prevents a Hexed Witch from applying protection', () => {
    let state = createInitialState(officialSetup([ROLE.witch, D.hag, ROLE.farmer]))
    state.pipeline = 'cycle'; state.cycle = 1; state.phaseIndex = OFFICIAL_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === 'official.night.actions'); state.phaseId = 'official.night.actions'
    const protect = availableCommand(state)
    expect(protect).toMatchObject({ type: 'choose', abilityId: `${ROLE.witch}.protect` })
    if (protect.type !== 'choose') return
    state = applyCommand(state, { type: 'choose', actorId: protect.actorId, abilityId: protect.abilityId, targets: ['p1'] }).state
    expect(state.players[0].statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'wherewolf.darkest-night.status.hex' })]))
    expect(state.players[1].statuses.some((status) => status.id === 'wherewolf.base.status.shadow-protection')).toBe(false)
  })

  it('lets Witch detect a Curse whenever Necromancer was publicly possible', () => {
    let state = createInitialState(officialSetup([ROLE.witch, D.necromancer, ROLE.farmer]))
    state = executeAbilityForTest(state, 'p1', `${D.necromancer}.curse`, ['p0', 'p2'])
    state.pipeline = 'cycle'; state.cycle = 1; state.phaseIndex = OFFICIAL_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === 'official.night.actions'); state.phaseId = 'official.night.actions'
    const protect = availableCommand(state)
    expect(protect).toMatchObject({ type: 'choose', abilityId: `${ROLE.witch}.protect` })
    if (protect.type !== 'choose') return
    state = applyCommand(state, { type: 'choose', actorId: protect.actorId, abilityId: protect.abilityId, targets: ['p2'] }).state
    expect(state.pendingAnnouncements.map((announcement) => announcement.message)).toContain('Player 3: CURSED')

    let absentState = createInitialState(officialSetup([ROLE.witch, ROLE.farmer, ROLE.farmer], [ROLE.witch, ROLE.farmer, D.necromancer]))
    absentState.pipeline = 'cycle'; absentState.cycle = 1; absentState.phaseIndex = OFFICIAL_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === 'official.night.actions'); absentState.phaseId = 'official.night.actions'
    const absentProtect = availableCommand(absentState)
    expect(absentProtect).toMatchObject({ type: 'choose', abilityId: `${ROLE.witch}.protect` })
    if (absentProtect.type !== 'choose') return
    absentState = applyCommand(absentState, { type: 'choose', actorId: absentProtect.actorId, abilityId: absentProtect.abilityId, targets: ['p1'] }).state
    expect(absentState.pendingAnnouncements.map((announcement) => announcement.message)).toContain('Player 2: NOT CURSED')
  })

  it('lets Igor protect both Vampire and Nosferatu from backlash in one game', () => {
    let state = createInitialState(officialSetup([D.igor, D.vampire, D.nosferatu, ROLE.alphaWolf]))
    state = executeAbilityForTest(state, 'p0', `${D.igor}.vampire`)
    state = executeAbilityForTest(state, 'p0', `${D.igor}.nosferatu`)
    expect(state.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'p0', to: 'p1' }), expect.objectContaining({ from: 'p0', to: 'p2' }),
    ]))
    state = resolveAttackForTest(state, 'p1', 'undead-backlash')
    expect(state.players.find((player) => player.id === 'p1')?.alive).toBe(true)
    expect(state.players.find((player) => player.id === 'p0')?.alive).toBe(false)
  })

  it('awards a Mystic victory when the Crusades countdown is not stopped', () => {
    let state = createInitialState(officialSetup([H.templar, H.inquisitor, ROLE.wizard, ROLE.alphaWolf]))
    state = killPlayerForTest(state, 'p1', 'shadow')
    expect(state.players[0].roleState).toMatchObject({ crusadesActive: true, crusadesRemaining: 1 })
    state = evaluateVictoryForTest(state)
    expect(state.gameOver).toBe(true)
    expect(state.winners).toContain('p2')
    expect(state.events.at(-1)?.message).toContain('Mystics win')
  })

  it('defines Goblin as an Any Shadow winner rather than a Wolf-only winner', () => {
    const goblin = HIDDEN_MOTIVES_ROLES.find((role) => role.id === H.goblin)!
    expect(goblin.traits).toContain(TRAIT.anyShadowWinner)
    expect(goblin.faction).not.toBe('wherewolf.base.faction.wolves')
  })

  it('derives current moderator-facing properties from canonical state', () => {
    const state = createInitialState(officialSetup([ROLE.wizard, ROLE.alphaWolf, ROLE.farmer]))
    state.players[0].statuses.push({ id: 'test-gun', name: 'Gun', duration: 'day', appliedCycle: 1 })
    expect(effectiveProperties(state, 'p0').map((property) => property.label)).toEqual(expect.arrayContaining(['Human', 'Village', 'Mystic', 'Gun']))
    state.players[0].factionOverride = 'wherewolf.base.faction.wolves'
    state.players[0].statuses = []
    const changed = effectiveProperties(state, 'p0').map((property) => property.label)
    expect(changed).toEqual(expect.arrayContaining(['Shadow', 'Wolf Pack', 'Mystic']))
    expect(changed).not.toContain('Human')
    expect(changed).not.toContain('Gun')
  })

  it('makes expansion-only phases dormant with Base Roles alone', () => {
    const setup = officialSetup([ROLE.alphaWolf, ROLE.farmer, ROLE.farmer])
    setup.packIds = [BASE_PACK.id]
    let state = createInitialState(setup)
    const intro = availableCommand(state)
    expect(intro).toMatchObject({ type: 'choose', abilityId: 'wherewolf.base.ability.wolf-intro' })
    if (intro.type !== 'choose') return
    state = applyCommand(state, { type: 'choose', actorId: intro.actorId, abilityId: intro.abilityId, targets: [] }).state
    expect(availableCommand(state)).toMatchObject({ type: 'advance', title: 'Day 1 discussion' })
    state = applyCommand(state, { type: 'advance' }).state
    expect(availableCommand(state)).toMatchObject({ type: 'vote', title: 'First vote' })
  })

  it('does not call a pack-gated action when that pack is not attached', () => {
    const setup = officialSetup([ROLE.medium, ROLE.farmer, ROLE.farmer])
    setup.packIds = [BASE_PACK.id]
    let state = createInitialState(setup)
    state.pipeline = 'cycle'; state.cycle = 2; state.phaseIndex = OFFICIAL_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === 'official.night.actions'); state.phaseId = 'official.night.actions'
    const check = availableCommand(state)
    expect(check).toMatchObject({ type: 'choose', abilityId: `${ROLE.medium}.check` })
    if (check.type !== 'choose') return
    state = applyCommand(state, { type: 'choose', actorId: check.actorId, abilityId: check.abilityId, targets: [] }).state
    while (availableCommand(state).type === 'advance' && availableCommand(state).title === 'Result') state = applyCommand(state, { type: 'advance' }).state
    expect(availableCommand(state)).not.toMatchObject({ abilityId: `${ROLE.medium}.spirit-check` })
  })
})
