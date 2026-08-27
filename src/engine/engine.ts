import { BASE_ROLES, BASE_SCENARIO, roleName } from '../data/base'
import { DARKEST_NIGHT_ROLES, HIDDEN_MOTIVES_ROLES, OFFICIAL_SCENARIO } from '../data/expansions'
import { FACTION, TRAIT } from '../domain/ids'
import type {
  AbilityDefinition, ApplyResult, Condition, Effect, GameCommand, GameEvent, GameSession, GameSetup,
  EffectiveProperty, FactionDefinition, GameState, PendingCommand, PlayerState, RoleDefinition, ScenarioDefinition, Selector, SessionSnapshot,
  TraceEntry, ValidationIssue, ValidationResult, VoteState,
} from '../domain/types'

const clone = <T,>(value: T): T => structuredClone(value)
const ASSIGN_SPIRIT_ABILITY = 'wherewolf.hidden-motives.system.assign-spirit'

function nextRandom(random: GameState['random']): number {
  let value = random.value | 0
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5
  random.value = value >>> 0; random.draws += 1
  return random.value / 0x100000000
}

function shuffle<T>(items: T[], random: GameState['random']): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(nextRandom(random) * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function rulesFor(setup: GameSetup): { scenario: ScenarioDefinition; roles: RoleDefinition[] } {
  if (setup.rules) return clone(setup.rules)
  if (setup.scenarioId === OFFICIAL_SCENARIO.id) return { scenario: clone(OFFICIAL_SCENARIO), roles: clone([...BASE_ROLES, ...DARKEST_NIGHT_ROLES, ...HIDDEN_MOTIVES_ROLES]) }
  return { scenario: clone(BASE_SCENARIO), roles: clone(BASE_ROLES) }
}

function roleMap(state: GameState): Map<string, RoleDefinition> {
  return new Map(state.rules.roles.map((role) => [role.id, role]))
}

function roleOf(state: GameState, player: PlayerState): RoleDefinition | undefined { return roleMap(state).get(player.roleId) }
function factionDefinitions(state: GameState): FactionDefinition[] {
  const selectedPacks = state.rules.scenario.packs.filter((pack) => state.packIds.includes(pack.id))
  return [...new Map([...state.rules.scenario.factions, ...selectedPacks.flatMap((pack) => pack.factions ?? [])].map((faction) => [faction.id, faction])).values()]
}
function factionDefinition(state: GameState, id: string): FactionDefinition | undefined { return factionDefinitions(state).find((faction) => faction.id === id) }
export function factionName(state: GameState, id: string): string { return factionDefinition(state, id)?.name ?? id.split('.').at(-1) ?? id }
function factionOf(state: GameState, player: PlayerState): string { return player.factionOverride ?? roleOf(state, player)?.faction ?? 'unknown' }
function statusIsActive(state: GameState, status: PlayerState['statuses'][number]): boolean {
  if (status.data?.sourceMustLive && status.sourcePlayerId && !state.players.find((player) => player.id === status.sourcePlayerId)?.alive) return false
  const requiredStatus = String(status.data?.sourceMustHaveStatus ?? '')
  if (requiredStatus && status.sourcePlayerId && !state.players.find((player) => player.id === status.sourcePlayerId)?.statuses.some((entry) => entry.id === requiredStatus)) return false
  return true
}
function activeStatuses(state: GameState, player: PlayerState) { return player.statuses.filter((status) => statusIsActive(state, status)) }
function traitsOf(state: GameState, player: PlayerState): Set<string> {
  return new Set([...(roleOf(state, player)?.traits ?? []), ...activeStatuses(state, player).flatMap((status) => status.traits ?? [])])
}
function hasTrait(state: GameState, playerId: string | undefined, trait: string): boolean {
  const player = state.players.find((item) => item.id === playerId)
  return player ? traitsOf(state, player).has(trait) : false
}

export function effectiveProperties(state: GameState, playerId: string): EffectiveProperty[] {
  const player = state.players.find((entry) => entry.id === playerId)
  if (!player) return []
  const role = roleOf(state, player), faction = factionDefinition(state, factionOf(state, player))
  const traits = new Map(state.rules.scenario.packs.filter((pack) => state.packIds.includes(pack.id)).flatMap((pack) => pack.traitDefinitions ?? []).map((trait) => [trait.id, trait]))
  state.rules.roles.flatMap((definition) => definition.traitDefinitions ?? []).forEach((trait) => { if (!traits.has(trait.id)) traits.set(trait.id, trait) })
  const properties: EffectiveProperty[] = []
  if (faction?.alignment) properties.push({ id: `alignment:${faction.alignment}`, label: faction.alignment[0].toUpperCase() + faction.alignment.slice(1), kind: 'alignment', colour: faction.alignment === 'human' ? '#7f9d7b' : faction.alignment === 'shadow' ? '#8a5b70' : '#938f84' })
  properties.push({ id: `faction:${factionOf(state, player)}`, label: faction?.name ?? factionOf(state, player).split('.').at(-1) ?? factionOf(state, player), kind: 'faction', colour: faction?.colour })
  traitsOf(state, player).forEach((id) => { const trait = traits.get(id); properties.push({ id: `trait:${id}`, label: trait?.label ?? id.split('.').at(-1)?.replace(/-/g, ' ') ?? id, kind: 'trait', colour: trait?.colour }) })
  activeStatuses(state, player).forEach((status) => properties.push({ id: `status:${status.id}`, label: status.name, kind: 'status' }))
  if (player.initialRoleId !== player.roleId) properties.push({ id: 'transformation:role', label: `Transformed from ${state.rules.roles.find((definition) => definition.id === player.initialRoleId)?.meta.name ?? player.initialRoleId}`, kind: 'transformation' })
  role?.state.forEach((definition) => {
    const value = player.roleState[definition.key]
    if (value !== null && value !== undefined && value !== false && value !== '') properties.push({ id: `state:${definition.key}`, label: `${definition.label}: ${String(value).replace(/_/g, ' ')}`, kind: 'state' })
  })
  return [...new Map(properties.map((property) => [property.id, property])).values()]
}

function currentPhase(state: GameState) {
  const phases = state.pipeline === 'setup' ? state.rules.scenario.setupPipeline : state.rules.scenario.cyclePipeline
  return phases[state.phaseIndex]
}

function issue(issues: ValidationIssue[], path: string, message: string, severity: 'error' | 'warning' = 'error') { issues.push({ path, message, severity }) }

export function validateSetup(setup: GameSetup): ValidationResult {
  const issues: ValidationIssue[] = []
  const { scenario, roles } = rulesFor(setup)
  const known = new Map(roles.map((entry) => [entry.id, entry]))
  if (setup.scenarioId !== scenario.id) issue(issues, 'scenarioId', 'The selected scenario definition is unavailable.')
  if (setup.players.length < 3) issue(issues, 'players', 'Enter at least three players.')
  const names = setup.players.map((player) => player.name.trim())
  if (names.some((name) => !name)) issue(issues, 'players', 'Every player needs a name.')
  if (new Set(names.map((name) => name.toLocaleLowerCase())).size !== names.length) issue(issues, 'players', 'Player names must be unique.')
  if (setup.exactDeck.length !== setup.players.length) issue(issues, 'exactDeck', `The secret deck has ${setup.exactDeck.length} roles for ${setup.players.length} players.`)
  const exactCounts = new Map<string, number>()
  setup.exactDeck.forEach((id, index) => {
    if (!known.has(id)) issue(issues, `exactDeck.${index}`, `Unknown role ${id}.`)
    exactCounts.set(id, (exactCounts.get(id) ?? 0) + 1)
  })
  const rangeIds = new Set<string>()
  setup.publicRoles.forEach((range, index) => {
    rangeIds.add(range.roleId)
    if (!known.has(range.roleId)) issue(issues, `publicRoles.${index}`, `Unknown role ${range.roleId}.`)
    if (range.min < 0 || range.max < range.min) issue(issues, `publicRoles.${index}`, 'Role ranges require 0 ≤ minimum ≤ maximum.')
    const count = exactCounts.get(range.roleId) ?? 0
    if (count < range.min || count > range.max) issue(issues, `publicRoles.${index}`, `${known.get(range.roleId)?.meta.name ?? range.roleId} count ${count} is outside the public ${range.min}–${range.max} range.`)
  })
  exactCounts.forEach((_count, id) => { if (!rangeIds.has(id)) issue(issues, 'publicRoles', `${known.get(id)?.meta.name ?? id} is in the secret deck but not the public possible-role list.`) })
  roles.filter((entry) => exactCounts.has(entry.id)).forEach((entry) => {
    [...entry.requirements, ...entry.abilities.flatMap((ability) => ability.requires ?? [])].forEach((capability) => {
      if (!scenario.capabilities.includes(capability)) issue(issues, `roles.${entry.id}`, `${entry.meta.name} requires “${capability}”, which ${scenario.meta.name} does not provide.`)
    })
    entry.abilities.flatMap((ability) => ability.effects).forEach((effect) => {
      const referenced = effect.type === 'transformRole' ? (typeof effect.roleId === 'string' ? effect.roleId : undefined) : effect.type === 'learnRoleIdentity' || effect.type === 'learnRolePresence' ? effect.roleId : undefined
      if (referenced && !known.has(referenced)) issue(issues, `roles.${entry.id}`, `${entry.meta.name} references unavailable role ${referenced}.`)
    })
  })
  Object.entries(scenario.roleOverrides).forEach(([roleId, overrides]) => Object.keys(overrides).forEach((key) => {
    const constant = known.get(roleId)?.constants.find((entry) => entry.key === key)
    if (!constant?.scenarioOverridable) issue(issues, `roleOverrides.${roleId}.${key}`, `${scenario.meta.name} may not override undeclared or fixed value “${key}”.`)
  }))
  const order = setup.nightOrder ?? scenario.nightOrder
  const positions = new Map(order.map((id, index) => [id, index]))
  scenario.dependencyBarriers.forEach((barrier) => {
    const before = positions.get(barrier.before), after = positions.get(barrier.after)
    if (before !== undefined && after !== undefined && before > after) issue(issues, 'nightOrder', barrier.reason)
  })
  if (setup.assignment === 'manual') {
    const assigned = setup.manualAssignments ?? {}
    const assignedDeck = setup.players.map((player) => assigned[player.id]).filter(Boolean).sort()
    if (assignedDeck.length !== setup.players.length || JSON.stringify(assignedDeck) !== JSON.stringify([...setup.exactDeck].sort())) issue(issues, 'manualAssignments', 'Manual assignments must use every secret-deck role exactly once.')
  }
  setup.players.forEach((player) => { if (player.lockedRoleId && !setup.exactDeck.includes(player.lockedRoleId)) issue(issues, `players.${player.id}`, `${player.name} is locked to a role that is not in the secret deck.`) })
  const lockedCounts = new Map<string, number>()
  setup.players.forEach((player) => { if (player.lockedRoleId) lockedCounts.set(player.lockedRoleId, (lockedCounts.get(player.lockedRoleId) ?? 0) + 1) })
  lockedCounts.forEach((count, roleId) => { if (count > (exactCounts.get(roleId) ?? 0)) issue(issues, 'players', `More seats are locked to ${known.get(roleId)?.meta.name ?? roleId} than exist in the secret deck.`) })
  return { valid: !issues.some((entry) => entry.severity === 'error'), issues }
}

function assignPlayers(setup: GameSetup, random: GameState['random']): PlayerState[] {
  const manual = setup.manualAssignments ?? {}
  const remaining = [...setup.exactDeck]
  const assignments = new Map<string, string>()
  setup.players.forEach((player) => {
    const locked = setup.assignment === 'manual' ? manual[player.id] : player.lockedRoleId
    if (locked) {
      assignments.set(player.id, locked)
      const index = remaining.indexOf(locked)
      if (index >= 0) remaining.splice(index, 1)
    }
  })
  const shuffled = shuffle(remaining, random)
  setup.players.filter((player) => !assignments.has(player.id)).forEach((player, index) => assignments.set(player.id, shuffled[index]))
  return setup.players.map((player) => {
    const roleId = assignments.get(player.id)!
    const definition = rulesFor(setup).roles.find((entry) => entry.id === roleId)
    const configured = setup.hiddenState?.[player.id] ?? {}
    return {
      id: player.id, name: player.name.trim(), alive: true, initialRoleId: roleId, roleId,
      statuses: [], roleState: Object.fromEntries((definition?.state ?? []).map((entry) => [entry.key, configured[entry.key] ?? entry.initial])),
    }
  })
}

export function createInitialState(setup: GameSetup): GameState {
  const validation = validateSetup(setup)
  if (!validation.valid) throw new Error(validation.issues.map((entry) => entry.message).join('\n'))
  const random = { seed: setup.seed >>> 0, value: (setup.seed || 0x9e3779b9) >>> 0, draws: 0 }
  const rules = rulesFor(setup)
  const state: GameState = {
    id: crypto.randomUUID(), schemaVersion: 1, scenarioId: setup.scenarioId, setup: clone(setup), rules,
    packIds: [...setup.packIds], players: [], relationships: [], pipeline: 'setup', phaseIndex: 0,
    phaseId: rules.scenario.setupPipeline[0]?.id ?? '', cycle: 0, random, ballot: [], attacks: [], pendingDeaths: [],
    pendingAnnouncements: [], pendingSpiritAssignments: [], personalWinners: [], personalLosers: [], winningFactions: [], winners: [], gameOver: false, events: [], trace: [],
    completedActions: [], acceptedInvalidTallies: 0, facts: {},
  }
  state.players = assignPlayers(setup, state.random)
  emit(state, 'game.started', 'Game created. Roles are assigned and kept on this device.', 'moderator')
  return state
}

export function createSession(setup: GameSetup, name = 'Current game'): GameSession {
  const state = createInitialState(setup)
  const now = new Date().toISOString()
  return { id: state.id, name, createdAt: now, updatedAt: now, setup: clone(setup), snapshots: [{ state }], cursor: 0 }
}

interface EventContext {
  event: GameEvent
  ownerId?: string
  participantIds?: string[]
  chosen: string[]
  prevented: boolean
  preventReason?: string
  redirect?: { targetId: string; reason: string; preventable: boolean }
  voteValue?: number
  ballot?: string[]
}

function emit(state: GameState, type: GameEvent['type'], message: string, visibility: 'moderator' | 'public' = 'moderator', data: Partial<GameEvent> & { data?: Record<string, unknown> } = {}): GameEvent {
  const event: GameEvent = {
    id: `evt-${state.events.length + 1}`, sequence: state.events.length + 1, type, cycle: state.cycle,
    phaseId: state.phaseId, visibility, message, ...data,
  }
  state.events.push(event)
  return event
}

function trace(state: GameState, source: string, message: string, effects?: string[], eventId?: string): TraceEntry {
  const entry = { id: `trace-${state.trace.length + 1}`, source, message, effects, eventId }
  state.trace.push(entry); return entry
}

function queueModeratorStep(state: GameState, title: string, message: string, actionLabel = 'Continue') {
  state.pendingAnnouncements.push({ title, message, actionLabel, category: 'Moderator step', visibility: 'moderator' })
}

function compare(left: unknown, operator: string, right: unknown): boolean {
  if (operator === 'eq') return left === right
  if (operator === 'neq') return left !== right
  if (operator === 'includes') return Array.isArray(left) ? left.includes(right) : String(left).includes(String(right))
  const a = Number(left), b = Number(right)
  return operator === 'gt' ? a > b : operator === 'gte' ? a >= b : operator === 'lt' ? a < b : operator === 'lte' ? a <= b : false
}

function relationshipTarget(state: GameState, from: string | undefined, type: string): string | undefined {
  return state.relationships.find((entry) => entry.from === from && entry.type === type)?.to
}

function select(state: GameState, selector: Selector, context: EventContext): string[] {
  const life = 'life' in selector ? selector.life ?? 'any' : 'any'
  const lifeFilter = (player: PlayerState) => life === 'any' || (life === 'alive') === player.alive
  switch (selector.kind) {
    case 'self': return context.ownerId ? [context.ownerId] : []
    case 'chosen': return context.chosen
    case 'eventActor': return context.event.actorId ? [context.event.actorId] : []
    case 'eventTarget': return context.event.targetId ? [context.event.targetId] : []
    case 'allPlayers': return state.players.filter(lifeFilter).map((player) => player.id)
    case 'publicPossibleRoles': return state.setup.publicRoles.map((range) => state.rules.roles.find((role) => role.id === range.roleId)).filter((role): role is RoleDefinition => Boolean(role)).filter((role) => !selector.trait || role.traits.includes(selector.trait)).filter((role) => !selector.activeTrigger || role.abilities.some((ability) => ability.trigger === selector.activeTrigger)).map((role) => role.id)
    case 'trait': return state.players.filter((player) => lifeFilter(player) && hasTrait(state, player.id, selector.trait)).map((player) => player.id)
    case 'faction': return state.players.filter((player) => lifeFilter(player) && factionOf(state, player) === selector.faction).map((player) => player.id)
    case 'notFaction': return state.players.filter((player) => lifeFilter(player) && factionOf(state, player) !== selector.faction).map((player) => player.id)
    case 'role': return state.players.filter((player) => lifeFilter(player) && player.roleId === selector.roleId).map((player) => player.id)
    case 'relationship': {
      const from = selector.from === 'eventTarget' ? context.event.targetId : context.ownerId
      const target = relationshipTarget(state, from, selector.relationship)
      return target ? [target] : []
    }
    case 'highestRoleOrder': {
      const order = state.rules.scenario.nightOrder
      return state.players.filter((player) => lifeFilter(player) && hasTrait(state, player.id, selector.trait)).sort((a, b) => {
        const aAbilities = roleOf(state, a)?.abilities.map((ability) => order.indexOf(ability.id)).filter((index) => index >= 0) ?? []
        const bAbilities = roleOf(state, b)?.abilities.map((ability) => order.indexOf(ability.id)).filter((index) => index >= 0) ?? []
        return Math.min(...aAbilities, 9999) - Math.min(...bAbilities, 9999)
      }).slice(0, 1).map((player) => player.id)
    }
  }
}

function conditionMatches(state: GameState, condition: Condition | undefined, context: EventContext): boolean {
  if (!condition || condition.op === 'always') return true
  if (condition.op === 'all') return condition.conditions.every((child) => conditionMatches(state, child, context))
  if (condition.op === 'any') return condition.conditions.some((child) => conditionMatches(state, child, context))
  if (condition.op === 'not') return !conditionMatches(state, condition.condition, context)
  if (condition.op === 'actorIsSelf') return context.event.actorId === context.ownerId
  if (condition.op === 'targetIsSelf') return context.event.targetId === context.ownerId
  if (condition.op === 'targetIsRelationship') return relationshipTarget(state, condition.source === 'eventTarget' ? context.event.targetId : context.ownerId, condition.relationship) === context.event.targetId
  if (condition.op === 'hasTrait') {
    const id = condition.subject === 'self' ? context.ownerId : condition.subject === 'actor' ? context.event.actorId : context.event.targetId
    return hasTrait(state, id, condition.trait)
  }
  if (condition.op === 'hasFaction') {
    const id = condition.subject === 'self' ? context.ownerId : condition.subject === 'actor' ? context.event.actorId : context.event.targetId
    const player = state.players.find((item) => item.id === id)
    return Boolean(player && factionOf(state, player) === condition.faction)
  }
  if (condition.op === 'hasStatus') {
    const id = condition.subject === 'self' ? context.ownerId : condition.subject === 'actor' ? context.event.actorId : context.event.targetId
    const player = state.players.find((entry) => entry.id === id)
    return Boolean(player && activeStatuses(state, player).some((status) => status.id === condition.status))
  }
  if (condition.op === 'hasRole') {
    const id = condition.subject === 'self' ? context.ownerId : condition.subject === 'actor' ? context.event.actorId : context.event.targetId
    return state.players.find((player) => player.id === id)?.roleId === condition.roleId
  }
  if (condition.op === 'isAlive') {
    const id = condition.subject === 'self' ? context.ownerId : condition.subject === 'actor' ? context.event.actorId : context.event.targetId
    return Boolean(state.players.find((player) => player.id === id)?.alive) === (condition.value ?? true)
  }
  if (condition.op === 'ownerInBallot') return state.ballot.includes(context.ownerId ?? '') === (condition.value ?? true)
  if (condition.op === 'targetRoleHasTrait') {
    const player = state.players.find((item) => item.id === context.event.targetId)
    const definition = player ? roleOf(state, player) : state.rules.roles.find((role) => role.id === context.event.targetId)
    return Boolean(definition?.traits.includes(condition.trait))
  }
  if (condition.op === 'packSelected') return state.packIds.includes(condition.packId)
  if (condition.op === 'cycle') return compare(state.cycle, condition.compare, condition.value)
  if (condition.op === 'state') return compare(state.players.find((player) => player.id === context.ownerId)?.roleState[condition.key], condition.compare, condition.value)
  if (condition.op === 'fact') return compare(state.facts[condition.key], condition.compare, condition.value)
  if (condition.op === 'event') return compare(context.event.data?.[condition.field], condition.compare, condition.value)
  if (condition.op === 'count') {
    const value = typeof condition.value === 'object' ? Number(constantValue(state, context.ownerId, condition.value.constant)) : condition.value
    return compare(select(state, condition.selector, context).length, condition.compare, value)
  }
  return false
}

// Public night calls may depend on public configuration, but never on whether a role was dealt.
// Unknown player-dependent predicates remain eligible so the call cannot leak hidden state.
function publiclyEnabled(state: GameState, condition: Condition | undefined): boolean {
  if (!condition || condition.op === 'always') return true
  if (condition.op === 'packSelected') return state.packIds.includes(condition.packId)
  if (condition.op === 'cycle') return compare(state.cycle, condition.compare, condition.value)
  if (condition.op === 'all') return condition.conditions.every((child) => publiclyEnabled(state, child))
  if (condition.op === 'any') return condition.conditions.some((child) => publiclyEnabled(state, child))
  if (condition.op === 'not' && ['packSelected', 'cycle', 'all', 'any', 'not'].includes(condition.condition.op)) return !publiclyEnabled(state, condition.condition)
  return true
}

function constantValue(state: GameState, ownerId: string | undefined, key: string): unknown {
  const player = state.players.find((entry) => entry.id === ownerId)
  const definition = player ? roleOf(state, player) : undefined
  return state.rules.scenario.roleOverrides[definition?.id ?? '']?.[key] ?? definition?.constants.find((entry) => entry.key === key)?.default
}

function numericValue(state: GameState, value: Extract<Effect, { type: 'modifyVotesReceived' }>['value'], context: EventContext): number {
  if (typeof value === 'number') return value
  return select(state, value.count, context).length * (value.multiplier ?? 1) + (value.add ?? 0)
}

function abilityOwners(state: GameState, trigger: AbilityDefinition['trigger']): Array<{ owner: PlayerState; ability: AbilityDefinition }> {
  const result: Array<{ owner: PlayerState; ability: AbilityDefinition }> = []
  state.players.forEach((owner) => {
    roleOf(state, owner)?.abilities.filter((ability) => ability.trigger === trigger).forEach((ability) => result.push({ owner, ability }))
    activeStatuses(state, owner).flatMap((status) => status.abilities ?? []).filter((ability) => ability.trigger === trigger).forEach((ability) => result.push({ owner, ability }))
  })
  return result.sort((left, right) => (left.ability.order ?? 100) - (right.ability.order ?? 100) || left.ability.id.localeCompare(right.ability.id) || left.owner.id.localeCompare(right.owner.id))
}

function playerLabel(state: GameState, id: string): string { return state.players.find((player) => player.id === id)?.name ?? state.rules.roles.find((role) => role.id === id)?.meta.name ?? roleName(id) }

function formatList(items: string[]): string {
  if (items.length < 2) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

function killPlayer(state: GameState, playerId: string, cause: string, context: EventContext, timing: 'now' | 'next-morning' = 'now') {
  const player = state.players.find((item) => item.id === playerId)
  if (!player?.alive || state.pendingDeaths.some((entry) => entry.playerId === playerId && entry.timing === timing)) return
  if (timing === 'next-morning') {
    state.pendingDeaths.push({ playerId, cause, timing, sourceDeathPlayerId: context.event.targetId })
    trace(state, 'Delayed death', `${player.name} will die next morning if the original death remains.`, [cause], context.event.id)
    return
  }
  const wasCorrupt = hasTrait(state, playerId, TRAIT.corrupt)
  player.alive = false
  const deathMetadata = (state.facts.deathMetadata && typeof state.facts.deathMetadata === 'object' ? state.facts.deathMetadata : {}) as Record<string, unknown>
  deathMetadata[playerId] = { cause, wasCorrupt, roleId: player.roleId, faction: factionOf(state, player) }
  state.facts.deathMetadata = deathMetadata
  const spiritRolesAvailable = state.rules.roles.some((role) => role.categories.includes('Status') && role.traits.includes(TRAIT.spirit))
  if (spiritRolesAvailable && !hasTrait(state, playerId, TRAIT.spirit) && !state.pendingSpiritAssignments.includes(playerId)) state.pendingSpiritAssignments.push(playerId)
  const nightDeaths = Array.isArray(state.facts.nightDeaths) ? state.facts.nightDeaths as string[] : []
  if (state.phaseId.includes('night')) state.facts.nightDeaths = [...new Set([...nightDeaths, playerId])]
  const event = emit(state, 'death.resolved', `${player.name} died: ${cause}.`, 'moderator', { targetId: playerId, data: { cause } })
  dispatch(state, 'death.resolved', { event, chosen: [], prevented: false })
}

function applyEffect(state: GameState, effect: Effect, context: EventContext): string {
  const targets = 'targets' in effect ? select(state, effect.targets, context) : []
  switch (effect.type) {
    case 'inspectTrait': {
      targets.forEach((id) => {
        const littleFolkImmune = hasTrait(state, context.ownerId, TRAIT.mystic) && hasTrait(state, id, TRAIT.littleFolk)
        const inverted = Boolean(context.ownerId && activeStatuses(state, state.players.find((player) => player.id === context.ownerId)!).some((status) => status.data?.invertInformation))
        const result = inverted ? !hasTrait(state, id, effect.trait) : hasTrait(state, id, effect.trait)
        state.pendingAnnouncements.push({ message: littleFolkImmune ? `${playerLabel(state, id)}: NO RESULT` : `${playerLabel(state, id)}: ${result ? effect.positive : effect.negative}`, category: 'Private result', visibility: 'moderator' })
        if (effect.rememberAs) state.facts[effect.rememberAs] = result
      }); return `inspected ${targets.map((id) => playerLabel(state, id)).join(', ')}`
    }
    case 'inspectFaction': {
      targets.forEach((id) => {
        const littleFolkImmune = hasTrait(state, context.ownerId, TRAIT.mystic) && hasTrait(state, id, TRAIT.littleFolk)
        const inverted = Boolean(context.ownerId && activeStatuses(state, state.players.find((player) => player.id === context.ownerId)!).some((status) => status.data?.invertInformation))
        const matches = factionOf(state, state.players.find((item) => item.id === id)!) === effect.faction
        state.pendingAnnouncements.push({ message: littleFolkImmune ? `${playerLabel(state, id)}: NO RESULT` : `${playerLabel(state, id)}: ${(inverted ? !matches : matches) ? effect.positive : effect.negative}`, category: 'Private result', visibility: 'moderator' })
      })
      return 'faction information recorded'
    }
    case 'inspectStatus': {
      targets.forEach((id) => {
        const player = state.players.find((item) => item.id === id)
        const status = player ? activeStatuses(state, player).find((entry) => entry.id === effect.status) : undefined
        state.pendingAnnouncements.push({ message: `${playerLabel(state, id)}: ${status?.name ?? effect.negative}`, category: 'Private result', visibility: 'moderator' })
      })
      return 'status information recorded'
    }
    case 'learnRolesAbsent': {
      const names = context.chosen.map((id) => state.rules.roles.find((role) => role.id === id)?.meta.name ?? id)
      state.pendingAnnouncements.push({ message: `Absent roles: ${names.join(', ')}`, category: 'Private result', visibility: 'moderator' }); return `learned absent roles: ${names.join(', ')}`
    }
    case 'learnRoleIdentity': {
      const matches = state.players.filter((player) => player.roleId === effect.roleId).map((player) => player.name)
      state.pendingAnnouncements.push({ message: `${state.rules.roles.find((role) => role.id === effect.roleId)?.meta.name}: ${matches.join(', ') || 'not in play'}`, category: 'Private result', visibility: 'moderator' }); return 'role identity revealed'
    }
    case 'learnRolePresence': {
      const present = state.players.some((player) => player.roleId === effect.roleId)
      state.pendingAnnouncements.push({ message: `${state.rules.roles.find((role) => role.id === effect.roleId)?.meta.name}: ${present ? 'present' : 'absent'}`, category: 'Private result', visibility: 'moderator' }); return `role presence: ${present}`
    }
    case 'learnFactionMembers': {
      const grouped = Boolean(context.participantIds?.length)
      const members = state.players.filter((player) => player.alive && factionOf(state, player) === effect.faction && (grouped || player.id !== context.ownerId)).map((player) => player.name)
      state.pendingAnnouncements.push({ message: `${grouped ? 'Present together' : 'Known allies'}: ${members.join(', ') || 'none'}`, category: 'Private result', visibility: 'moderator' }); return `learned ${effect.faction} members`
    }
    case 'learnPlayers': {
      const names = targets.map((id) => playerLabel(state, id))
      state.pendingAnnouncements.push({ message: `${effect.label}: ${names.join(', ') || 'none'}`, category: 'Private result', visibility: 'moderator' })
      return `${effect.label}: ${names.join(', ') || 'none'}`
    }
    case 'learnCount': {
      state.pendingAnnouncements.push({ message: `${effect.label}: ${targets.length}`, category: 'Private result', visibility: 'moderator' })
      return `${effect.label}: ${targets.length}`
    }
    case 'learnPresence': {
      const present = targets.length > 0
      state.pendingAnnouncements.push({ message: `${effect.label}: ${present ? 'present' : 'absent'}`, category: 'Private result', visibility: 'moderator' })
      return `${effect.label}: ${present ? 'present' : 'absent'}`
    }
    case 'conditional': {
      const branch = conditionMatches(state, effect.condition, context) ? effect.effects : effect.otherwise ?? []
      return branch.map((child) => applyEffect(state, child, context)).join('; ') || 'condition had no effect'
    }
    case 'addStatus': {
      targets.forEach((id) => {
        const player = state.players.find((item) => item.id === id); if (!player) return
        player.statuses = player.statuses.filter((status) => status.id !== effect.status.id)
        player.statuses.push({ ...clone(effect.status), duration: effect.duration ?? 'permanent', appliedCycle: state.cycle, sourcePlayerId: context.ownerId })
      }); return `added ${effect.status.name}`
    }
    case 'removeStatus': targets.forEach((id) => { const player = state.players.find((item) => item.id === id); if (player) player.statuses = player.statuses.filter((status) => status.id !== effect.status) }); return `removed ${effect.status}`
    case 'preventEvent': context.prevented = true; context.preventReason = effect.reason; return `prevented event: ${effect.reason}`
    case 'redirectEvent': {
      const targetId = targets[0]; if (targetId) context.redirect = { targetId, reason: effect.reason, preventable: effect.preventable !== false }
      return targetId ? `redirected to ${playerLabel(state, targetId)}` : 'no legal redirect target'
    }
    case 'queueAttack': targets.forEach((targetId) => state.attacks.push({ id: `attack-${state.events.length}-${targetId}`, actorId: context.ownerId, targetId, type: effect.attackType })); return `queued ${effect.attackType} attack`
    case 'kill': targets.forEach((id) => killPlayer(state, id, effect.cause, context, effect.timing)); return `death effect: ${effect.cause}`
    case 'revive': targets.forEach((id) => {
      const player = state.players.find((item) => item.id === id); if (!player || player.alive) return
      player.alive = true; state.pendingDeaths = state.pendingDeaths.filter((death) => death.playerId !== id && death.sourceDeathPlayerId !== id)
      state.facts.nightDeaths = (state.facts.nightDeaths as string[] | undefined)?.filter((entry) => entry !== id) ?? []
      if (effect.limitKey && context.ownerId) state.players.find((item) => item.id === context.ownerId)!.roleState[effect.limitKey] = true
      emit(state, 'command', `${player.name} was revived.`, 'moderator', { targetId: id })
    }); return `revived ${targets.map((id) => playerLabel(state, id)).join(', ')}`
    case 'transformRole': {
      const nextRoleId = typeof effect.roleId === 'string' ? effect.roleId : context.chosen[0]
      if (!nextRoleId || !state.rules.roles.some((role) => role.id === nextRoleId)) return 'no valid transformation role selected'
      targets.forEach((id) => { const player = state.players.find((item) => item.id === id); if (player) { player.roleId = nextRoleId; player.factionOverride = undefined } })
      return `transformed role to ${state.rules.roles.find((role) => role.id === nextRoleId)?.meta.name ?? nextRoleId}`
    }
    case 'changeFaction': targets.forEach((id) => { const player = state.players.find((item) => item.id === id); if (player) player.factionOverride = effect.faction }); return `changed faction to ${effect.faction}`
    case 'linkRelationship': targets.forEach((id) => {
      if (!context.ownerId) return
      state.relationships = state.relationships.filter((rel) => !(rel.from === context.ownerId && rel.type === effect.relationship))
      state.relationships.push({ type: effect.relationship, from: context.ownerId, to: id })
      if (effect.reciprocal) state.relationships.push({ type: effect.reciprocal, from: id, to: context.ownerId })
    }); return `linked relationship with ${targets.map((id) => playerLabel(state, id)).join(', ')}`
    case 'modifyVotesReceived': {
      const value = context.voteValue ?? 0
      const modifier = numericValue(state, effect.value, context)
      let result = effect.operation === 'multiply' ? value * modifier : effect.operation === 'add' ? value + modifier : modifier
      result = effect.rounding === 'ceil' ? Math.ceil(result) : effect.rounding === 'floor' ? Math.floor(result) : effect.rounding === 'round' ? Math.round(result) : result
      context.voteValue = Math.max(0, result); return `votes ${value} → ${Math.max(0, result)}`
    }
    case 'forceBallot': {
      const forced = Array.isArray(state.facts.forcedBallot) ? state.facts.forcedBallot as string[] : []
      state.facts.forcedBallot = [...new Set([...forced, ...targets])]
      return `forced onto Ballot: ${targets.map((id) => playerLabel(state, id)).join(', ')}`
    }
    case 'grantExtraVotes': {
      const key = `extraVotes:${effect.vote}:${state.cycle}`
      state.facts[key] = Number(state.facts[key] ?? 0) + numericValue(state, effect.amount, context)
      return `added ${numericValue(state, effect.amount, context)} expected ${effect.vote} votes`
    }
    case 'suppressAction': {
      targets.forEach((id) => {
        const player = state.players.find((item) => item.id === id); if (!player) return
        player.statuses.push({ id: `wherewolf.core.status.suppress-${effect.trigger}-${state.cycle}`, name: 'Action suppressed', duration: effect.duration ?? (effect.trigger === 'day.action' ? 'day' : 'night'), appliedCycle: state.cycle, sourcePlayerId: context.ownerId, data: { suppressTrigger: effect.trigger } })
      })
      return `suppressed ${effect.trigger}`
    }
    case 'replaceQualifiedCandidate': {
      const guarded = select(state, effect.guarded, context)[0], replacement = select(state, effect.replacement, context)[0]
      if (guarded && replacement && context.ballot?.includes(guarded)) context.ballot = context.ballot.map((id) => id === guarded ? replacement : id)
      return guarded && replacement ? `${playerLabel(state, guarded)} replaced by ${playerLabel(state, replacement)}` : 'no ballot substitution'
    }
    case 'allowCandidateVote': return 'candidate may vote'
    case 'announce': state.pendingAnnouncements.push({ message: effect.message, category: effect.category ?? 'Announcement', visibility: effect.visibility }); return effect.message
    case 'setState': if (context.ownerId) state.players.find((item) => item.id === context.ownerId)!.roleState[effect.key] = effect.value; return `set ${effect.key}`
    case 'incrementState': if (context.ownerId) { const player = state.players.find((item) => item.id === context.ownerId)!; player.roleState[effect.key] = Number(player.roleState[effect.key] ?? 0) + effect.amount }; return `incremented ${effect.key}`
    case 'setStateCount': if (context.ownerId) state.players.find((item) => item.id === context.ownerId)!.roleState[effect.key] = targets.length; return `set ${effect.key} to ${targets.length}`
    case 'personalWin': targets.forEach((id) => { if (!state.personalWinners.some((winner) => winner.playerId === id)) state.personalWinners.push({ playerId: id, reason: effect.reason }) }); return `personal victory: ${effect.reason}`
    case 'personalLose': targets.forEach((id) => { if (!state.personalLosers.some((loser) => loser.playerId === id)) state.personalLosers.push({ playerId: id, reason: effect.reason }) }); return `personal loss: ${effect.reason}`
    case 'endGame': {
      const winners = effect.winningTrait ? state.players.filter((player) => hasTrait(state, player.id, effect.winningTrait!)).map((player) => player.id) : effect.winningFaction ? state.players.filter((player) => factionOf(state, player) === effect.winningFaction).map((player) => player.id) : []
      state.winners = [...new Set([...winners, ...state.personalWinners.map((winner) => winner.playerId)])]
      state.winningFactions = effect.winningFaction ? [effect.winningFaction] : []
      state.gameOver = true
      emit(state, 'victory.check', `Game over. ${effect.reason}`, 'public', { data: { winners: state.winners } })
      return `game ended: ${effect.reason}`
    }
    case 'cancelNext': {
      if (effect.event === 'burn') state.facts.cancelBurnCycle = state.cycle + 1
      else if (effect.duration === 'next-night') state.facts.cancelShadowAttackCycle = state.cycle + 1
      else state.facts.cancelNextShadowAttack = true
      return `scheduled ${effect.event} cancellation`
    }
    case 'noop': return effect.message ?? 'no effect'
  }
}

function dispatch(state: GameState, trigger: AbilityDefinition['trigger'], context: Omit<EventContext, 'ownerId'>): EventContext {
  let shared = context as EventContext
  abilityOwners(state, trigger).forEach(({ owner, ability }) => {
    if (['setup.action', 'day.action', 'night.action'].includes(trigger) && !['passive', 'status'].includes(ability.kind)) return
    if (!owner.alive && !(trigger === 'victory.check' || (context.event.targetId === owner.id && ['death.resolved', 'burn.resolved'].includes(trigger)))) return
    const scoped = { ...shared, ownerId: owner.id }
    if (!conditionMatches(state, ability.condition, scoped)) return
    const effects = ability.effects.map((effect) => applyEffect(state, effect, scoped))
    shared = { ...scoped, ownerId: undefined }
    trace(state, `${roleOf(state, owner)?.meta.name ?? 'Role'} · ${ability.name}`, `Reacted to ${trigger}.`, effects, context.event.id)
  })
  return shared
}

function targetCandidates(state: GameState, actor: PlayerState, ability: AbilityDefinition): string[] {
  if (ability.effects.some((effect) => effect.type === 'learnRolesAbsent')) {
    const counts = new Map<string, number>(); state.setup.exactDeck.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
    return state.setup.publicRoles.filter((range) => (counts.get(range.roleId) ?? 0) === 0).map((range) => range.roleId)
  }
  if (ability.effects.some((effect) => effect.type === 'revive')) return (state.facts.nightDeaths as string[] | undefined) ?? []
  if (!ability.target) return []
  const event = { id: '', sequence: 0, type: ability.trigger, cycle: state.cycle, phaseId: state.phaseId, visibility: 'moderator', message: '' } as GameEvent
  let candidates = select(state, ability.target.selector, { event, ownerId: actor.id, chosen: [], prevented: false })
  if (ability.target.selector.kind === 'publicPossibleRoles') candidates = candidates.filter((id) => id !== actor.roleId && !state.rules.roles.find((role) => role.id === id)?.categories.includes('Status'))
  if (ability.target.excludeSelf) candidates = candidates.filter((id) => id !== actor.id)
  if (ability.target.excludeTraits?.length) candidates = candidates.filter((id) => !ability.target!.excludeTraits!.some((trait) => hasTrait(state, id, trait)))
  return candidates
}

function actionKey(state: GameState, actorId: string, abilityId: string): string { return `${state.pipeline}:${state.cycle}:${state.phaseId}:${actorId}:${abilityId}` }

function eligibleActions(state: GameState): Array<{ actor: PlayerState; ability: AbilityDefinition }> {
  const phase = currentPhase(state)
  if (!phase || phase.type !== 'role-actions') return []
  const order = phase.trigger === 'night.action' ? (state.setup.nightOrder ?? state.rules.scenario.nightOrder) : []
  return abilityOwners(state, phase.trigger).filter(({ owner, ability }) => {
    if (ability.kind !== 'active' && ability.kind !== 'shared-faction') return false
    const barrierMatches = !phase.dependencyBarrier || (phase.dependencyBarrier === 'after-attack-resolution' ? ability.dependencyBarrier === 'after-attack-resolution' : ability.dependencyBarrier !== 'after-attack-resolution')
    const canActWhileDead = hasTrait(state, owner.id, TRAIT.spirit)
    const suppressed = activeStatuses(state, owner).some((status) => status.data?.suppressTrigger === phase.trigger && status.appliedCycle === state.cycle)
    const event = { id: '', sequence: 0, type: ability.trigger, cycle: state.cycle, phaseId: state.phaseId, visibility: 'moderator', message: '' } as GameEvent
    const condition = conditionMatches(state, ability.condition, { event, ownerId: owner.id, chosen: [], prevented: false })
    return (owner.alive || canActWhileDead) && !suppressed && condition && barrierMatches && (ability.activeFromNight ?? 0) <= state.cycle && (!phase.abilityIds || phase.abilityIds.includes(ability.id)) && !(ability.once === 'game' && owner.roleState[`ability-used:${ability.id}`])
  }).sort((left, right) => {
    const a = order.indexOf(left.ability.id), b = order.indexOf(right.ability.id)
    return (a < 0 ? 9999 : a) - (b < 0 ? 9999 : b) || (left.ability.order ?? 100) - (right.ability.order ?? 100)
  }).map(({ owner, ability }) => ({ actor: owner, ability }))
}

function activeActions(state: GameState): Array<{ actor: PlayerState; ability: AbilityDefinition }> {
  const deduplicated = new Set<string>()
  return eligibleActions(state).filter(({ ability }) => {
    const groupKey = ability.simultaneous?.id ? `simultaneous:${ability.simultaneous.id}` : ability.kind === 'shared-faction' ? `shared:${ability.id}` : undefined
    if (!groupKey) return true
    if (deduplicated.has(groupKey)) return false
    deduplicated.add(groupKey); return true
  })
}

type ScheduledAction = { actor?: PlayerState; ability: AbilityDefinition; role: RoleDefinition; callOnly: boolean; key: string }

function callKey(state: GameState, ability: AbilityDefinition): string { return `${state.pipeline}:${state.cycle}:${state.phaseId}:call:${ability.simultaneous?.id ?? ability.id}` }

function spokenAction(ability: AbilityDefinition): string {
  const phrase = (ability.callout?.trim() || ability.name.trim()).replace(/[.!?]+$/, '')
  const lower = phrase ? phrase[0].toLowerCase() + phrase.slice(1) : 'perform the role action'
  return /^(ask|check|choose|commune|count|create|decide|give|interrupt|learn|meet|place|protect|raise|read|recruit|review|show|tell|wake)\b/i.test(phrase) ? lower : `perform ${lower}`
}

function readAloudCall(callName: string, ability: AbilityDefinition): string {
  return `${callName}, wake up and ${spokenAction(ability)}.`
}

function moderatorInstructions(ability: AbilityDefinition): string {
  const instructions = ability.instructions?.trim().replace(/^Wake\b[^.!?]*[.!?]\s*/i, '')
  return instructions || `Have them ${spokenAction(ability)}.`
}

function scheduledActions(state: GameState): ScheduledAction[] {
  const phase = currentPhase(state)
  if (!phase || phase.type !== 'role-actions') return []
  const actual = activeActions(state)
  const order = phase.trigger === 'night.action' ? (state.setup.nightOrder ?? state.rules.scenario.nightOrder) : []
  const sort = (items: ScheduledAction[]) => items.sort((left, right) => {
    const a = order.indexOf(left.ability.id), b = order.indexOf(right.ability.id)
    return (a < 0 ? 9999 : a) - (b < 0 ? 9999 : b) || (left.ability.order ?? 100) - (right.ability.order ?? 100) || left.ability.id.localeCompare(right.ability.id)
  })
  if (state.setup.silentNight && phase.trigger !== 'day.action') {
    return sort(actual.flatMap((entry) => {
      const sourceRole = state.rules.roles.find((role) => role.abilities.some((ability) => ability.id === entry.ability.id)) ?? roleOf(state, entry.actor)
      return sourceRole ? [{ ...entry, role: sourceRole, callOnly: false, key: actionKey(state, entry.actor.id, entry.ability.id) }] : []
    }))
  }
  const used = new Set<string>()
  const possibleAbilities = (phase.trigger === 'day.action' ? [] : state.setup.publicRoles).flatMap((range) => {
    const role = state.rules.roles.find((entry) => entry.id === range.roleId)
    return role ? role.abilities.filter((ability) => ability.trigger === phase.trigger && (ability.kind === 'active' || ability.kind === 'shared-faction')).map((ability) => ({ role, ability })) : []
  }).filter(({ ability }) => {
    const barrierMatches = !phase.dependencyBarrier || (phase.dependencyBarrier === 'after-attack-resolution' ? ability.dependencyBarrier === 'after-attack-resolution' : ability.dependencyBarrier !== 'after-attack-resolution')
    return barrierMatches && publiclyEnabled(state, ability.condition) && (ability.activeFromNight ?? 0) <= state.cycle && (!phase.abilityIds || phase.abilityIds.includes(ability.id))
  })
  const possible = new Map<string, { role: RoleDefinition; ability: AbilityDefinition }>()
  possibleAbilities.forEach((entry) => possible.set(entry.ability.simultaneous?.id ?? entry.ability.id, entry))
  const result: ScheduledAction[] = []
  possible.forEach(({ role, ability }, group) => {
    const matches = actual.filter((entry) => (entry.ability.simultaneous?.id ?? entry.ability.id) === group)
    if (matches.length) matches.forEach((entry) => { used.add(`${entry.actor.id}:${entry.ability.id}`); result.push({ ...entry, role: roleOf(state, entry.actor) ?? role, callOnly: false, key: actionKey(state, entry.actor.id, entry.ability.id) }) })
    else result.push({ role, ability, callOnly: true, key: callKey(state, ability) })
  })
  actual.filter((entry) => !used.has(`${entry.actor.id}:${entry.ability.id}`)).forEach((entry) => {
    const sourceRole = state.rules.roles.find((role) => role.abilities.some((ability) => ability.id === entry.ability.id)) ?? roleOf(state, entry.actor)
    if (sourceRole) result.push({ ...entry, role: sourceRole, callOnly: false, key: actionKey(state, entry.actor.id, entry.ability.id) })
  })
  return sort(result)
}

function nextScheduledAction(state: GameState): ScheduledAction | undefined { return scheduledActions(state).find((entry) => !state.completedActions.includes(entry.key)) }

function simultaneousActions(state: GameState, ability: AbilityDefinition): Array<{ actor: PlayerState; ability: AbilityDefinition }> {
  if (!ability.simultaneous) return []
  return eligibleActions(state).filter(({ ability: candidate }) => candidate.simultaneous?.id === ability.simultaneous?.id)
}

function candidateCanVote(state: GameState, id: string): boolean {
  const player = state.players.find((entry) => entry.id === id); if (!player) return false
  return hasTrait(state, id, TRAIT.ballotVoter) || abilityOwners(state, 'vote.beforeTally').some(({ owner, ability }) => owner.id === id && ability.effects.some((effect) => effect.type === 'allowCandidateVote'))
}

function eligibleVoter(state: GameState, player: PlayerState): boolean {
  if (!player.alive && !hasTrait(state, player.id, TRAIT.spirit)) return false
  return !activeStatuses(state, player).some((status) => {
    const blockedBy = String(status.data?.cannotVoteWhileRoleAlive ?? '')
    return blockedBy && state.players.some((candidate) => candidate.alive && candidate.roleId === blockedBy)
  })
}

function expectedVotes(state: GameState, candidates: string[], ballot: boolean): number {
  const kind = ballot ? 'ballot' : 'nomination'
  const base = state.players.filter((player) => eligibleVoter(state, player) && (!ballot || !candidates.includes(player.id) || candidateCanVote(state, player.id))).length
  return base + Number(state.facts[`extraVotes:${kind}:${state.cycle}`] ?? 0)
}

export function availableCommand(state: GameState): PendingCommand {
  if (state.gameOver) {
    const factionNames = state.winningFactions.map((id) => factionDefinition(state, id)?.name ?? id.split('.').at(-1)).filter(Boolean)
    return { type: 'game-over', title: factionNames.length ? `${factionNames.join(' and ')} victory` : 'Game complete', winners: state.winners, factions: state.winningFactions }
  }
  const result = state.pendingAnnouncements.find((announcement) => announcement.visibility === 'moderator')
  if (result) return { type: 'advance', title: result.title ?? (result.category === 'Private result' ? 'Result' : result.category), description: result.message, actionLabel: result.actionLabel }
  const spiritTarget = state.pendingSpiritAssignments.find((id) => {
    const player = state.players.find((item) => item.id === id)
    return player && !player.alive && !hasTrait(state, id, TRAIT.spirit)
  })
  if (spiritTarget) {
    const spiritRoles = state.rules.roles.filter((role) => role.categories.includes('Status') && role.traits.includes(TRAIT.spirit))
    return { type: 'choose', actorId: spiritTarget, abilityId: ASSIGN_SPIRIT_ABILITY, title: `${playerLabel(state, spiritTarget)} died`, instructions: 'Decide whether to give this player a Spirit role. If you assign one, show the player that role before play continues.', candidates: spiritRoles.map((role) => role.id), min: 0, max: 1, allowNone: true }
  }
  const phase = currentPhase(state)
  if (!phase) return { type: 'advance', title: 'Continue', description: 'Continue with the game.', actionLabel: 'Continue' }
  if (phase.type === 'role-actions') {
    const next = nextScheduledAction(state)
    if (!next) {
      if (state.pipeline === 'setup') return { type: 'advance', title: 'First night complete', description: 'Ask everyone to wake up and begin the first day.', actionLabel: 'Begin Day 1' }
      if (phase.dependencyBarrier === 'after-attack-resolution') return { type: 'advance', title: 'The night is complete', description: 'Continue to the morning result.', actionLabel: 'Continue to morning' }
      return { type: 'advance', title: 'All active roles may sleep', description: 'All scheduled actions have been recorded. Continue to the night’s outcome.', actionLabel: 'Continue' }
    }
    if (next.callOnly) {
      const callName = next.ability.simultaneous?.label ?? next.role.meta.name
      return { type: 'advance', title: `Call ${callName}`, description: `Say “${readAloudCall(callName, next.ability)}” Wait briefly, then continue.`, actionLabel: 'Continue night order' }
    }
    const actor = next.actor!
    const candidates = targetCandidates(state, actor, next.ability)
    const absentEffect = next.ability.effects.find((effect) => effect.type === 'learnRolesAbsent')
    const minimum = absentEffect?.type === 'learnRolesAbsent' ? (typeof absentEffect.minimum === 'object' ? Number(constantValue(state, actor.id, absentEffect.minimum.constant)) : absentEffect.minimum) : next.ability.target?.min ?? 0
    const maxFromStatus = actor.statuses.map((status) => Number(status.data?.maxTargets ?? 0)).reduce((a, b) => Math.max(a, b), 0)
    const maximum = absentEffect?.type === 'learnRolesAbsent' ? candidates.length : Math.max(next.ability.target?.max ?? minimum, maxFromStatus)
    const simultaneous = [...new Map(simultaneousActions(state, next.ability).map(({ actor }) => [actor.id, actor])).values()]
    const participants = simultaneous.length ? simultaneous : state.setup.silentNight ? [actor] : []
    const information = next.ability.effects.flatMap((effect) => {
      if (effect.type !== 'learnRoleIdentity') return []
      const definition = state.rules.roles.find((role) => role.id === effect.roleId)
      const matches = state.players.filter((player) => player.roleId === effect.roleId).map((player) => player.name)
      return [{ label: definition?.meta.name ?? effect.roleId.split('.').at(-1) ?? effect.roleId, value: matches.join(', ') || 'Not in play', status: matches.length ? 'in-play' as const : 'not-in-play' as const }]
    })
    const callName = next.ability.simultaneous?.label ?? next.role.meta.name
    const instructions = state.setup.silentNight
      ? `Wake ${formatList(participants.map((participant) => participant.name))}${participants.length > 1 ? ' together' : ''}. ${moderatorInstructions(next.ability)}`
      : `Say “${readAloudCall(callName, next.ability)}” ${moderatorInstructions(next.ability)}`
    return { type: 'choose', actorId: actor.id, abilityId: next.ability.id, title: next.ability.simultaneous ? `${next.ability.simultaneous.label} · ${next.ability.name}` : `${actor.name} · ${next.ability.name}`, instructions, candidates, min: minimum, max: maximum, allowNone: next.ability.target?.allowNone ?? minimum === 0, participantIds: participants.length ? participants.map((participant) => participant.id) : undefined, information: information.length ? information : undefined }
  }
  if (phase.type === 'aggregate-vote') {
    const candidates = phase.vote === 'ballot' ? state.ballot.filter((id) => state.players.find((player) => player.id === id)?.alive) : state.players.filter((player) => player.alive).map((player) => player.id)
    return { type: 'vote', title: phase.label, candidates, expected: expectedVotes(state, candidates, phase.vote === 'ballot'), existing: Object.fromEntries(candidates.map((id) => [id, state.votes?.kind === phase.vote ? state.votes.raw[id] ?? 0 : 0])) }
  }
  if (phase.type === 'pause') return { type: 'advance', title: `Day ${state.cycle} discussion`, description: 'Let the village discuss. Continue when everyone is ready for the first vote.', actionLabel: 'Begin first vote' }
  return { type: 'advance', title: 'Continue', description: 'The rules are ready to apply the next result.', actionLabel: 'Continue' }
}

function advancePhase(state: GameState) {
  const phases = state.pipeline === 'setup' ? state.rules.scenario.setupPipeline : state.rules.scenario.cyclePipeline
  state.phaseIndex += 1
  if (state.phaseIndex >= phases.length) {
    if (state.pipeline === 'setup') { state.pipeline = 'cycle'; state.phaseIndex = 0; state.cycle = 1 }
    else { state.phaseIndex = 0; state.cycle += 1 }
  }
  state.phaseId = (state.pipeline === 'setup' ? state.rules.scenario.setupPipeline : state.rules.scenario.cyclePipeline)[state.phaseIndex]?.id ?? ''
  emit(state, 'phase.changed', `Now: ${currentPhase(state)?.label ?? state.phaseId}.`, 'moderator')
}

function tallyVote(state: GameState, raw: Record<string, number>, kind: VoteState['kind'], acceptInvalid = false) {
  const candidates = kind === 'ballot' ? state.ballot : state.players.filter((player) => player.alive).map((player) => player.id)
  const expected = expectedVotes(state, candidates, kind === 'ballot')
  const entered = Object.values(raw).reduce((sum, value) => sum + Number(value || 0), 0)
  if (entered !== expected && !acceptInvalid) throw new Error(`Entered ${entered} votes; expected ${expected}. Recount or explicitly accept the invalid tally.`)
  if (entered !== expected) state.acceptedInvalidTallies += 1
  const effective: Record<string, number> = {}
  candidates.forEach((targetId) => {
    const event = emit(state, 'vote.beforeTally', `Tallying votes received by ${playerLabel(state, targetId)}.`, 'moderator', { targetId, data: { voteKind: kind, raw: raw[targetId] ?? 0 } })
    const context = dispatch(state, 'vote.beforeTally', { event, chosen: [], prevented: false, voteValue: Number(raw[targetId] ?? 0) })
    effective[targetId] = context.voteValue ?? Number(raw[targetId] ?? 0)
  })
  state.votes = { kind, candidates, raw: Object.fromEntries(candidates.map((id) => [id, Number(raw[id] ?? 0)])), effective, expected, acceptedInvalid: entered !== expected }
  trace(state, `${kind === 'ballot' ? 'Ballot' : 'First vote'} tally`, `${entered}/${expected} raw votes entered${entered !== expected ? ' — accepted invalid' : ''}.`, candidates.map((id) => `${playerLabel(state, id)} ${raw[id] ?? 0} → ${effective[id]}`))
}

function qualifyBallot(state: GameState) {
  const totals = state.votes?.effective ?? {}
  const forced = (Array.isArray(state.facts.forcedBallot) ? state.facts.forcedBallot as string[] : []).filter((id) => state.players.find((player) => player.id === id)?.alive)
  const ranked = Object.entries(totals).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1])
  if (!ranked.length) { state.ballot = [...new Set(forced)]; delete state.facts.forcedBallot; return }
  const top = ranked[0][1], leaders = ranked.filter(([, value]) => value === top).map(([id]) => id)
  let qualified = leaders.length > 1 ? leaders : [...leaders, ...ranked.filter(([, value]) => value === ranked.find(([, candidate]) => candidate < top)?.[1]).map(([id]) => id)]
  qualified = [...new Set([...qualified, ...forced])]
  delete state.facts.forcedBallot
  for (const targetId of [...qualified]) {
    const event = emit(state, 'ballot.qualified', `${playerLabel(state, targetId)} qualified for the Ballot.`, 'public', { targetId })
    const context = dispatch(state, 'ballot.qualified', { event, chosen: [], prevented: false, ballot: qualified })
    const next = context.ballot ?? qualified
    if (state.votes) next.filter((id) => !qualified.includes(id)).forEach((replacementId) => {
      state.votes!.raw[replacementId] = state.votes!.raw[targetId] ?? 0
      state.votes!.effective[replacementId] = state.votes!.effective[targetId] ?? 0
    })
    qualified = next
  }
  state.ballot = [...new Set(qualified)]
  trace(state, 'Ballot qualification', `Ballot: ${state.ballot.map((id) => playerLabel(state, id)).join(', ') || 'none'}.`)
}

