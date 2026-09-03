import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BASE_PACK, BASE_ROLES, BASE_SCENARIO } from '../data/base'
import { ROLE } from '../domain/ids'
import { forkArtifact, parseArtifact, withChecksum } from '../domain/artifacts'
import type { GameSetup, RoleDefinition } from '../domain/types'
import { applyCommand, applyToSession, availableCommand, createInitialState, createSession, currentState, redo, undo, validateSetup } from '../engine/engine'
import { absentRoleCandidates, absentRoleRequirements, reconcileAbsentRoleSelections } from '../engine/setupInformation'
import { availableDealCards, confirmDealCard, createRoleDeal, finishRoleDeal, pickDealCard } from '../engine/dealing'
import SetupWizard from '../components/SetupWizard'

const abilityId = `${ROLE.monk}.reveal`
function setupFor(selected: string[] = [ROLE.bard, ROLE.innkeeper]): GameSetup {
  const exactDeck = [ROLE.monk, ROLE.farmer, ROLE.alphaWolf]
  return {
    scenarioId: BASE_SCENARIO.id, packIds: [BASE_PACK.id], players: exactDeck.map((_, i) => ({ id: `p${i}`, name: `Player ${i + 1}` })),
    exactDeck, publicRoles: [...exactDeck, ROLE.bard, ROLE.innkeeper, ROLE.hermit].map(roleId => ({ roleId, min: 0, max: 1 })),
    assignment: 'manual', manualAssignments: { p0: ROLE.monk, p1: ROLE.farmer, p2: ROLE.alphaWolf }, seed: 42, silentNight: true,
    absentRoleSelections: { [ROLE.monk]: { [abilityId]: selected } }, rules: { scenario: structuredClone(BASE_SCENARIO), roles: structuredClone(BASE_ROLES) },
  }
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('prepared absent-role information', () => {
  it.each([[], [ROLE.bard], [ROLE.bard, ROLE.bard], [ROLE.bard, ROLE.monk], [ROLE.bard, ROLE.witch]])('rejects missing, duplicate, dealt or non-possible choices: %j', (...values) => {
    expect(validateSetup(setupFor(values as string[])).valid).toBe(false)
  })
  it('requires preselection for new games and explains a pool that is too small', () => {
    const setup = setupFor()
    delete setup.absentRoleSelections
    expect(() => createInitialState(setup)).toThrow('before starting')
    setup.publicRoles = setup.publicRoles.filter(range => setup.exactDeck.includes(range.roleId))
    expect(validateSetup(setup).issues.some(issue => issue.message.includes('Add more possible roles'))).toBe(true)
  })
  it('honours a scenario minimum and filters status roles, zero ranges and unknown roles', () => {
    const setup = setupFor()
    setup.rules!.scenario.roleOverrides[ROLE.monk] = { minimumAbsentRoles: 3 }
    expect(validateSetup(setup).valid).toBe(false)
    setup.absentRoleSelections![ROLE.monk][abilityId].push(ROLE.hermit)
    expect(validateSetup(setup).valid).toBe(true)
    setup.publicRoles.push({ roleId: ROLE.romeo, min: 0, max: 1 }, { roleId: ROLE.witch, min: 0, max: 0 }, { roleId: 'missing', min: 0, max: 1 })
    expect(absentRoleCandidates(setup, setup.rules!.roles)).toEqual([ROLE.bard, ROLE.innkeeper, ROLE.hermit])
  })
  it('does not require information when the role is merely possible', () => {
    const setup = setupFor()
    setup.exactDeck[0] = ROLE.hermit; setup.manualAssignments!.p0 = ROLE.hermit
    delete setup.absentRoleSelections
    expect(absentRoleRequirements(setup, setup.rules!.roles, setup.rules!.scenario)).toEqual([])
    expect(validateSetup(setup).valid).toBe(true)
  })
  it('drops invalidated choices after changing the deck or public pool without replacing them', () => {
    const setup = setupFor()
    setup.exactDeck[1] = ROLE.bard
    expect(reconcileAbsentRoleSelections(setup, setup.rules!.roles, setup.rules!.scenario)[ROLE.monk][abilityId]).toEqual([ROLE.innkeeper])
    setup.publicRoles = setup.publicRoles.filter(range => range.roleId !== ROLE.innkeeper)
    expect(reconcileAbsentRoleSelections(setup, setup.rules!.roles, setup.rules!.scenario)[ROLE.monk][abilityId]).toEqual([])
  })
  it.each(['random', 'locked-random', 'manual'] as const)('shows the same information after %s allocation and disallows a night-time change', assignment => {
    const setup = setupFor(); setup.assignment = assignment
    if (assignment === 'locked-random') setup.players[1].lockedRoleId = ROLE.monk
    const state = createInitialState(setup), pending = availableCommand(state)
    const actor = state.players.find(player => player.roleId === ROLE.monk)!
    expect(pending).toMatchObject({ type: 'choose', actorId: actor.id, min: 0, max: 0, candidates: [], information: [{ value: 'Bard and Innkeeper' }] })
    expect(pending.type === 'choose' && pending.instructions).toContain('Tell this player the absent roles shown below')
    expect(() => applyCommand(state, { type: 'choose', actorId: actor.id, abilityId, targets: [ROLE.hermit] })).toThrow('legal target')
    const result = applyCommand(state, { type: 'choose', actorId: actor.id, abilityId, targets: [] })
    expect(result.events.find(event => event.type === 'setup.action')?.targets).toEqual([ROLE.bard, ROLE.innkeeper])
    expect(result.state.pendingAnnouncements.some(item => item.category === 'Private result')).toBe(false)
    expect(result.trace.some(entry => entry.message.includes('Bard and Innkeeper'))).toBe(true)
  })
  it('keeps information through card distribution, JSON resume, undo/redo and replay', () => {
    const setup = setupFor(); setup.assignment = 'random'; setup.distributeRolesInApp = true
    let session = createRoleDeal(setup)
    while (availableDealCards(session).length) session = confirmDealCard(pickDealCard(session, availableDealCards(session).at(-1)!.id))
    session = finishRoleDeal(JSON.parse(JSON.stringify(session)))
    const pending = availableCommand(currentState(session))
    if (pending.type !== 'choose') throw new Error('Expected Monk action')
    expect(pending.information?.[0].value).toBe('Bard and Innkeeper')
    const command = { type: 'choose' as const, actorId: pending.actorId, abilityId: pending.abilityId, targets: [] }
    const advanced = applyToSession(session, command)
    expect(availableCommand(currentState(undo(advanced)))).toEqual(pending)
    expect(currentState(redo(undo(advanced)))).toEqual(currentState(advanced))
    expect(applyCommand(currentState(session), command).state).toEqual(currentState(advanced))
  })
  it('supports a renamed, exported and imported clone without role-name checks', () => {
    const clone = forkArtifact(BASE_ROLES.find(role => role.id === ROLE.monk)!)
    clone.meta.name = 'Archivist'
    const imported = parseArtifact(JSON.stringify(withChecksum(clone))) as RoleDefinition
    const setup = setupFor()
    setup.rules!.roles.push(imported); setup.exactDeck[0] = imported.id; setup.publicRoles[0].roleId = imported.id; setup.manualAssignments!.p0 = imported.id
    setup.absentRoleSelections = { [imported.id]: { [imported.abilities[0].id]: [ROLE.bard, ROLE.innkeeper] } }
    expect(absentRoleRequirements(setup, setup.rules!.roles, setup.rules!.scenario)[0].roleName).toBe('Archivist')
    expect(availableCommand(createInitialState(setup))).toMatchObject({ candidates: [], information: [{ value: 'Bard and Innkeeper' }] })
  })
  it('keeps an existing saved game without prepared information playable', () => {
    const session = createSession(setupFor())
    delete currentState(session).setup.absentRoleSelections
    const state = JSON.parse(JSON.stringify(currentState(session)))
    expect(availableCommand(state)).toMatchObject({ min: 2, max: 3, candidates: [ROLE.bard, ROLE.innkeeper, ROLE.hermit] })
    expect(() => applyCommand(state, { type: 'choose', actorId: 'p0', abilityId, targets: [ROLE.bard, ROLE.hermit] })).not.toThrow()
  })
  it('finishes an older saved card deal without inventing prepared information', () => {
    let session = createRoleDeal(setupFor())
    delete session.setup.absentRoleSelections
    delete currentState(session).setup.absentRoleSelections
    while (availableDealCards(session).length) session = confirmDealCard(pickDealCard(session, availableDealCards(session)[0].id))
    const finished = finishRoleDeal(JSON.parse(JSON.stringify(session)))
    expect(finished.setup.absentRoleSelections).toBeUndefined()
    expect(availableCommand(currentState(finished))).toMatchObject({ min: 2, candidates: [ROLE.bard, ROLE.innkeeper, ROLE.hermit] })
  })
  it('requires a moderator choice in Deal & review and removes newly dealt choices', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const start = vi.fn()
    render(<SetupWizard roles={BASE_ROLES} packs={[BASE_PACK]} scenarios={[BASE_SCENARIO]} onCancel={() => {}} onStart={start} />)
    const next = () => fireEvent.click(screen.getByRole('button', { name: /^Continue$/ }))
    next()
    for (let i = 1; i <= 6; i++) fireEvent.change(screen.getByLabelText(`Player ${i} name`), { target: { value: `Person ${i}` } })
    next()
    for (const name of ['Monk', 'Alpha Wolf', 'Clairvoyant', 'Wizard', 'Medium', 'Witch']) fireEvent.click(screen.getByLabelText(`${name} in play`))
    next()
    expect(screen.getByRole('button', { name: /Deal roles & begin/ })).toBeDisabled()
    expect(screen.queryByLabelText('Monk: reveal Alpha Wolf')).toBeNull()
    fireEvent.click(screen.getByLabelText('Monk: reveal Bard'))
    fireEvent.click(screen.getByLabelText('Monk: reveal Innkeeper'))
    expect(screen.getByRole('button', { name: /Deal roles & begin/ })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }))
    fireEvent.click(screen.getByLabelText('Witch in play'))
    fireEvent.click(screen.getByLabelText('Bard in play'))
    next()
    expect(screen.queryByLabelText('Monk: reveal Bard')).toBeNull()
    expect(screen.getByRole('button', { name: /Deal roles & begin/ })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Choices that are no longer eligible have been removed')
    fireEvent.click(screen.getByLabelText('Monk: reveal Hermit'))
    fireEvent.click(screen.getByRole('button', { name: /Deal roles & begin/ }))
    expect(start.mock.calls[0][0].absentRoleSelections[ROLE.monk][abilityId]).toEqual([ROLE.innkeeper, ROLE.hermit])
  })
})
