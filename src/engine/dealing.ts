import type { GameSession, GameSetup } from '../domain/types'
import { createInitialState, createSession, currentState } from './engine'

/** Cards use the engine's seeded allocation; locked seats have reserved cards. */
export function createRoleDeal(setup: GameSetup, name?: string): GameSession {
  const session = createSession(setup, name)
  session.roleDeal = {
    cards: currentState(session).players.map((player, index) => ({
      id: `card-${index + 1}`, roleId: player.roleId,
      reservedFor: setup.assignment === 'manual' || (setup.assignment === 'locked-random' && setup.players[index].lockedRoleId) ? player.id : undefined,
    })),
    picks: [], finished: false,
  }
  return session
}

export function remainingDealCards(session: GameSession) {
  const deal = session.roleDeal
  if (!deal || deal.finished) return []
  return deal.cards.filter((card) => !deal.picks.some((pick) => pick.cardId === card.id))
}

/** Every remaining back is displayed; reservations are intentionally not visible. */
export function displayDealCards(session: GameSession) {
  return remainingDealCards(session)
}

function uniformDrawIndex(seed: number, draw: number, length: number): number {
  if (length <= 1) return 0
  let value = (seed ^ Math.imul(draw + 1, 0x9e3779b9)) >>> 0
  const limit = Math.floor(0x100000000 / length) * length
  do {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5; value >>>= 0
  } while (value >= limit)
  return value % length
}

export function availableDealCards(session: GameSession) {
  const deal = session.roleDeal
  if (!deal || deal.finished) return []
  const player = session.setup.players[deal.picks.length]
  if (!player) return []
  const remaining = remainingDealCards(session)
  const reserved = remaining.filter((card) => card.reservedFor === player.id)
  return reserved.length ? reserved : remaining.filter((card) => !card.reservedFor)
}

function pendingDeal(session: GameSession) {
  if (!session.roleDeal || session.roleDeal.finished || session.cursor !== 0 || session.snapshots.length !== 1) throw new Error('Role dealing is not active.')
  return session.roleDeal
}

export function pickDealCard(session: GameSession, cardId: string): GameSession {
  const deal = pendingDeal(session)
  if (deal.selectedCardId) throw new Error('Read your selected card and press Ready first.')
  const remaining = remainingDealCards(session)
  if (!remaining.some((card) => card.id === cardId)) throw new Error('This card is not available.')
  const player = session.setup.players[deal.picks.length]
  const reserved = remaining.find((card) => card.reservedFor === player?.id)
  const pool = remaining.filter((card) => !card.reservedFor)
  const selected = reserved ?? (pool.length === remaining.length ? remaining.find((card) => card.id === cardId) : pool[uniformDrawIndex(session.setup.seed, deal.picks.length, pool.length)])
  if (!selected) throw new Error('There are no cards available for this seat.')
  return { ...session, updatedAt: new Date().toISOString(), roleDeal: { ...deal, selectedCardId: selected.id } }
}

export function confirmDealCard(session: GameSession): GameSession {
  const deal = pendingDeal(session)
  const card = remainingDealCards(session).find((card) => card.id === deal.selectedCardId)
  const player = session.setup.players[deal.picks.length]
  if (!card || !player) throw new Error('Choose a card first.')
  return {
    ...session, updatedAt: new Date().toISOString(),
    roleDeal: { ...deal, selectedCardId: undefined, picks: [...deal.picks, { playerId: player.id, cardId: card.id, roleId: card.roleId }] },
  }
}

export function finishRoleDeal(session: GameSession): GameSession {
  const deal = pendingDeal(session)
  if (deal.picks.length !== session.setup.players.length || deal.selectedCardId) throw new Error('Every player must read their card and press Ready.')
  const setup: GameSetup = { ...session.setup, assignment: 'manual', manualAssignments: Object.fromEntries(deal.picks.map((pick) => [pick.playerId, pick.roleId])) }
  // Start N0 with the choices actually made, including role-specific initial state.
  // The original deal is retained on the session for resume and audit.
  const state = createInitialState(setup, { resumeLegacyDeal: session.setup.absentRoleSelections === undefined && currentState(session).setup.absentRoleSelections === undefined })
  state.id = session.id
  state.trace.push({ id: 'role-deal', source: 'Role distribution', message: 'Each player read and confirmed their role on this device.' })
  return { ...session, setup, updatedAt: new Date().toISOString(), snapshots: [{ state }], roleDeal: { ...deal, finished: true } }
}