function resolveBurn(state: GameState) {
  if (Number(state.facts.cancelBurnCycle) === state.cycle) {
    delete state.facts.cancelBurnCycle
    emit(state, 'burn.resolved', 'No one is burned; a delayed role effect cancels today’s burn.', 'public', { data: { cancelled: true } })
    queueModeratorStep(state, 'The village is undecided.', 'No one burns today. Ask everyone to sleep and continue to the night.', 'Continue to night')
    trace(state, 'Burn resolution', 'The chronological next-day cancellation was consumed.'); return
  }
  const totals = state.votes?.effective ?? {}
  const top = Math.max(0, ...state.ballot.map((id) => totals[id] ?? 0))
  const leaders = state.ballot.filter((id) => (totals[id] ?? 0) === top)
  if (top <= 0 || leaders.length !== 1) {
    emit(state, 'burn.resolved', 'The Ballot is hung. No one is burned.', 'public')
    queueModeratorStep(state, 'The village is undecided.', 'No one burns today. Ask everyone to sleep and continue to the night.', 'Continue to night')
    return
  }
  const targetId = leaders[0]
  const resolving = emit(state, 'burn.resolving', `${playerLabel(state, targetId)} is selected to burn.`, 'moderator', { targetId })
  const context = dispatch(state, 'burn.resolving', { event: resolving, chosen: [], prevented: false })
  if (context.prevented) {
    emit(state, 'burn.resolved', `No one is burned: ${context.preventReason}.`, 'public', { targetId, data: { prevented: true } })
    queueModeratorStep(state, 'The village is undecided.', `${context.preventReason ?? 'A role effect prevented the burn.'} No one burns today.`, 'Continue to night')
    return
  }
  killPlayer(state, targetId, 'Burned', context)
  const burned = emit(state, 'burn.resolved', `${playerLabel(state, targetId)} was burned at the stake.`, 'public', { targetId })
  dispatch(state, 'burn.resolved', { event: burned, chosen: [], prevented: false })
  queueModeratorStep(state, `The village has decided to burn ${playerLabel(state, targetId)}.`, `Tell ${playerLabel(state, targetId)} that they have been burned, then ask everyone to sleep.`, 'Continue to night')
}

