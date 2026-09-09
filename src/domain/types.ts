export type UUID = string
export type ArtifactKind = 'role' | 'pack' | 'scenario'
export type PrimitiveVersion = 'wherewolf.rules/v1'

export interface ArtifactMeta {
  kind: ArtifactKind
  namespace: string
  uuid: UUID
  name: string
  version: string
  schemaVersion: 1
  engineVersion: PrimitiveVersion
  checksum: string
  builtIn?: boolean
  forkedFrom?: { namespace: string; uuid: UUID; version: string }
  unavailableReasons?: string[]
}

export interface PublicText {
  summary: string
  description: string
  moderatorNotes?: string
}

export type ValueType = 'number' | 'boolean' | 'string' | 'choice' | 'roleRef' | 'traitRef'
export interface DefinitionConstant {
  key: string
  label: string
  type: ValueType
  default: number | boolean | string
  choices?: string[]
  scenarioOverridable?: boolean
  min?: number
  max?: number
}

export interface StateVariable {
  key: string
  label: string
  type: ValueType
  initial: number | boolean | string | null
  hidden?: boolean
  editableUntil?: TriggerType
  choices?: string[]
}

export type TriggerType =
  | 'setup.action'
  | 'day.action'
  | 'night.action'
  | 'vote.beforeTally'
  | 'vote.afterTally'
  | 'ballot.qualified'
  | 'burn.resolving'
  | 'burn.resolved'
  | 'attack.attempted'
  | 'attack.successful'
  | 'attack.hit'
  | 'attack.redirected'
  | 'attack.resolving'
  | 'attack.prevented'
  | 'kill.attempted'
  | 'kill.redirected'
  | 'kill.prevented'
  | 'death.resolved'
  | 'morning.beforeVictory'
  | 'morning.announcements'
  | 'victory.check'

export type CompareOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'includes'

export type PublicRequirement =
  | { kind: 'rolePossible'; roleId: string }
  | { kind: 'traitPossible'; trait: string }
  | { kind: 'factionPossible'; faction: string }
  | { kind: 'packSelected'; packId: string }

export interface PublicRequirements {
  match: 'all' | 'any'
  requirements: PublicRequirement[]
}

export type Condition =
  | { op: 'always' }
  | { op: 'all'; conditions: Condition[] }
  | { op: 'any'; conditions: Condition[] }
  | { op: 'not'; condition: Condition }
  | { op: 'actorIsSelf' }
  | { op: 'targetIsSelf' }
  | { op: 'targetIsRelationship'; relationship: string; source?: 'self' | 'eventTarget' }
  | { op: 'hasTrait'; subject: 'self' | 'actor' | 'target'; trait: string }
  | { op: 'hasFaction'; subject: 'self' | 'actor' | 'target'; faction: string }
  | { op: 'hasStatus'; subject: 'self' | 'actor' | 'target'; status: string }
  | { op: 'hasRole'; subject: 'self' | 'actor' | 'target'; roleId: string }
  | { op: 'isAlive'; subject: 'self' | 'actor' | 'target'; value?: boolean }
  | { op: 'ownerInBallot'; value?: boolean }
  | { op: 'targetRoleHasTrait'; trait: string }
  | { op: 'packSelected'; packId: string }
  | { op: 'publicRolePossible'; roleId: string }
  | { op: 'cycle'; compare: CompareOperator; value: number }
  | { op: 'state'; key: string; compare: CompareOperator; value: unknown }
  | { op: 'fact'; key: string; compare: CompareOperator; value: unknown }
  | { op: 'event'; field: string; compare: CompareOperator; value: unknown }
  | { op: 'count'; selector: Selector; compare: CompareOperator; value: number | { constant: string } }

