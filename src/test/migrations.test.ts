import { describe, expect, it } from 'vitest'
import { BASE_ROLES, BASE_SCENARIO } from '../data/base'
import { OFFICIAL_SCENARIO } from '../data/expansions'
import { OFFICIAL_SCENARIO_ID, PACK_ID, ROLE, SCENARIO_ID } from '../domain/ids'
import type { GameSetup } from '../domain/types'
import { createSession } from '../engine/engine'
import { migrateLegacySession } from '../storage/migrations'

describe('scenario compatibility migration', () => {
  it('moves legacy Base Game saves onto the canonical scenario and maps their current phase', () => {
    const setup: GameSetup = {
      scenarioId: SCENARIO_ID, packIds: [], players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
      publicRoles: [{ roleId: ROLE.alphaWolf, min: 1, max: 1 }, { roleId: ROLE.farmer, min: 2, max: 2 }], exactDeck: [ROLE.alphaWolf, ROLE.farmer, ROLE.farmer],
      assignment: 'manual', manualAssignments: { a: ROLE.alphaWolf, b: ROLE.farmer, c: ROLE.farmer }, seed: 2,
      rules: { scenario: structuredClone(BASE_SCENARIO), roles: structuredClone(BASE_ROLES) },
    }
    const legacy = createSession(setup)
    const state = legacy.snapshots[0].state
    state.pipeline = 'cycle'; state.phaseId = 'base.night.healer'; state.phaseIndex = BASE_SCENARIO.cyclePipeline.findIndex((phase) => phase.id === state.phaseId)
    state.completedActions.push(`cycle:1:base.night.healer:b:${ROLE.healer}.revive`)
    const migrated = migrateLegacySession(legacy), next = migrated.snapshots[0].state
    expect(migrated.setup.scenarioId).toBe(OFFICIAL_SCENARIO_ID)
    expect(next.rules.scenario.id).toBe(OFFICIAL_SCENARIO.id)
    expect(next.packIds).toContain(PACK_ID)
    expect(next.phaseId).toBe('official.night.after-attacks')
    expect(OFFICIAL_SCENARIO.cyclePipeline[next.phaseIndex]?.id).toBe(next.phaseId)
    expect(next.completedActions[0]).toContain(':official.night.after-attacks:')
  })

  it('leaves canonical sessions untouched', () => {
    const canonical = { setup: { scenarioId: OFFICIAL_SCENARIO_ID }, snapshots: [] } as never
    expect(migrateLegacySession(canonical)).toBe(canonical)
  })
})
