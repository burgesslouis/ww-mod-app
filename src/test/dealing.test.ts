import { describe, expect, it } from 'vitest'
import { BASE_ROLES, BASE_SCENARIO } from '../data/base'
import { ROLE } from '../domain/ids'
import type { GameSession, GameSetup } from '../domain/types'
import { applyToSession, availableCommand, currentState, undo } from '../engine/engine'
import { availableDealCards, confirmDealCard, createRoleDeal, finishRoleDeal, pickDealCard } from '../engine/dealing'

function setup(): GameSetup {
  const deck = [ROLE.alphaWolf, ROLE.farmer, ROLE.farmer, ROLE.clairvoyant]
  return {
    scenarioId: BASE_SCENARIO.id, packIds: [], seed: 42, assignment: 'random', distributeRolesInApp: true,
    players: deck.map((_, index) => ({ id: `p${index}`, name: `Player ${index + 1}` })), exactDeck: deck,
    publicRoles: [...new Set(deck)].map((roleId) => ({ roleId, min: 0, max: deck.filter((id) => id === roleId).length })),
    rules: { scenario: BASE_SCENARIO, roles: BASE_ROLES },
  }
}

function complete(session: GameSession) {
  let next = session
  while (availableDealCards(next).length) next = confirmDealCard(pickDealCard(next, availableDealCards(next).at(-1)!.id))
  return finishRoleDeal(next)
}

describe('pass-the-phone dealing', () => {
  it('uses a seeded deck, records the selected role and removes only that copy on Ready', () => {
    const session = createRoleDeal(setup())
    expect(session.roleDeal).toEqual(createRoleDeal(setup()).roleDeal)
    const card = availableDealCards(session).at(-1)!
    const picked = pickDealCard(session, card.id)
    expect(picked.roleDeal?.picks).toHaveLength(0)
    expect(() => pickDealCard(picked, availableDealCards(picked)[0].id)).toThrow('Ready')
    const ready = confirmDealCard(picked)
    expect(ready.roleDeal?.picks).toEqual([{ playerId: 'p0', cardId: card.id, roleId: card.roleId }])
    expect(availableDealCards(ready)).toHaveLength(3)
    expect(availableDealCards(ready).some((entry) => entry.id === card.id)).toBe(false)
    expect(() => pickDealCard(ready, card.id)).toThrow('not available')
    expect(session.roleDeal?.picks).toHaveLength(0)
  })

  it('starts N0 with exactly the chosen roles and their initial state, including after undo', () => {
    const finished = complete(createRoleDeal(setup()))
    const state = currentState(finished)
    expect(state.players.map((player) => player.roleId).sort()).toEqual([...setup().exactDeck].sort())
    expect(state.players.map((player) => player.roleId)).toEqual(finished.roleDeal!.picks.map((pick) => pick.roleId))
    for (const player of state.players) {
      const role = BASE_ROLES.find((role) => role.id === player.roleId)!
      expect(player.initialRoleId).toBe(role.id)
      expect(player.roleState).toEqual(Object.fromEntries(role.state.map((variable) => [variable.key, variable.initial])))
    }
    expect(state.cycle).toBe(0)
    expect(state.pipeline).toBe('setup')
    expect(state.id).toBe(finished.id)
    expect(availableDealCards(finished)).toEqual([])
    const pending = availableCommand(state)
    if (pending.type !== 'choose') throw new Error('Expected an N0 role action')
    const advanced = applyToSession(finished, { type: 'choose', actorId: pending.actorId, abilityId: pending.abilityId, targets: pending.candidates.slice(0, pending.min) })
    expect(currentState(undo(advanced)).players).toEqual(state.players)
  })

  it('reserves Gardened seats and never lets other players take their cards', () => {
    const configured = setup()
    configured.assignment = 'locked-random'
    configured.players[1].lockedRoleId = ROLE.alphaWolf
    let session = createRoleDeal(configured)
    expect(availableDealCards(session)).toHaveLength(3)
    expect(availableDealCards(session).some((card) => card.roleId === ROLE.alphaWolf)).toBe(false)
    session = confirmDealCard(pickDealCard(session, availableDealCards(session)[0].id))
    expect(availableDealCards(session)).toHaveLength(1)
    expect(availableDealCards(session)[0].roleId).toBe(ROLE.alphaWolf)
    const finished = complete(session)
    expect(currentState(finished).players[1].roleId).toBe(ROLE.alphaWolf)
  })

  it('supports every seat being Gardened', () => {
    const configured = setup()
    configured.assignment = 'locked-random'
    configured.players.forEach((player, index) => { player.lockedRoleId = configured.exactDeck[index] })
    const session = createRoleDeal(configured)
    expect(availableDealCards(session)).toHaveLength(1)
    expect(currentState(complete(session)).players.map((player) => player.roleId)).toEqual(configured.exactDeck)
  })

  it('resumes a selected card and confirmed picks after a JSON round trip', () => {
    let session = createRoleDeal(setup())
    session = confirmDealCard(pickDealCard(session, availableDealCards(session)[0].id))
    session = pickDealCard(session, availableDealCards(session).at(-1)!.id)
    const restored = JSON.parse(JSON.stringify(session)) as GameSession
    expect(confirmDealCard(restored).roleDeal).toEqual(confirmDealCard(session).roleDeal)
    expect(currentState(complete(confirmDealCard(restored))).players).toEqual(currentState(complete(confirmDealCard(session))).players)
  })

  it('blocks unselected, invalid, premature and post-completion actions', () => {
    const session = createRoleDeal(setup())
    expect(() => confirmDealCard(session)).toThrow('Choose a card')
    expect(() => pickDealCard(session, 'missing')).toThrow('not available')
    expect(() => finishRoleDeal(session)).toThrow('Every player')
    expect(() => applyToSession(session, { type: 'advance' })).toThrow('Finish distributing')
    const finished = complete(session)
    expect(() => pickDealCard(finished, 'card-1')).toThrow('not active')
    expect(() => confirmDealCard(finished)).toThrow('not active')
    expect(() => finishRoleDeal(finished)).toThrow('not active')
  })
})
