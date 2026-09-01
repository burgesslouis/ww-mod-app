import { describe, expect, it } from 'vitest'
import type { PhaseDefinition } from '../domain/types'
import { voteUiContext } from '../components/GameView'

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
