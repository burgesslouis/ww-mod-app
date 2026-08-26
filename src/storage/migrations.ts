import { OFFICIAL_SCENARIO } from '../data/expansions'
import { OFFICIAL_SCENARIO_ID, PACK_ID, SCENARIO_ID } from '../domain/ids'
import type { GameSession, GameSetup, GameState } from '../domain/types'

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

function migrateState(input: GameState): GameState {
  if (input.scenarioId !== SCENARIO_ID && input.setup.scenarioId !== SCENARIO_ID) return input
  const state = structuredClone(input)
  state.scenarioId = OFFICIAL_SCENARIO_ID
  state.setup = migrateSetup(state.setup)
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
  if (input.setup.scenarioId !== SCENARIO_ID && !input.snapshots.some((snapshot) => snapshot.state.scenarioId === SCENARIO_ID)) return input
  const session = structuredClone(input)
  session.setup = migrateSetup(session.setup)
  session.snapshots = session.snapshots.map((snapshot) => ({ ...snapshot, state: migrateState(snapshot.state) }))
  session.updatedAt = new Date().toISOString()
  return session
}
