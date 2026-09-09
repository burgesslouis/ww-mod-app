import { describe, expect, it } from 'vitest'
import type { GameSession, PhaseDefinition } from '../domain/types'
import { canReturnToSetup, privateResultItems, voteUiContext } from '../components/GameView'

const votePhase = (vote: 'nomination' | 'ballot'): PhaseDefinition => ({
  id: `test.${vote}`,
  type: 'aggregate-vote',
  label: vote,
  vote,
  eligible: vote === 'ballot' ? 'alive-except-candidates' : 'alive',
})

describe('moderator vote display', () => {
  it('does not present the previous Ballot during a later first vote', () => {
    expect(voteUiContext(votePhase('nomination'), 'ballot')).toEqual({ activeVoteKind: 'nomination', showLatestTally: false })
  })

  it('presents Ballot context during the current Ballot vote', () => {
    expect(voteUiContext(votePhase('ballot'), 'nomination')).toEqual({ activeVoteKind: 'ballot', showLatestTally: true })
  })

  it('hides old voting context outside voting phases', () => {
    const night: PhaseDefinition = { id: 'test.night', type: 'role-actions', label: 'Night', trigger: 'night.action' }
    expect(voteUiContext(night, 'ballot')).toEqual({ activeVoteKind: undefined, showLatestTally: false })
  })
})

describe('private result presentation', () => {
  it.each([
    ['Alex: CORRUPT', 'danger'],
    ['Alex: NOT CORRUPT', 'neutral'],
    ['Alex: MYSTIC', 'mystic'],
    ['Alex: NOT MYSTIC', 'neutral'],
    ['Alex: VILLAGE', 'positive'],
    ['Alex: NOT VILLAGE', 'neutral'],
    ['Necromancer: present', 'positive'],
    ['Necromancer: absent', 'neutral'],
  ])('gives %s the %s visual tone', (message, tone) => {
    expect(privateResultItems(message)).toEqual([{ subject: message.split(':')[0], value: message.split(': ')[1], tone }])
  })

  it('separates simultaneous private results into individual reveal panels', () => {
    expect(privateResultItems('Alex: MYSTIC · Inquisition: absent')).toEqual([
      { subject: 'Alex', value: 'MYSTIC', tone: 'mystic' },
      { subject: 'Inquisition', value: 'absent', tone: 'neutral' },
    ])
  })

  it('keeps sentence-style private information as a large generic result', () => {
    expect(privateResultItems('The known Spirit is removed from play.')).toEqual([
      { value: 'The known Spirit is removed from play.', tone: 'information' },
    ])
  })
})

describe('setup reopening', () => {
  function sessionWith(patch: Record<string, unknown> = {}): GameSession {
    const state = { pipeline: 'setup', cycle: 0, gameOver: false, events: [{ type: 'game.started' }], ...patch } as unknown as GameSession['snapshots'][number]['state']
    return { id: 's', name: 'Game', createdAt: '', updatedAt: '', setup: {} as GameSession['setup'], snapshots: [{ state }], cursor: 0 }
  }
  it('allows setup editing only for a fresh, finished deal', () => {
    expect(canReturnToSetup(sessionWith())).toBe(true)
    expect(canReturnToSetup(sessionWith({ events: [{ type: 'game.started' }, { type: 'setup.action' }] }))).toBe(false)
    expect(canReturnToSetup(sessionWith({ pipeline: 'cycle' }))).toBe(false)
    expect(canReturnToSetup({ ...sessionWith(), roleDeal: { cards: [], picks: [], finished: false } })).toBe(false)
  })
})