function protectionReason(state: GameState, targetId: string, attackType: string): string | undefined {
  const player = state.players.find((entry) => entry.id === targetId)
  return player ? activeStatuses(state, player).find((status) => status.data?.attackType === attackType)?.name : undefined
}

function resolveAttack(state: GameState, attack: GameState['attacks'][number]) {
  if ((state.facts.cancelNextShadowAttack || Number(state.facts.cancelShadowAttackCycle) === state.cycle) && attack.type === 'shadow') {
    delete state.facts.cancelNextShadowAttack; delete state.facts.cancelShadowAttackCycle
    emit(state, 'attack.prevented', `${playerLabel(state, attack.targetId)}’s attack was prevented by the Madman’s effect.`, 'moderator', { targetId: attack.targetId, actorId: attack.actorId, data: { attackType: attack.type, reason: 'Madman cancellation' } }); return
  }
  const attemptTarget = (targetId: string, allowProtection: boolean): { targetId: string; prevented: boolean; reason?: string; redirect?: EventContext['redirect'] } => {
    const attempted = emit(state, 'attack.attempted', `${attack.type} attack attempted on ${playerLabel(state, targetId)}.`, 'moderator', { targetId, actorId: attack.actorId, data: { attackType: attack.type } })
    if (allowProtection) {
      const statusReason = protectionReason(state, targetId, attack.type)
      if (statusReason) return { targetId, prevented: true, reason: statusReason }
    }
    const attemptedContext: EventContext = allowProtection ? dispatch(state, 'attack.attempted', { event: attempted, chosen: [], prevented: false }) : { event: attempted, chosen: [], prevented: false }
    if (attemptedContext.prevented) return { targetId, prevented: true, reason: attemptedContext.preventReason }
    const successful = emit(state, 'attack.successful', `${attack.type} attack would strike ${playerLabel(state, targetId)}.`, 'moderator', { targetId, actorId: attack.actorId, data: { attackType: attack.type } })
    const successContext = dispatch(state, 'attack.successful', { event: successful, chosen: [], prevented: false })
    return { targetId, prevented: successContext.prevented, reason: successContext.preventReason, redirect: successContext.redirect }
  }
  let outcome = attemptTarget(attack.targetId, true)
  if (outcome.prevented) { emit(state, 'attack.prevented', `Attack on ${playerLabel(state, outcome.targetId)} prevented: ${outcome.reason}.`, 'moderator', { targetId: outcome.targetId, data: { attackType: attack.type, reason: outcome.reason } }); return }
  if (outcome.redirect) {
    const from = outcome.targetId; attack.redirectedFrom = from; attack.targetId = outcome.redirect.targetId
    emit(state, 'attack.redirected', `Attack retargeted from ${playerLabel(state, from)} to ${playerLabel(state, attack.targetId)}: ${outcome.redirect.reason}.`, 'moderator', { targetId: attack.targetId, data: { attackType: attack.type, redirectedFrom: from } })
    outcome = attemptTarget(attack.targetId, outcome.redirect.preventable)
    if (outcome.prevented) { emit(state, 'attack.prevented', `Redirected attack on ${playerLabel(state, outcome.targetId)} prevented: ${outcome.reason}.`, 'moderator', { targetId: outcome.targetId, data: { attackType: attack.type, reason: outcome.reason } }); return }
  }
  const resolving = emit(state, 'attack.resolving', `${attack.type} attack resolving on ${playerLabel(state, outcome.targetId)}.`, 'moderator', { targetId: outcome.targetId, actorId: attack.actorId, data: { attackType: attack.type } })
  const context = dispatch(state, 'attack.resolving', { event: resolving, chosen: [], prevented: false })
  if (context.prevented) { emit(state, 'attack.prevented', `Attack on ${playerLabel(state, outcome.targetId)} resolved without death: ${context.preventReason}.`, 'moderator', { targetId: outcome.targetId, data: { attackType: attack.type } }); return }
  killPlayer(state, outcome.targetId, attack.type, context)
}

