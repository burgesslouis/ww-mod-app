import { describe, expect, it } from 'vitest'
import { absentRoleCandidates } from '../engine/setupInformation'
import { BASE_PACK } from '../data/base'
import { DARKEST_NIGHT_PACK, DARKEST_NIGHT_ROLES, HIDDEN_MOTIVES_PACK, HIDDEN_MOTIVES_ROLES, OFFICIAL_SCENARIO } from '../data/expansions'
import { DARKEST_PACK_ID, DARKEST_ROLE as D, FACTION, HIDDEN_PACK_ID, HIDDEN_ROLE as H, ROLE, TRAIT } from '../domain/ids'
import type { Effect, GameSetup } from '../domain/types'

function effectIdentifiesHag(effects: Effect[]): boolean {
  return effects.some((effect) => effect.type === 'learnRoleIdentity' && effect.roleId === D.hag
    || effect.type === 'conditional' && (effectIdentifiesHag(effect.effects) || effectIdentifiesHag(effect.otherwise ?? [])))
}
import { applyCommand, availableCommand, createInitialState, effectiveProperties, evaluateVictoryForTest, executeAbilityForTest, factionName, killPlayerForTest, resolveAttackForTest, resolveAttacksForTest, resolveMorningForTest, validateSetup } from '../engine/engine'

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
  it('queues one combined tap step only for successful healable bites', () => {
    let state = createInitialState(officialSetup([ROLE.farmer, ROLE.alphaWolf, ROLE.farmer]))
    state = resolveAttacksForTest({ ...state, attacks: [{ id: 'a1', targetId: 'p0', type: 'shadow', notifyTargetOnHit: true, healable: true }, { id: 'a2', targetId: 'p0', type: 'shadow', notifyTargetOnHit: true, healable: true }] })
    expect(state.events.filter((event) => event.type === 'attack.hit').map((event) => event.targetId)).toEqual(['p0', 'p0'])
    expect(state.pendingAnnouncements.filter((announcement) => announcement.kind === 'tap')).toEqual([expect.objectContaining({ targetIds: ['p0'] })])
  })

  it('does not tap or kill a protected or Madman-cancelled bite', () => {
    let protectedState = createInitialState(officialSetup([ROLE.farmer, ROLE.alphaWolf, ROLE.farmer]))
    protectedState.players[0].statuses.push({ id: 'test.protection', name: 'Protection', duration: 'night', appliedCycle: 0, data: { attackType: 'shadow' } })
    protectedState = resolveAttackForTest(protectedState, 'p0', 'shadow', { notifyTargetOnHit: true, healable: true })
    expect(protectedState.players[0].alive).toBe(true)
    expect(protectedState.events.some((event) => event.type === 'attack.hit')).toBe(false)
    let cancelledState = createInitialState(officialSetup([ROLE.farmer, ROLE.alphaWolf, ROLE.farmer]))
    cancelledState.facts.cancelNextShadowAttack = true
    cancelledState = resolveAttackForTest(cancelledState, 'p0', 'shadow', { notifyTargetOnHit: true, healable: true })
    expect(cancelledState.players[0].alive).toBe(true)
    expect(cancelledState.events.some((event) => event.type === 'attack.hit')).toBe(false)
  })

  it('rejects Silent Night when a possible declarative spoken dependency exists', () => {
    const setup = officialSetup([H.assassin, ROLE.wizard, ROLE.farmer])
    setup.silentNight = true
    expect(validateSetup(setup).issues.some((issue) => issue.path === 'silentNight')).toBe(true)
  })

  it('places a reactive Assassin action before a possible Mystic check', () => {
    const state = createInitialState(officialSetup([H.assassin, ROLE.wizard, ROLE.farmer]))
    state.pipeline = 'cycle'
    state.cycle = 1
    state.phaseId = 'official.night.actions'
    state.phaseIndex = OFFICIAL_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === state.phaseId)
    expect(availableCommand(state)).toMatchObject({ type: 'choose', actorId: 'p0', abilityId: `${H.assassin}.kill` })
  })

  it('lets a guardable direct kill redirect through Guardian Angel data', () => {
    const state = createInitialState(officialSetup([ROLE.guardian, H.assassin, ROLE.farmer]))
    state.relationships.push({ type: 'wherewolf.base.relationship.guarded', from: 'p0', to: 'p2' })
    const result = executeAbilityForTest(state, 'p1', `${H.assassin}.kill`, ['p2'])
    expect(result.players.find((player) => player.id === 'p2')?.alive).toBe(true)
    expect(result.players.find((player) => player.id === 'p0')?.alive).toBe(false)
    expect(result.events.some((event) => event.type === 'kill.redirected' && event.targetId === 'p0')).toBe(true)
  })

  it('does not let Guardian redirect an explicitly unguardable attack', () => {
    const state = createInitialState(officialSetup([ROLE.guardian, ROLE.farmer, ROLE.alphaWolf]))
    state.pipeline = 'cycle'; state.cycle = 1; state.phaseId = 'official.night.attacks'
    state.relationships.push({ type: 'wherewolf.base.relationship.guarded', from: 'p0', to: 'p1' })
    const result = resolveAttackForTest(state, 'p1', 'shadow', { modifiers: { guardable: false, protectable: false } })
    expect(result.players.find((player) => player.id === 'p1')?.alive).toBe(false)
    expect(result.players.find((player) => player.id === 'p0')?.alive).toBe(true)
    expect(result.events.some((event) => event.type === 'attack.redirected')).toBe(false)
  })

  it('still reads legacy witchProtectable data from saved attacks', () => {
    let state = createInitialState(officialSetup([ROLE.farmer, ROLE.alphaWolf, ROLE.farmer]))
    state.players[0].statuses.push({ id: 'test.protection', name: 'Protection', duration: 'night', appliedCycle: 0, data: { attackType: 'shadow' } })
    state = resolveAttackForTest(state, 'p0', 'shadow', { modifiers: { witchProtectable: false } })
    expect(state.players[0].alive).toBe(false)
  })

  it('allows the moderator to assign a loaded status role through the typed override', () => {
    let state = createInitialState(officialSetup([ROLE.farmer, ROLE.alphaWolf, ROLE.farmer]))
    state = applyCommand(state, { type: 'override', reason: 'Table ruling', operation: { type: 'role', playerId: 'p0', roleId: D.minion } }).state
    expect(state.players[0].roleId).toBe(D.minion)
  })

  it('uses a public conditional faction recommendation without changing the hidden deal', () => {
    const state = createInitialState(officialSetup([H.corruptGuard, H.spy, ROLE.farmer]))
    expect(state.players[0].factionOverride).toBe(FACTION.criminals)
    expect(state.players[0].factionWinScope).toBe('exact')
    expect(state.players[2].factionWinScope).toBe('alignment')
  })
  it('lets every initial Shadow role identify the Hag without waking the Hag to learn Shadows', () => {
    const recipients = [ROLE.alphaWolf, ROLE.packWolf, ROLE.wolfPup, D.outcastWolf, D.loneWolf, D.vampire, D.nosferatu, D.necromancer, D.possessed]
    for (const roleId of recipients) {
      const role = allRoles.find((entry) => entry.id === roleId)!
      expect(role.abilities.some((ability) => ability.trigger === 'setup.action' && effectIdentifiesHag(ability.effects)), role.meta.name).toBe(true)
    }
    const hag = allRoles.find((entry) => entry.id === D.hag)!
    expect(hag.abilities.some((ability) => effectIdentifiesHag(ability.effects))).toBe(false)
    const nonShadowRecipients = [D.igor, D.undertaker, H.corruptGuard, H.goblin]
    for (const roleId of nonShadowRecipients) {
      const role = allRoles.find((entry) => entry.id === roleId)!
      expect(role.abilities.some((ability) => ability.trigger === 'setup.action' && effectIdentifiesHag(ability.effects)), role.meta.name).toBe(false)
    }
  })

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

  it('lets the moderator decide whether to assign a selected Spirit after a death', () => {
    const deck = [ROLE.farmer, ROLE.alphaWolf, ROLE.wizard]
    let state = killPlayerForTest(createInitialState(officialSetup(deck, [...deck, H.ghost, H.presence, H.spectre])), 'p0', 'Burned')
    const pending = availableCommand(state)
    expect(pending).toMatchObject({ type: 'choose', actorId: 'p0', min: 0, max: 1 })
    expect(pending.type === 'choose' && pending.candidates).toEqual([H.ghost, H.presence, H.spectre])
    if (pending.type !== 'choose') return
    state = applyCommand(state, { type: 'choose', actorId: pending.actorId, abilityId: pending.abilityId, targets: [H.ghost] }).state
    expect(state.players[0].statuses.find((status) => status.id === 'wherewolf.hidden-motives.status.spirit')).toMatchObject({ name: 'Ghost', data: { winningAlignment: 'shadow' } })
  })

  it('does not queue Spirits merely because their pack and definitions are loaded', () => {
    const state = killPlayerForTest(createInitialState(officialSetup([ROLE.farmer, ROLE.alphaWolf, ROLE.wizard])), 'p0', 'Burned')
    expect(state.pendingSpiritAssignments).toEqual([])
    expect(availableCommand(state)).not.toMatchObject({ abilityId: 'wherewolf.hidden-motives.system.assign-spirit' })
  })

  it('ignores stale Spirit prompts in saved games with no Spirits selected', () => {
    const state = killPlayerForTest(createInitialState(officialSetup([ROLE.farmer, ROLE.alphaWolf, ROLE.wizard])), 'p0', 'Burned')
    state.pendingSpiritAssignments = ['p0']
    const resumed = JSON.parse(JSON.stringify(state))
    expect(availableCommand(resumed)).not.toMatchObject({ abilityId: 'wherewolf.hidden-motives.system.assign-spirit' })
    expect(() => applyCommand(resumed, { type: 'choose', actorId: 'p0', abilityId: 'wherewolf.hidden-motives.system.assign-spirit', targets: [H.ghost] })).toThrow('no longer current')
  })

  it('offers only selected Spirits with a positive possible count and rejects others', () => {
    const deck = [ROLE.farmer, ROLE.alphaWolf, ROLE.wizard]
    const setup = officialSetup(deck, [...deck, H.presence, H.spectre])
    setup.publicRoles.find((range) => range.roleId === H.spectre)!.max = 0
    const state = killPlayerForTest(createInitialState(setup), 'p0', 'Burned')
    const pending = availableCommand(state)
    expect(pending).toMatchObject({ type: 'choose', candidates: [H.presence] })
    if (pending.type !== 'choose') throw new Error('Expected Spirit assignment')
    for (const id of [H.ghost, H.spectre]) expect(() => applyCommand(state, { type: 'choose', actorId: pending.actorId, abilityId: pending.abilityId, targets: [id] })).toThrow('legal target')
    const declined = applyCommand(state, { type: 'choose', actorId: pending.actorId, abilityId: pending.abilityId, targets: [] }).state
    expect(declined.pendingSpiritAssignments).toEqual([])
    expect(declined.players[0].statuses).toEqual([])
  })

  it('supports a custom Spirit through the same possible-role selection', () => {
    const deck = [ROLE.farmer, ROLE.alphaWolf, ROLE.wizard]
    const setup = officialSetup(deck)
    const spirit = structuredClone(allRoles.find((role) => role.id === H.ghost)!)
    spirit.id = 'custom.spirit'; spirit.meta.name = 'Custom Spirit'
    setup.rules!.roles.push(spirit)
    setup.publicRoles.push({ roleId: spirit.id, min: 0, max: 1 })
    const state = killPlayerForTest(createInitialState(setup), 'p0', 'Burned')
    expect(availableCommand(state)).toMatchObject({ candidates: [spirit.id] })
  })

  it('keeps Spirits out of dealt roles, Monk information and Amnesiac choices', () => {
    expect(validateSetup(officialSetup([H.ghost, ROLE.farmer, ROLE.alphaWolf])).issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'exactDeck.0', message: expect.stringContaining('cannot be dealt') })]))
    const deck = [ROLE.monk, ROLE.alphaWolf, ROLE.farmer]
    const setup = officialSetup(deck, [...deck, ROLE.witch, ROLE.wizard, H.ghost])
    expect(absentRoleCandidates(setup, allRoles)).toEqual([ROLE.witch, ROLE.wizard])
    setup.absentRoleSelections = { [ROLE.monk]: { [`${ROLE.monk}.reveal`]: [ROLE.witch, ROLE.wizard] } }
    setup.silentNight = true
    const state = createInitialState(setup)
    expect(availableCommand(state)).toMatchObject({ type: 'choose', candidates: [], information: [{ value: 'Witch and Wizard' }] })
    const amnesiac = createInitialState(officialSetup([D.amnesiac, ROLE.alphaWolf, ROLE.farmer], [D.amnesiac, ROLE.alphaWolf, ROLE.farmer, H.ghost]))
    amnesiac.pipeline = 'cycle'; amnesiac.cycle = 1; amnesiac.phaseIndex = OFFICIAL_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === 'official.night.actions'); amnesiac.phaseId = 'official.night.actions'
    const pending = availableCommand(amnesiac)
    expect(pending.type === 'choose' && pending.candidates).not.toContain(H.ghost)
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
    state.pendingAnnouncements = []
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

  it('removes the Undertaker as a morning loser after the Necromancer dies', () => {
    let state = createInitialState(officialSetup([D.undertaker, D.necromancer, ROLE.farmer]))
    state = killPlayerForTest(state, 'p1', 'Burned')

    state = resolveMorningForTest(state)

    expect(state.players[0].alive).toBe(false)
    expect(state.personalLosers).toContainEqual({ playerId: 'p0', reason: 'the Necromancer is dead' })
    expect(state.facts.nightDeaths).toContain('p0')
    expect(state.pendingSpiritAssignments).not.toContain('p0')
  })

  it('keeps Igor while either supported undead faction can still win', () => {
    let minionState = createInitialState(officialSetup([D.igor, D.vampire, ROLE.farmer]))
    minionState.players[2].roleId = D.minion
    minionState = resolveMorningForTest(killPlayerForTest(minionState, 'p1', 'Killed'))
    expect(minionState.players[0].alive).toBe(true)
    expect(minionState.personalLosers).toEqual([])

    let nosferatuState = createInitialState(officialSetup([D.igor, D.vampire, D.nosferatu, ROLE.farmer]))
    nosferatuState = resolveMorningForTest(killPlayerForTest(nosferatuState, 'p1', 'Killed'))
    expect(nosferatuState.players[0].alive).toBe(true)
    expect(nosferatuState.personalLosers).toEqual([])
  })

  it('removes Igor as a morning loser once no supported undead faction can win', () => {
    let state = createInitialState(officialSetup([D.igor, D.vampire, D.nosferatu, ROLE.farmer]))
    state = killPlayerForTest(state, 'p1', 'Killed')
    state = killPlayerForTest(state, 'p2', 'Killed')

    state = resolveMorningForTest(state)

    expect(state.players[0].alive).toBe(false)
    expect(state.personalLosers).toContainEqual({ playerId: 'p0', reason: 'neither supported undead faction can still win' })
    expect(state.facts.nightDeaths).toContain('p0')
    expect(state.pendingSpiritAssignments).not.toContain('p0')
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
    expect(effectiveProperties(state, 'p0').map((property) => property.label)).toEqual(['Village', 'Mystic'])
    state.players[0].factionOverride = 'wherewolf.base.faction.wolves'
    state.players[0].statuses = []
    const changed = effectiveProperties(state, 'p0').map((property) => property.label)
    expect(changed).toEqual(['Wolf Pack', 'Mystic'])
    expect(changed).not.toContain('Human')
    expect(changed).not.toContain('Gun')
  })

  it.each([
    [ROLE.alphaWolf, ['Wolf Pack', 'Corrupt']],
    [ROLE.bard, ['Village']],
    [D.necromancer, ['Necromancer', 'Corrupt', 'Mystic']],
    [D.undertaker, ['Necromancer']],
    [D.hag, ['Shadow', 'Corrupt', 'Mystic']],
    [ROLE.sinner, ['Village', 'Corrupt']],
  ])('shows only the useful team and status properties for %s', (roleId, expected) => {
    const state = createInitialState(officialSetup([roleId, ROLE.farmer, ROLE.farmer]))
    expect(effectiveProperties(state, 'p0').map((property) => property.label)).toEqual(expected)
  })

  it('labels neutral roles as Third Party', () => {
    const state = createInitialState(officialSetup([ROLE.jester, ROLE.farmer, ROLE.farmer]))
    expect(effectiveProperties(state, 'p0').map((property) => property.label)).toEqual(['Third Party'])
    expect(factionName(state, FACTION.neutral)).toBe('Third Party')
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

  it('does not call the Medium Spirit check when no Spirit is possible', () => {
    let state = createInitialState(officialSetup([ROLE.medium, ROLE.farmer, ROLE.farmer]))
    state.pipeline = 'cycle'; state.cycle = 2; state.phaseIndex = OFFICIAL_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === 'official.night.actions'); state.phaseId = 'official.night.actions'
    const check = availableCommand(state)
    expect(check).toMatchObject({ type: 'choose', abilityId: `${ROLE.medium}.check` })
    if (check.type !== 'choose') return
    state = applyCommand(state, { type: 'choose', actorId: check.actorId, abilityId: check.abilityId, targets: [] }).state
    while (availableCommand(state).type === 'advance' && availableCommand(state).title === 'Result') state = applyCommand(state, { type: 'advance' }).state
    expect(availableCommand(state)).not.toMatchObject({ abilityId: `${ROLE.medium}.spirit-check` })
  })

  it('offers the Medium Spirit check when a Spirit is possible', () => {
    const deck = [ROLE.medium, ROLE.farmer, ROLE.farmer]
    let state = createInitialState(officialSetup(deck, [...deck, H.ghost]))
    state.pipeline = 'cycle'; state.cycle = 2; state.phaseIndex = OFFICIAL_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === 'official.night.actions'); state.phaseId = 'official.night.actions'
    const check = availableCommand(state)
    expect(check).toMatchObject({ type: 'choose', abilityId: `${ROLE.medium}.check` })
    if (check.type !== 'choose') return
    state = applyCommand(state, { type: 'choose', actorId: check.actorId, abilityId: check.abilityId, targets: [] }).state
    while (availableCommand(state).type === 'advance' && availableCommand(state).title === 'Result') state = applyCommand(state, { type: 'advance' }).state
    expect(availableCommand(state)).toMatchObject({ type: 'choose', actorId: 'p0', abilityId: `${ROLE.medium}.spirit-check` })
  })
})
