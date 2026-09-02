import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BASE_ROLES, BASE_SCENARIO } from '../data/base'
import { ROLE } from '../domain/ids'
import RoleDistribution from '../components/RoleDistribution'
import { availableDealCards, createRoleDeal, pickDealCard } from '../engine/dealing'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function selectedSession() {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const roles = structuredClone(BASE_ROLES)
  roles.forEach((role) => { role.text.moderatorNotes = 'MODERATOR ONLY' })
  const deck = [ROLE.alphaWolf, ROLE.farmer, ROLE.witch]
  const session = createRoleDeal({
    scenarioId: BASE_SCENARIO.id, seed: 20, assignment: 'random', packIds: [],
    players: deck.map((_, index) => ({ id: `p${index}`, name: `Player ${index + 1}` })), exactDeck: deck,
    publicRoles: deck.map((roleId) => ({ roleId, min: 0, max: 1 })), rules: { scenario: BASE_SCENARIO, roles },
  })
  return pickDealCard(session, availableDealCards(session)[0].id)
}

describe('player-facing role cards', () => {
  it('covers a resumed selection and renders only the current role, never moderator notes', () => {
    const session = selectedSession()
    const { container } = render(<RoleDistribution session={session} onChange={vi.fn()} />)
    expect(container.querySelector('.deal-role-front')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View my card' }))
    expect(container.querySelectorAll('.deal-role-front')).toHaveLength(1)
    expect(screen.queryByText('MODERATOR ONLY')).toBeNull()
    expect(screen.queryByText('Player 2')).toBeNull()
  })

  it('keeps the same selection and allows retry if confirmation cannot be saved', async () => {
    const session = selectedSession()
    const onChange = vi.fn().mockRejectedValue(new Error('disk full'))
    const { container } = render(<RoleDistribution session={session} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'View my card' }))
    const roleName = container.querySelector('.deal-role-front h1')?.textContent
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }))
    expect(container.querySelector('.deal-role-front')).toBeNull()
    await screen.findByRole('alert')
    expect(container.querySelector('.deal-role-front h1')?.textContent).toBe(roleName)
    expect(session.roleDeal?.picks).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    await screen.findByRole('alert')
  })
})