export type Selector =
  | { kind: 'self' }
  | { kind: 'chosen' }
  | { kind: 'eventActor' }
  | { kind: 'eventTarget' }
  | { kind: 'allPlayers'; life?: 'alive' | 'dead' | 'any' }
  | { kind: 'publicPossibleRoles'; trait?: string; activeTrigger?: 'setup.action' | 'day.action' | 'night.action' }
  | { kind: 'trait'; trait: string; life?: 'alive' | 'dead' | 'any' }
  | { kind: 'status'; status: string; life?: 'alive' | 'dead' | 'any'; source?: 'self' }
  | { kind: 'faction'; faction: string; life?: 'alive' | 'dead' | 'any' }
  | { kind: 'notFaction'; faction: string; life?: 'alive' | 'dead' | 'any' }
  | { kind: 'role'; roleId: string; life?: 'alive' | 'dead' | 'any' }
  | { kind: 'relationship'; relationship: string; from?: 'self' | 'eventTarget' }
  | { kind: 'highestRoleOrder'; trait: string; life?: 'alive' | 'dead' | 'any' }

export interface TargetSpec {
  label: string
  min: number
  max: number
  selector: Selector
  excludeSelf?: boolean
  distinct?: boolean
  allowNone?: boolean
  excludeTraits?: string[]
}

export type NumericValue = number | { count: Selector; multiplier?: number; add?: number }

/** Declarative properties of an attack-like effect. Undefined properties use the
 * source effect's legacy-compatible default; the engine never infers them from
 * a role id or a hidden deal. */
export interface AttackModifiers {
  /** May a Guardian-style redirect react to this event? */
  guardable?: boolean
  /** Does a successful hit qualify for healing and moderator notification? */
  healable?: boolean
  /** May an attack-protection effect stop this effect? */
  protectable?: boolean
  /** @deprecated use protectable; retained so older saved artifacts continue to load. */
  witchProtectable?: boolean
  /** Should the target be tapped when a healable hit gets through? */
  notifyTargetOnHit?: boolean
}

export type Effect =
  | { type: 'inspectTrait'; targets: Selector; trait: string; positive: string; negative: string; rememberAs?: string }
  | { type: 'inspectFaction'; targets: Selector; faction: string; positive: string; negative: string }
  | { type: 'inspectStatus'; targets: Selector; status: string; positive?: string; negative: string }
  | { type: 'learnRolesAbsent'; minimum: number | { constant: string } }
  | { type: 'learnRoleIdentity'; roleId: string }
  | { type: 'learnRolePresence'; roleId: string }
  | { type: 'learnFactionMembers'; faction: string }
  | { type: 'learnPlayers'; targets: Selector; label: string }
  | { type: 'learnCount'; targets: Selector; label: string }
  | { type: 'learnPresence'; targets: Selector; label: string }
  | { type: 'conditional'; condition: Condition; effects: Effect[]; otherwise?: Effect[] }
  | { type: 'addStatus'; targets: Selector; status: StatusDefinition; duration?: 'permanent' | 'night' | 'day' | 'next-day' }
  | { type: 'removeStatus'; targets: Selector; status: string }
  | { type: 'preventEvent'; reason: string }
  | { type: 'redirectEvent'; targets: Selector; reason: string; preventable?: boolean }
  | { type: 'queueAttack'; targets: Selector; attackType: string; modifiers?: AttackModifiers; /** @deprecated use modifiers.notifyTargetOnHit */ notifyTargetOnHit?: boolean; /** @deprecated use modifiers.healable */ healable?: boolean }
  | { type: 'kill'; targets: Selector; cause: string; modifiers?: AttackModifiers; timing?: 'now' | 'next-morning'; reportAsNightDeath?: boolean; spiritEligible?: boolean }
  | { type: 'revive'; targets: Selector; limitKey?: string }
  | { type: 'transformRole'; targets: Selector; roleId: string | { chosenRole: true } }
  | { type: 'changeFaction'; targets: Selector; faction: string; winScope?: FactionWinScope }
  | { type: 'linkRelationship'; targets: Selector; relationship: string; reciprocal?: string }
  | { type: 'modifyVotesReceived'; targets: Selector; operation: 'multiply' | 'add' | 'replace'; value: NumericValue; rounding?: 'ceil' | 'floor' | 'round' }
  | { type: 'forceBallot'; targets: Selector }
  | { type: 'grantExtraVotes'; amount: NumericValue; vote: 'nomination' | 'ballot' }
  | { type: 'suppressAction'; targets: Selector; trigger: 'setup.action' | 'day.action' | 'night.action'; duration?: 'night' | 'day' }
  | { type: 'replaceQualifiedCandidate'; guarded: Selector; replacement: Selector }
  | { type: 'allowCandidateVote'; targets: Selector }
  | { type: 'announce'; message: string; visibility: 'moderator' | 'public'; category?: string }
  | { type: 'setState'; key: string; value: unknown }
  | { type: 'incrementState'; key: string; amount: number }
  | { type: 'setStateCount'; key: string; targets: Selector }
  | { type: 'personalWin'; targets: Selector; reason: string }
  | { type: 'personalLose'; targets: Selector; reason: string }
  | { type: 'endGame'; winningFaction?: string; winningTrait?: string; reason: string }
  | { type: 'cancelNext'; event: 'burn' | 'shadow-attack'; duration?: 'next-day' | 'next-night' | 'until-used' }
  | { type: 'noop'; message?: string }