function resolveAttacks(state: GameState, showModeratorStep = false) {
  const attacks = [...state.attacks]; state.attacks = []
  const eventStart = state.events.length
  attacks.forEach((attack) => resolveAttack(state, attack))
  if (!showModeratorStep) return
  const outcomes = state.events.slice(eventStart)
  const deaths = [...new Set(outcomes.filter((event) => event.type === 'death.resolved').map((event) => event.targetId).filter((id): id is string => Boolean(id)))]
  const details = outcomes.filter((event) => event.type === 'attack.redirected' || event.type === 'attack.prevented').map((event) => event.message)
  if (!attacks.length) queueModeratorStep(state, 'No night attack was made.', 'Continue with any roles that act after attacks.', 'Continue')
  else if (deaths.length) queueModeratorStep(state, `${deaths.map((id) => playerLabel(state, id)).join(' and ')} ${deaths.length === 1 ? 'was' : 'were'} killed during the night.`, ['Wake any roles that act after attacks.', ...details].join(' '), 'Continue')
  else queueModeratorStep(state, 'No one died from the night attacks.', [...details, 'Continue with any roles that act after attacks.'].join(' '), 'Continue')
}

function resolveMorningHiddenState(state: GameState) {
  const queued = [...state.pendingDeaths]
  state.pendingDeaths = []
  queued.forEach((death) => {
    const sourceAlive = death.sourceDeathPlayerId ? state.players.find((player) => player.id === death.sourceDeathPlayerId)?.alive : false
    if (death.sourceDeathPlayerId && sourceAlive) return
    const event = emit(state, 'morning.beforeVictory', `Resolving delayed death for ${playerLabel(state, death.playerId)}.`, 'moderator', { targetId: death.playerId, data: { cause: death.cause } })
    killPlayer(state, death.playerId, death.cause, { event, chosen: [], prevented: false })
  })
}

