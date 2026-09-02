import type { PlayerSetup } from '../domain/types'

/** Keep seats in order, releasing only locks that no longer have a card. */
export function reconcileGardenedSeats(players: PlayerSetup[], deck: string[]): PlayerSetup[] {
  const remaining = new Map<string, number>()
  deck.forEach((id) => remaining.set(id, (remaining.get(id) ?? 0) + 1))
  let changed = false
  const next = players.map((player) => {
    if (!player.lockedRoleId) return player
    const count = remaining.get(player.lockedRoleId) ?? 0
    if (count > 0) { remaining.set(player.lockedRoleId, count - 1); return player }
    changed = true
    const { lockedRoleId: _released, ...seat } = player
    return seat
  })
  return changed ? next : players
}