export interface StatusDefinition {
  id: string
  name: string
  traits?: string[]
  data?: Record<string, unknown>
  abilities?: AbilityDefinition[]
}

export interface TraitDefinition {
  id: string
  label: string
  colour: string
  description?: string
  builtIn?: boolean
}

export interface FactionDefinition {
  id: string
  name: string
  colour: string
  alignment?: 'human' | 'shadow' | 'neutral'
}

export type FactionWinScope = 'exact' | 'alignment'
export interface FactionRecommendation {
  faction: string
  when?: PublicRequirements
  priority?: number
  reason?: string
  autoDefault?: boolean
}

export interface TurnDependency {
  anchors:
    | { kind: 'abilityIds'; abilityIds: string[] }
    | { kind: 'roleTrait'; trait: string }
  placement: 'before' | 'after'
  requiresSpokenCall: boolean
}

export interface AbilityDefinition {
  id: string
  name: string
  kind: 'active' | 'passive' | 'shared-faction' | 'status'
  trigger: TriggerType
  order?: number
  once?: 'game' | 'night' | 'day'
  activeFromNight?: number
  target?: TargetSpec
  condition?: Condition
  /** Public setup facts that must match before this action is shown or called. Never checks the dealt roles. */
  publicRequirements?: PublicRequirements
  /** Declarative ordering for actions that react to another role's turn. */
  turnDependency?: TurnDependency
  effects: Effect[]
  instructions?: string
  /** Action phrase read after “wake up and”, for example “check a player for corruption”. */
  callout?: string
  requires?: string[]
  dependencyBarrier?: string
  simultaneous?: { id: string; label: string }
  resultPresentation?: 'after-action' | 'inline'
}

export interface RoleDefinition {
  id: string
  meta: ArtifactMeta
  faction: string
  factionWinScope?: FactionWinScope
  factionRecommendations?: FactionRecommendation[]
  /** Optional moderator-facing team or win-condition label. */
  displayTeam?: string
  categories: string[]
  traits: string[]
  traitDefinitions?: TraitDefinition[]
  multiplicity: { min: number; max: number }
  text: PublicText
  constants: DefinitionConstant[]
  state: StateVariable[]
  requirements: string[]
  abilities: AbilityDefinition[]
  statuses?: StatusDefinition[]
}

export interface PackDefinition {
  id: string
  meta: ArtifactMeta
  description: string
  roleIds: string[]
  roles: RoleDefinition[]
  factions?: FactionDefinition[]
  traitDefinitions?: TraitDefinition[]
}