function evaluateVictory(state: GameState) {
  resolveMorningHiddenState(state)
  const morningEvent = emit(state, 'morning.beforeVictory', 'Resolving hidden morning role effects.', 'moderator')
  dispatch(state, 'morning.beforeVictory', { event: morningEvent, chosen: [], prevented: false })
  if (state.gameOver) return
  const checkEvent = emit(state, 'victory.check', 'Checking role and scenario victory conditions.', 'moderator')
  dispatch(state, 'victory.check', { event: checkEvent, chosen: [], prevented: false })
  if (state.gameOver) return
  let terminal: { faction: string; reason: string; type: string } | undefined
  for (const rule of [...state.rules.scenario.victoryRules].sort((a, b) => a.priority - b.priority)) {
    const alive = state.players.filter((player) => player.alive)
    if (rule.type === 'relationship-final-pair') {
      if (alive.length === 2 && state.relationships.some((rel) => rel.type === rule.relationship && new Set(alive.map((player) => player.id)).has(rel.from) && new Set(alive.map((player) => player.id)).has(rel.to))) terminal = { faction: rule.faction, reason: 'The linked pair are the final two alive.', type: rule.type }
    } else if (rule.type === 'faction-eliminated') {
      if (!alive.some((player) => hasTrait(state, player.id, rule.eliminatedTrait) && !(rule.excludedFactions ?? []).includes(factionOf(state, player)))) terminal = { faction: rule.winningFaction, reason: `No living player has ${rule.eliminatedTrait}.`, type: rule.type }
    } else {
      const counted = alive.filter((player) => hasTrait(state, player.id, rule.countingTrait) && factionOf(state, player) === rule.winningFaction).length
      if (counted > 0 && counted >= alive.length - counted) terminal = { faction: rule.winningFaction, reason: 'The winning faction reached parity.', type: rule.type }
    }
    if (terminal) break
  }
  if (!terminal) return
  const victoryEvent = emit(state, 'victory.check', terminal.reason, 'moderator', { data: { winningFaction: terminal.faction } })
  state.relationships.filter((relationship) => relationship.type.endsWith('.guarded')).forEach((relationship) => dispatch(state, 'victory.check', { event: { ...victoryEvent, targetId: relationship.to }, chosen: [], prevented: false }))
  const alignment = factionDefinition(state, terminal!.faction)?.alignment
  const littleFolkAlive = state.players.filter((player) => player.alive && hasTrait(state, player.id, TRAIT.littleFolk)).length
  const factionWinners = state.players.filter((player) => {
    const playerAlignment = factionDefinition(state, factionOf(state, player))?.alignment
    if (factionOf(state, player) === terminal!.faction || (alignment === 'human' && playerAlignment === 'human')) return true
    if (alignment === 'human' && hasTrait(state, player.id, TRAIT.anyHumanWinner)) return !hasTrait(state, player.id, TRAIT.littleFolk) || littleFolkAlive >= 2
    if (alignment === 'shadow' && hasTrait(state, player.id, TRAIT.anyShadowWinner)) return !hasTrait(state, player.id, TRAIT.littleFolk) || littleFolkAlive >= 2
    if ([FACTION.vampire, FACTION.nosferatu].includes(terminal!.faction as typeof FACTION.vampire | typeof FACTION.nosferatu) && hasTrait(state, player.id, TRAIT.undeadSupport)) return true
    const spiritAlignment = activeStatuses(state, player).find((status) => status.traits?.includes(TRAIT.spirit))?.data?.winningAlignment
    return spiritAlignment === alignment
  }).map((player) => player.id)
  const lovers = terminal.type !== 'parity' ? state.relationships.filter((rel) => rel.type.endsWith('.romeo') && state.players.find((player) => player.id === rel.from)?.alive && state.players.find((player) => player.id === rel.to)?.alive).flatMap((rel) => [rel.from, rel.to]) : []
  const losers = new Set(state.personalLosers.map((loser) => loser.playerId))
  state.winners = [...new Set([...factionWinners, ...lovers, ...state.personalWinners.map((winner) => winner.playerId)])].filter((id) => !losers.has(id))
  state.winningFactions = [...new Set([terminal.faction, ...(lovers.length ? ['wherewolf.base.faction.lovers'] : [])])]
  state.gameOver = true
  emit(state, 'victory.check', `Game over. ${terminal.reason}`, 'public', { data: { winners: state.winners } })
}

