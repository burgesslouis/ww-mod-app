import { describe, expect, it } from 'vitest'
import type { GameSession, PhaseDefinition } from '../domain/types'
import { canReturnToSetup, voteUiContext } from '../components/GameView'

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