export type PhaseDefinition =
  | { id: string; type: 'role-actions'; label: string; trigger: 'setup.action' | 'day.action' | 'night.action'; abilityIds?: string[]; dependencyBarrier?: string }
  | { id: string; type: 'pause'; label: string; message: string }
  | { id: string; type: 'aggregate-vote'; label: string; vote: 'nomination' | 'ballot'; eligible: 'alive' | 'alive-except-candidates'; allowCandidateWithTrait?: string }
  | { id: string; type: 'qualification'; label: string; source: 'nomination'; rule: 'highest-and-second' }
  | { id: string; type: 'burn-resolution'; label: string; rule: 'unique-highest' }
  | { id: string; type: 'attack-resolution'; label: string; attackType: string }
  | { id: string; type: 'announcements'; label: string; categories: string[] }
  | { id: string; type: 'victory-check'; label: string }
  | { id: string; type: 'cycle-end'; label: string }

export type VictoryRule =
  | { id: string; type: 'faction-eliminated'; winningFaction: string; eliminatedTrait: string; excludedFactions?: string[]; priority: number }
  | { id: string; type: 'parity'; winningFaction: string; countingTrait: string; priority: number }
  | { id: string; type: 'relationship-final-pair'; relationship: string; faction: string; priority: number }

export interface ScenarioDefinition {
  id: string
  meta: ArtifactMeta
  description: string
  factions: FactionDefinition[]
  capabilities: string[]
  defaultPackIds: string[]
  packs: PackDefinition[]
  setupPipeline: PhaseDefinition[]
  cyclePipeline: PhaseDefinition[]
  victoryRules: VictoryRule[]
  roleOverrides: Record<string, Record<string, unknown>>
  nightOrder: string[]
  dependencyBarriers: Array<{ before: string; after: string; reason: string }>
}

export interface PublicRoleRange { roleId: string; min: number; max: number }
export interface PlayerSetup { id: string; name: string; lockedRoleId?: string }
export interface GameSetup {
  scenarioId: string
  packIds: string[]
  players: PlayerSetup[]
  publicRoles: PublicRoleRange[]
  exactDeck: string[]
  assignment: 'manual' | 'random' | 'locked-random'
  manualAssignments?: Record<string, string>
  hiddenState?: Record<string, Record<string, unknown>>
  /** Prepared information, keyed by role ID and ability ID, independent of seat allocation. */
  absentRoleSelections?: Record<string, Record<string, string[]>>
  nightOrder?: string[]
  silentNight?: boolean
  /** Non-blocking notices produced while loading or migrating a saved setup. */
  setupWarnings?: string[]
  factionPolicies?: Record<string, { faction: string; winScope: FactionWinScope }>
  distributeRolesInApp?: boolean
  seed: number
  rules?: { scenario: ScenarioDefinition; roles: RoleDefinition[] }
}

export interface ValidationIssue { path: string; message: string; severity: 'error' | 'warning' }
export interface ValidationResult { valid: boolean; issues: ValidationIssue[] }

export interface PlayerState {
  id: string
  name: string
  alive: boolean
  initialRoleId: string
  roleId: string
  factionOverride?: string
  factionWinScope?: FactionWinScope
  abilityOverrides?: Record<string, { status: 'available' | 'spent' | 'locked'; unlockCycle?: number }>
  statuses: StatusInstance[]
  roleState: Record<string, unknown>
}

export interface StatusInstance extends StatusDefinition {
  sourcePlayerId?: string
  duration: 'permanent' | 'night' | 'day' | 'next-day'
  appliedCycle: number
}

export interface Relationship { type: string; from: string; to: string }
export interface VoteState {
  kind: 'nomination' | 'ballot'
  candidates: string[]
  raw: Record<string, number>
  effective: Record<string, number>
  expected: number
  acceptedInvalid: boolean
}

export interface GameEvent {
  id: string
  sequence: number
  type: TriggerType | 'phase.changed' | 'override' | 'command' | 'game.started'
  cycle: number
  phaseId: string
  actorId?: string
  targetId?: string
  targets?: string[]
  visibility: 'moderator' | 'public'
  message: string
  data?: Record<string, unknown>
}

export interface TraceEntry {
  id: string
  eventId?: string
  source: string
  message: string
  effects?: string[]
}