function resolveAnnouncements(state: GameState) {
  const eventStart = state.events.length
  const event = emit(state, 'morning.announcements', 'Preparing morning announcements.', 'moderator')
  dispatch(state, 'morning.announcements', { event, chosen: [], prevented: false })
  const nightDeaths = (state.facts.nightDeaths as string[] | undefined) ?? []
  const livingDeaths = nightDeaths.filter((id) => !state.players.find((player) => player.id === id)?.alive)
  emit(state, 'morning.announcements', livingDeaths.length ? `Deaths: ${livingDeaths.map((id) => playerLabel(state, id)).join(', ')}.` : 'There were no deaths in the night.', 'public')
  state.pendingAnnouncements.filter((announcement) => announcement.visibility === 'public').forEach((announcement) => emit(state, 'morning.announcements', announcement.message, 'public', { data: { category: announcement.category } }))
  state.pendingAnnouncements = state.pendingAnnouncements.filter((announcement) => announcement.visibility !== 'public')
  state.facts.nightDeaths = []
  const announcements = state.events.slice(eventStart).filter((entry) => entry.type === 'morning.announcements' && entry.visibility === 'public').map((entry) => entry.message)
  queueModeratorStep(state, 'Make the morning announcements.', announcements.join(' '), 'Begin the next day')
}

