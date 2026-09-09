import { OFFICIAL_SCENARIO } from '../data/expansions'
import { OFFICIAL_SCENARIO_ID, PACK_ID, SCENARIO_ID } from '../domain/ids'
import type { GameSession, GameSetup, GameState } from '../domain/types'
import { spokenTurnBlockers } from '../engine/setupInformation'

const PHASE_ALIASES: Record<string, string> = {
  'base.setup.actions': 'official.setup.actions', 'base.setup.complete': 'official.setup.complete',
  'base.day.discussion': 'official.day.discussion', 'base.day.nomination-vote': 'official.day.nomination-vote',
  'base.day.qualify': 'official.day.qualify', 'base.day.ballot-vote': 'official.day.ballot-vote', 'base.day.burn': 'official.day.burn',
  'base.night.actions': 'official.night.actions', 'base.night.attacks': 'official.night.attacks', 'base.night.healer': 'official.night.after-attacks',
  'base.morning.victory': 'official.morning.victory', 'base.morning.news': 'official.morning.news', 'base.cycle.end': 'official.cycle.end',
}

function migrateSetup(setup: GameSetup): GameSetup {
  if (setup.scenarioId !== SCENARIO_ID) return setup
  const migrated = structuredClone(setup)
  migrated.scenarioId = OFFICIAL_SCENARIO_ID
  migrated.packIds = [...new Set([PACK_ID, ...migrated.packIds])]
  if (migrated.rules) migrated.rules.scenario = structuredClone(OFFICIAL_SCENARIO)
  return migrated
}

function normalizeSpokenNight(setup: GameSetup, roles: GameState['rules']['roles']): GameSetup {
  if (!setup.silentNight) return setup
  const blockers = spokenTurnBlockers(setup, roles)
  if (!blockers.length) return setup
  const names = blockers.map((blocker) => `${blocker.roleName} · ${blocker.abilityName}`).join(', ')
  return {
    ...setup,
    silentNight: false,
    setupWarnings: [...new Set([...(setup.setupWarnings ?? []), `Silent Night was turned off while loading this saved setup because ${names} requires a spoken turn.`])],
  }
}

function migrateState(input: GameState): GameState {
  if (input.scenarioId !== SCENARIO_ID && input.setup.scenarioId !== SCENARIO_ID) {
    const normalizedSetup = normalizeSpokenNight(input.setup, input.rules.roles)
    return normalizedSetup === input.setup ? input : { ...structuredClone(input), setup: normalizedSetup }
  }
  const state = structuredClone(input)
  state.scenarioId = OFFICIAL_SCENARIO_ID
  state.setup = migrateSetup(state.setup)
  state.setup = normalizeSpokenNight(state.setup, state.rules.roles)
  state.packIds = [...new Set([PACK_ID, ...state.packIds])]
  state.rules.scenario = structuredClone(OFFICIAL_SCENARIO)
  const previousPhase = state.phaseId
  state.phaseId = PHASE_ALIASES[previousPhase] ?? previousPhase
  const phases = state.pipeline === 'setup' ? OFFICIAL_SCENARIO.setupPipeline : OFFICIAL_SCENARIO.cyclePipeline
  const phaseIndex = phases.findIndex((phase) => phase.id === state.phaseId)
  if (phaseIndex >= 0) state.phaseIndex = phaseIndex
  state.completedActions = state.completedActions.map((key) => Object.entries(PHASE_ALIASES).reduce((result, [oldId, newId]) => result.replace(`:${oldId}:`, `:${newId}:`), key))
  state.events = state.events.map((event) => ({ ...event, phaseId: PHASE_ALIASES[event.phaseId] ?? event.phaseId }))
  return state
}

/** Compatibility shim for saves created before Base Game was folded into Official Game. */
export function migrateLegacySession(input: GameSession): GameSession {
  const legacy = input.setup.scenarioId === SCENARIO_ID || input.snapshots.some((snapshot) => snapshot.state.scenarioId === SCENARIO_ID)
  const hasSpokenDependency = input.snapshots.some((snapshot) => snapshot.state.setup.silentNight && spokenTurnBlockers(snapshot.state.setup, snapshot.state.rules.roles).length > 0)
  if (!legacy && !hasSpokenDependency) return input
  const session = structuredClone(input)
  session.setup = migrateSetup(session.setup)
  session.snapshots = session.snapshots.map((snapshot) => ({ ...snapshot, state: migrateState(snapshot.state) }))
  const current = session.snapshots[session.cursor]?.state ?? session.snapshots.at(-1)?.state
  if (current) session.setup = normalizeSpokenNight(session.setup, current.rules.roles)
  session.updatedAt = new Date().toISOString()
  return session
}