export interface RandomState { seed: number; value: number; draws: number }
export interface GameState {
  id: string
  schemaVersion: 1
  scenarioId: string
  setup: GameSetup
  rules: { scenario: ScenarioDefinition; roles: RoleDefinition[] }
  packIds: string[]
  players: PlayerState[]
  relationships: Relationship[]
  pipeline: 'setup' | 'cycle'
  phaseIndex: number
  phaseId: string
  cycle: number
  random: RandomState
  votes?: VoteState
  ballot: string[]
  attacks: Array<{ id: string; actorId?: string; targetId: string; type: string; prevented?: boolean; redirectedFrom?: string; modifiers?: AttackModifiers; /** @deprecated legacy saved attack field */ notifyTargetOnHit?: boolean; /** @deprecated legacy saved attack field */ healable?: boolean }>
  pendingDeaths: Array<{ playerId: string; cause: string; timing: 'now' | 'next-morning'; sourceDeathPlayerId?: string; reportAsNightDeath?: boolean; spiritEligible?: boolean }>
  pendingAnnouncements: Array<{ message: string; category: string; visibility: 'moderator' | 'public'; title?: string; actionLabel?: string; kind?: 'tap' | 'step'; targetIds?: string[] }>
  pendingSpiritAssignments: string[]
  personalWinners: Array<{ playerId: string; reason: string }>
  personalLosers: Array<{ playerId: string; reason: string }>
  winningFactions: string[]
  winners: string[]
  gameOver: boolean
  events: GameEvent[]
  trace: TraceEntry[]
  completedActions: string[]
  acceptedInvalidTallies: number
  facts: Record<string, unknown>
}

export type GameCommand =
  | { type: 'advance' }
  | { type: 'choose'; actorId: string; abilityId: string; targets: string[] }
  | { type: 'vote'; totals: Record<string, number>; acceptInvalid?: boolean }
  | { type: 'override'; reason: string; operation: OverrideOperation }

export type OverrideOperation =
  | { type: 'life'; playerId: string; alive: boolean }
  | { type: 'role'; playerId: string; roleId: string }
  | { type: 'faction'; playerId: string; faction: string; winScope?: FactionWinScope }
  | { type: 'ability'; playerId: string; abilityId: string; status: 'available' | 'spent' | 'locked'; unlockCycle?: number }
  | { type: 'status'; playerId: string; status: StatusInstance; remove?: boolean }
  | { type: 'roleState'; playerId: string; key: string; value: unknown }
  | { type: 'tally'; totals: Record<string, number> }
  | { type: 'phase'; pipeline: 'setup' | 'cycle'; phaseIndex: number }
  | { type: 'victory'; winners: string[]; factions: string[]; reason: string }

export type PendingCommand =
  | { type: 'choose'; actorId: string; abilityId: string; title: string; instructions: string; candidates: string[]; min: number; max: number; allowNone: boolean; participantIds?: string[]; information?: Array<{ label: string; value: string; status: 'in-play' | 'not-in-play' }> }
  | { type: 'vote'; title: string; candidates: string[]; expected: number; existing: Record<string, number> }
  | { type: 'advance'; title: string; description: string; actionLabel?: string; kind?: 'tap' | 'step'; targetIds?: string[] }
  | { type: 'game-over'; title: string; winners: string[]; factions: string[] }

export interface SessionSnapshot { state: GameState; command?: GameCommand }
export interface RoleDeal {
  cards: Array<{ id: string; roleId: string; reservedFor?: string }>
  picks: Array<{ playerId: string; cardId: string; roleId: string }>
  selectedCardId?: string
  finished: boolean
}
export interface GameSession {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  setup: GameSetup
  snapshots: SessionSnapshot[]
  cursor: number
  roleDeal?: RoleDeal
}

export interface ApplyResult { state: GameState; events: GameEvent[]; trace: TraceEntry[] }
export interface EffectiveProperty { id: string; label: string; kind: 'alignment' | 'faction' | 'trait' | 'status' | 'transformation' | 'state'; colour?: string }
export interface ImportPreview {
  artifact: RoleDefinition | PackDefinition | ScenarioDefinition
  status: 'new' | 'identical' | 'fork' | 'unsupported'
  issues: string[]
}