function finishCycle(state: GameState) {
  state.players.forEach((player) => { player.statuses = player.statuses.filter((status) => status.duration === 'permanent' || (status.duration === 'next-day' && status.appliedCycle >= state.cycle)) })
  if (Number(state.facts.cancelBurnCycle) <= state.cycle) delete state.facts.cancelBurnCycle
  if (Number(state.facts.cancelShadowAttackCycle) <= state.cycle) delete state.facts.cancelShadowAttackCycle
}

function settleAutomaticPhases(state: GameState) {
  for (let guard = 0; guard < 30; guard += 1) {
    if (state.gameOver || state.pendingAnnouncements.some((announcement) => announcement.visibility === 'moderator')) return
    const phase = currentPhase(state)
    if (!phase) return
    if (phase.type === 'role-actions') {
      const hasAction = Boolean(nextScheduledAction(state))
      if (hasAction) return
      advancePhase(state); continue
    }
    if (phase.type === 'qualification') {
      qualifyBallot(state)
      if (state.ballot.length <= 1) {
        resolveBurn(state)
        const phases = state.rules.scenario.cyclePipeline
        const burnIndex = phases.findIndex((candidate, index) => index > state.phaseIndex && candidate.type === 'burn-resolution')
        if (burnIndex >= 0) state.phaseIndex = burnIndex
        advancePhase(state)
      } else {
        const names = state.ballot.map((id) => playerLabel(state, id))
        queueModeratorStep(state, `On the ballot: ${formatList(names)}.`, 'Tell the village who is on the Ballot. Only these players can receive votes in the second vote.', 'Begin Ballot vote')
        advancePhase(state)
      }
      continue
    }
    if (phase.type === 'burn-resolution') { resolveBurn(state); advancePhase(state); continue }
    if (phase.type === 'attack-resolution') { resolveAttacks(state, true); advancePhase(state); continue }
    if (phase.type === 'victory-check') { evaluateVictory(state); if (!state.gameOver) advancePhase(state); continue }
    if (phase.type === 'announcements') { resolveAnnouncements(state); advancePhase(state); continue }
    if (phase.type === 'cycle-end') { finishCycle(state); advancePhase(state); continue }
    return
  }
  throw new Error('The automatic phase pipeline did not reach a moderator action.')
}

function executeAdvance(state: GameState) {
  const resultIndex = state.pendingAnnouncements.findIndex((announcement) => announcement.visibility === 'moderator')
  if (resultIndex >= 0) {
    const [result] = state.pendingAnnouncements.splice(resultIndex, 1)
    trace(state, result.category === 'Private result' ? 'Result' : result.category, result.message)
    settleAutomaticPhases(state)
    return
  }
  const phase = currentPhase(state)
  if (!phase) { advancePhase(state); settleAutomaticPhases(state); return }
  if (phase.type === 'role-actions') {
    const next = nextScheduledAction(state)
    if (next?.callOnly) {
      if (!state.completedActions.includes(next.key)) state.completedActions.push(next.key)
      trace(state, 'Night order call', `${next.ability.simultaneous?.label ?? next.role.meta.name} was called; no action was recorded.`)
    } else advancePhase(state)
  } else if (phase.type === 'pause') advancePhase(state)
  settleAutomaticPhases(state)
}

function applyOverride(state: GameState, command: Extract<GameCommand, { type: 'override' }>) {
  if (!command.reason.trim()) throw new Error('Overrides require a reason.')
  const operation = command.operation
  if (operation.type === 'life') { const player = state.players.find((item) => item.id === operation.playerId); if (player) player.alive = operation.alive }
  else if (operation.type === 'role') { const player = state.players.find((item) => item.id === operation.playerId); if (player) player.roleId = operation.roleId }
  else if (operation.type === 'faction') { const player = state.players.find((item) => item.id === operation.playerId); if (player) player.factionOverride = operation.faction }
  else if (operation.type === 'status') { const player = state.players.find((item) => item.id === operation.playerId); if (player) player.statuses = operation.remove ? player.statuses.filter((status) => status.id !== operation.status.id) : [...player.statuses.filter((status) => status.id !== operation.status.id), operation.status] }
  else if (operation.type === 'roleState') { const player = state.players.find((item) => item.id === operation.playerId); if (player) player.roleState[operation.key] = operation.value }
  else if (operation.type === 'tally' && state.votes) { state.votes.raw = clone(operation.totals); state.votes.effective = clone(operation.totals) }
  else if (operation.type === 'phase') { state.pipeline = operation.pipeline; state.phaseIndex = operation.phaseIndex; state.phaseId = currentPhase(state)?.id ?? '' }
  else if (operation.type === 'victory') { state.gameOver = true; state.winners = operation.winners; state.winningFactions = operation.factions }
  const event = emit(state, 'override', `Moderator override: ${command.reason}`, 'moderator', { data: { operation } })
  trace(state, 'Moderator override', command.reason, [operation.type], event.id)
}

export function applyCommand(input: GameState, command: GameCommand): ApplyResult {
  const state = clone(input), eventStart = state.events.length, traceStart = state.trace.length
  if (state.gameOver && command.type !== 'override') throw new Error('The game is already complete.')
  if (command.type === 'advance') {
    if (availableCommand(state).type !== 'advance') throw new Error('The current moderator action must be completed first.')
    executeAdvance(state)
  }
  else if (command.type === 'choose') {
    const pending = availableCommand(state)
    if (pending.type !== 'choose' || pending.actorId !== command.actorId || pending.abilityId !== command.abilityId) throw new Error('That action is no longer current.')
    const unique = [...new Set(command.targets)]
    if (unique.length < pending.min || unique.length > pending.max || unique.some((target) => !pending.candidates.includes(target))) throw new Error(`Choose ${pending.min}–${pending.max} legal target(s).`)
    if (command.abilityId === ASSIGN_SPIRIT_ABILITY) {
      const player = state.players.find((item) => item.id === command.actorId)
      const spirit = unique[0] ? state.rules.roles.find((role) => role.id === unique[0] && role.categories.includes('Status') && role.traits.includes(TRAIT.spirit)) : undefined
      state.pendingSpiritAssignments = state.pendingSpiritAssignments.filter((id) => id !== command.actorId)
      if (player && spirit) {
        const metadata = ((state.facts.deathMetadata as Record<string, unknown> | undefined)?.[player.id] ?? {}) as Record<string, unknown>
        const template = spirit.statuses?.[0]
        const templateData = template?.data ?? {}
        const causes = Array.isArray(templateData.shadowDeathCauses) ? templateData.shadowDeathCauses.map(String) : []
        const winningAlignment = templateData.winningAlignment ?? (templateData.winnerFromCorrupt ? metadata.wasCorrupt ? 'shadow' : 'human' : causes.length ? causes.includes(String(metadata.cause)) ? 'shadow' : 'human' : undefined)
        player.statuses.push({ id: 'wherewolf.hidden-motives.status.spirit', name: spirit.meta.name, traits: spirit.traits, abilities: clone(spirit.abilities), duration: 'permanent', appliedCycle: state.cycle, data: { ...templateData, grantedRoleId: spirit.id, ...metadata, winningAlignment } })
        trace(state, 'Spirit assignment', `${player.name} received ${spirit.meta.name}.`, [`Granted status role ${spirit.meta.name}`])
      } else if (player) trace(state, 'Spirit assignment', `${player.name} was not given a Spirit role.`)
      settleAutomaticPhases(state)
    } else {
    const actor = state.players.find((player) => player.id === command.actorId)!
    const ability = roleOf(state, actor)?.abilities.find((entry) => entry.id === command.abilityId)
      ?? actor.statuses.flatMap((status) => status.abilities ?? []).find((entry) => entry.id === command.abilityId)
      ?? state.rules.roles.flatMap((role) => role.abilities).find((entry) => entry.id === command.abilityId)
    if (!ability) throw new Error('Ability definition is unavailable.')
    const groupedActions = ability.simultaneous ? simultaneousActions(state, ability) : []
    const participants = [...new Map(groupedActions.map(({ actor: participant }) => [participant.id, participant])).values()]
    const sourceLabel = ability.simultaneous?.label ?? actor.name
    const event = emit(state, ability.trigger, `${sourceLabel} resolved ${ability.name}.`, 'moderator', { actorId: actor.id, targets: unique, targetId: unique[0], data: { abilityId: ability.id, abilityIds: groupedActions.map(({ ability: groupedAbility }) => groupedAbility.id), participantIds: participants.map((participant) => participant.id) } })
    dispatch(state, ability.trigger, { event, chosen: unique, prevented: false })
    const announcementStart = state.pendingAnnouncements.length
    const actionsToExecute = groupedActions.length ? groupedActions : [{ actor, ability }]
    const effects = actionsToExecute.flatMap(({ actor: owner, ability: groupedAbility }) => {
      const context: EventContext = { event, ownerId: owner.id, participantIds: participants.length ? participants.map((participant) => participant.id) : undefined, chosen: unique, prevented: false }
      return groupedAbility.effects.map((effect) => applyEffect(state, effect, context))
    })
    if (ability.simultaneous) {
      const newAnnouncements = state.pendingAnnouncements.splice(announcementStart)
      const moderatorResults = newAnnouncements.filter((announcement) => announcement.visibility === 'moderator')
      state.pendingAnnouncements.push(...newAnnouncements.filter((announcement) => announcement.visibility !== 'moderator'))
      if (moderatorResults.length && ability.resultPresentation !== 'inline') state.pendingAnnouncements.push({ message: [...new Set(moderatorResults.map((announcement) => announcement.message))].join(' · '), category: 'Private result', visibility: 'moderator' })
    }
    actionsToExecute.forEach(({ actor: participant, ability: completedAbility }) => {
      if (completedAbility.once === 'game') participant.roleState[`ability-used:${completedAbility.id}`] = true
      const key = actionKey(state, participant.id, completedAbility.id)
      if (!state.completedActions.includes(key)) state.completedActions.push(key)
    })
    const resolution = unique.length ? `Targets: ${unique.map((id) => playerLabel(state, id)).join(', ')}.` : participants.length ? `Participants: ${participants.map((participant) => participant.name).join(', ')}.` : 'No target selected.'
    trace(state, `${sourceLabel} · ${ability.name}`, resolution, [...new Set(effects)], event.id)
    settleAutomaticPhases(state)
    }
  } else if (command.type === 'vote') {
    const pending = availableCommand(state); if (pending.type !== 'vote') throw new Error('A vote is not expected now.')
    const phase = currentPhase(state)
    tallyVote(state, command.totals, phase?.type === 'aggregate-vote' && phase.vote === 'ballot' ? 'ballot' : 'nomination', command.acceptInvalid)
    advancePhase(state)
    settleAutomaticPhases(state)
  } else applyOverride(state, command)
  return { state, events: state.events.slice(eventStart), trace: state.trace.slice(traceStart) }
}

export function applyToSession(session: GameSession, command: GameCommand): GameSession {
  const current = session.snapshots[session.cursor].state
  const result = applyCommand(current, command)
  const snapshots: SessionSnapshot[] = [...session.snapshots.slice(0, session.cursor + 1), { state: result.state, command: clone(command) }]
  return { ...session, snapshots, cursor: snapshots.length - 1, updatedAt: new Date().toISOString() }
}

export function undo(session: GameSession): GameSession { return session.cursor > 0 ? { ...session, cursor: session.cursor - 1, updatedAt: new Date().toISOString() } : session }
export function redo(session: GameSession): GameSession { return session.cursor < session.snapshots.length - 1 ? { ...session, cursor: session.cursor + 1, updatedAt: new Date().toISOString() } : session }
export function currentState(session: GameSession): GameState { return session.snapshots[session.cursor].state }

export function runRoleTestBench(role: RoleDefinition, trigger: AbilityDefinition['trigger']): { state: GameState; events: GameEvent[]; trace: TraceEntry[] } {
  const testRoles = [...BASE_ROLES.filter((entry) => entry.id !== role.id), clone(role)]
  const testDeck = [role.id, 'wherewolf.base.role.farmer', 'wherewolf.base.role.alpha-wolf']
  const testCounts = new Map<string, number>(); testDeck.forEach((id) => testCounts.set(id, (testCounts.get(id) ?? 0) + 1))
  const setup: GameSetup = {
    scenarioId: BASE_SCENARIO.id, packIds: [], seed: 7, assignment: 'manual',
    players: [{ id: 'author', name: 'Author role' }, { id: 'target', name: 'Mock target' }, { id: 'wolf', name: 'Mock wolf' }],
    exactDeck: testDeck,
    publicRoles: [...testCounts].map(([roleId, count]) => ({ roleId, min: count, max: count })),
    manualAssignments: { author: role.id, target: 'wherewolf.base.role.farmer', wolf: 'wherewolf.base.role.alpha-wolf' },
    rules: { scenario: clone(BASE_SCENARIO), roles: testRoles },
  }
  const state = createInitialState(setup)
  state.events = []; state.trace = []; state.cycle = 1; state.phaseId = 'test-bench'
  const event = emit(state, trigger, `Fired ${trigger} in the author test bench.`, 'moderator', { actorId: 'wolf', targetId: 'author', data: { attackType: 'shadow', cause: 'shadow', voteKind: 'ballot', raw: 3 } })
  const context: EventContext = { event, ownerId: 'author', chosen: ['target'], prevented: false, voteValue: 3, ballot: ['author', 'target'] }
  role.abilities.filter((ability) => ability.trigger === trigger).forEach((ability) => {
    if (!conditionMatches(state, ability.condition, context)) { trace(state, `${role.meta.name} · ${ability.name}`, 'Condition did not match the mock event.'); return }
    const effects = ability.effects.map((effect) => applyEffect(state, effect, context))
    trace(state, `${role.meta.name} · ${ability.name}`, 'Condition matched.', effects, event.id)
  })
  return { state, events: state.events, trace: state.trace }
}

/** Deterministic lifecycle harness used by provider-free conformance tests. */
export function resolveAttackForTest(input: GameState, targetId: string, attackType = 'shadow'): GameState {
  const state = clone(input)
  state.attacks.push({ id: `test-attack-${state.events.length}`, targetId, type: attackType })
  resolveAttacks(state)
  return state
}

export function executeAbilityForTest(input: GameState, ownerId: string, abilityId: string, chosen: string[] = []): GameState {
  const state = clone(input), owner = state.players.find((player) => player.id === ownerId)
  const ability = owner ? roleOf(state, owner)?.abilities.find((entry) => entry.id === abilityId) : undefined
  if (!owner || !ability) throw new Error('Test ability or owner is unavailable.')
  const event = emit(state, ability.trigger, `Test execution: ${ability.name}.`, 'moderator', { actorId: ownerId, targetId: chosen[0], targets: chosen, data: { abilityId } })
  const context: EventContext = { event, ownerId, chosen, prevented: false }
  ability.effects.forEach((effect) => applyEffect(state, effect, context))
  return state
}

export function killPlayerForTest(input: GameState, targetId: string, cause = 'test'): GameState {
  const state = clone(input)
  const event = emit(state, 'command', `Test death for ${playerLabel(state, targetId)}.`, 'moderator', { targetId, data: { cause } })
  killPlayer(state, targetId, cause, { event, chosen: [], prevented: false })
  return state
}

export function resolveMorningForTest(input: GameState): GameState {
  const state = clone(input); resolveMorningHiddenState(state); return state
}

export function evaluateVictoryForTest(input: GameState): GameState {
  const state = clone(input); evaluateVictory(state); return state
}
