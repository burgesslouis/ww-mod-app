import { withChecksum } from '../domain/artifacts'
import { FACTION, HIDDEN_PACK_ID, PACK_ID, ROLE, SCENARIO_ID, TRAIT } from '../domain/ids'
import type { AbilityDefinition, PackDefinition, RoleDefinition, ScenarioDefinition, StateVariable, TraitDefinition } from '../domain/types'

const UUIDS: Record<string, string> = {
  [ROLE.alphaWolf]: '00000000-0000-4000-8000-000000000001', [ROLE.packWolf]: '00000000-0000-4000-8000-000000000002',
  [ROLE.wolfPup]: '00000000-0000-4000-8000-000000000003', [ROLE.defector]: '00000000-0000-4000-8000-000000000004',
  [ROLE.clairvoyant]: '00000000-0000-4000-8000-000000000005', [ROLE.wizard]: '00000000-0000-4000-8000-000000000006',
  [ROLE.medium]: '00000000-0000-4000-8000-000000000007', [ROLE.witch]: '00000000-0000-4000-8000-000000000008',
  [ROLE.healer]: '00000000-0000-4000-8000-000000000009', [ROLE.farmer]: '00000000-0000-4000-8000-000000000010',
  [ROLE.monk]: '00000000-0000-4000-8000-000000000011', [ROLE.priest]: '00000000-0000-4000-8000-000000000012',
  [ROLE.sinner]: '00000000-0000-4000-8000-000000000013', [ROLE.seducer]: '00000000-0000-4000-8000-000000000014',
  [ROLE.innkeeper]: '00000000-0000-4000-8000-000000000015', [ROLE.bard]: '00000000-0000-4000-8000-000000000016',
  [ROLE.hermit]: '00000000-0000-4000-8000-000000000017', [ROLE.jester]: '00000000-0000-4000-8000-000000000018',
  [ROLE.madman]: '00000000-0000-4000-8000-000000000019', [ROLE.juliet]: '00000000-0000-4000-8000-000000000020',
  [ROLE.guardian]: '00000000-0000-4000-8000-000000000021', [ROLE.romeo]: '00000000-0000-4000-8000-000000000022',
}

export const BASE_TRAITS: TraitDefinition[] = [
  { id: TRAIT.corrupt, label: 'Corrupt', colour: '#c65f55', description: 'Appears Corrupt to roles that inspect corruption.', builtIn: true },
  { id: TRAIT.mystic, label: 'Mystic', colour: '#9078cc', description: 'Appears Mystic to roles that inspect mysticism.', builtIn: true },
  { id: TRAIT.werewolf, label: 'Werewolf', colour: '#a94f4b', description: 'Counts as a Werewolf for Pack rules and victory.', builtIn: true },
  { id: TRAIT.wolfAttacker, label: 'Wolf attacker', colour: '#ca754e', description: 'Can perform the Wolf Pack bite.', builtIn: true },
  { id: TRAIT.newsgiver, label: 'Newsgiver', colour: '#c9a34d', description: 'Can contribute a morning news announcement.', builtIn: true },
  { id: TRAIT.seducer, label: 'Seducer', colour: '#c96f9f', description: 'Receives the Seducer voting rules.', builtIn: true },
  { id: TRAIT.guardian, label: 'Guardian', colour: '#5898bd', description: 'Uses Guardian substitution and protection rules.', builtIn: true },
  { id: TRAIT.jester, label: 'Jester', colour: '#d28b49', description: 'Uses the Jester burn victory rules.', builtIn: true },
  { id: TRAIT.madman, label: 'Madman', colour: '#9d70b7', description: 'Uses the Madman attack victory rules.', builtIn: true },
  { id: TRAIT.wolfPup, label: 'Wolf Pup', colour: '#b96a58', description: 'Can strengthen or grow into the Pack.', builtIn: true },
  { id: TRAIT.defector, label: 'Defector', colour: '#8f765f', description: 'Can awaken to the Wolf Pack.', builtIn: true },
  { id: TRAIT.farmer, label: 'Farmer', colour: '#78a257', description: 'Uses a Farmer latent variant.', builtIn: true },
  { id: TRAIT.healer, label: 'Healer', colour: '#58a486', description: 'Can perform revival actions.', builtIn: true },
  { id: TRAIT.shadow, label: 'Shadow', colour: '#5f566f', description: 'Must be eliminated before a Human victory can finish.', builtIn: true },
  { id: 'wherewolf.base.trait.lover', label: 'Lover', colour: '#c86c8c', description: 'Shares the Lovers relationship and victory.', builtIn: true },
]

function role(id: string, name: string, faction: string, categories: string[], traits: string[], summary: string, description: string, abilities: AbilityDefinition[] = [], state: StateVariable[] = [], requirements: string[] = [], maximumCopies = 1): RoleDefinition {
  return withChecksum({
    id,
    meta: { kind: 'role', namespace: 'wherewolf.base', uuid: UUIDS[id], name, version: '1.0.0', schemaVersion: 1, engineVersion: 'wherewolf.rules/v1', checksum: '', builtIn: true },
    faction, categories, traits, traitDefinitions: traits.map((traitId) => BASE_TRAITS.find((trait) => trait.id === traitId) ?? { id: traitId, label: traitId.split('.').at(-1) ?? traitId, colour: '#8c857b' }), multiplicity: { min: 0, max: maximumCopies },
    text: { summary, description }, constants: [], state, requirements, abilities,
  })
}

const wolfIntro: AbilityDefinition = {
  id: 'wherewolf.base.ability.wolf-intro', name: 'Meet the Pack', kind: 'active', trigger: 'setup.action', order: 90,
  simultaneous: { id: 'wherewolf.base.group.wolf-introduction', label: 'Wolf Pack' },
  resultPresentation: 'inline',
  condition: { op: 'hasTrait', subject: 'self', trait: TRAIT.werewolf },
  effects: [
    { type: 'learnFactionMembers', faction: FACTION.wolves },
    { type: 'learnRoleIdentity', roleId: ROLE.defector },
  ], instructions: 'Wake all living Werewolves together. Show them the other living Werewolves and the Defector.', requires: ['private-information'], dependencyBarrier: 'setup-information',
}

const wolfBite: AbilityDefinition = {
  id: 'wherewolf.base.ability.wolf-bite', name: 'Wolf Pack bite', kind: 'shared-faction', trigger: 'night.action', order: 50,
  activeFromNight: 1,
  target: { label: 'Bite target', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, allowNone: true },
  condition: { op: 'hasTrait', subject: 'self', trait: TRAIT.wolfAttacker },
  effects: [{ type: 'queueAttack', targets: { kind: 'chosen' }, attackType: 'shadow' }],
  instructions: 'Choose any living player to bite, including a member of the Wolf Pack, or choose nobody.', requires: ['shadow-attacks'], dependencyBarrier: 'after-protection',
}

const roles: RoleDefinition[] = [
  role(ROLE.alphaWolf, 'Alpha Wolf', FACTION.wolves, ['Wolf Pack', 'Attack'], [TRAIT.werewolf, TRAIT.wolfAttacker, TRAIT.corrupt, TRAIT.shadow],
    'Leads the Wolf Pack and orders the bite.', 'On setup, learn the Pack and Defector. From the first night, choose the Pack’s bite target.', [wolfIntro, { ...wolfBite, order: 50 }]),
  role(ROLE.packWolf, 'Pack Wolf', FACTION.wolves, ['Wolf Pack', 'Attack'], [TRAIT.werewolf, TRAIT.wolfAttacker, TRAIT.corrupt, TRAIT.shadow],
    'Supports the strongest living Werewolf.', 'On setup, learn the Pack and Defector. If no stronger attacker remains, choose the Pack’s bite target.', [wolfIntro, { ...wolfBite, order: 51 }]),
  role(ROLE.wolfPup, 'Wolf Pup', FACTION.wolves, ['Wolf Pack', 'Transformation'], [TRAIT.werewolf, TRAIT.wolfPup, TRAIT.corrupt, TRAIT.shadow],
    'Strengthens the Pack when burned and grows if left alone.', 'Cannot bite. If burned, the Pack receives two attacks on the next night. If the only surviving Werewolf, skips one attack and becomes a Pack Wolf.', [
      wolfIntro,
      { id: `${ROLE.wolfPup}.burned`, name: 'Vengeful litter', kind: 'passive', trigger: 'burn.resolved', condition: { op: 'targetIsSelf' }, effects: [{ type: 'addStatus', targets: { kind: 'faction', faction: FACTION.wolves, life: 'alive' }, status: { id: 'wherewolf.base.status.double-bite', name: 'Double bite', data: { maxTargets: 2 } }, duration: 'night' }] },
      { id: `${ROLE.wolfPup}.grow`, name: 'Grow into the Pack', kind: 'passive', trigger: 'morning.beforeVictory', condition: { op: 'count', selector: { kind: 'trait', trait: TRAIT.werewolf, life: 'alive' }, compare: 'eq', value: 1 }, effects: [{ type: 'transformRole', targets: { kind: 'self' }, roleId: ROLE.packWolf }] },
    ]),
  role(ROLE.defector, 'Defector', FACTION.wolves, ['Wolf Pack', 'Survivor'], [TRAIT.defector],
    'A human Wolf ally who wakes if bitten.', 'The Wolves learn the Defector on setup. A shadow attack does not kill the Defector; instead they learn the living Wolf Pack.', [
      { id: `${ROLE.defector}.wake`, name: 'Wake to the Pack', kind: 'passive', trigger: 'attack.resolving', condition: { op: 'all', conditions: [{ op: 'targetIsSelf' }, { op: 'event', field: 'attackType', compare: 'eq', value: 'shadow' }] }, effects: [{ type: 'preventEvent', reason: 'The Defector survives the Pack attack.' }, { type: 'learnFactionMembers', faction: FACTION.wolves }] },
    ], [], ['shadow-attacks', 'private-information']),
  role(ROLE.clairvoyant, 'Clairvoyant', FACTION.village, ['Information', 'Night'], [TRAIT.mystic],
    'Checks whether one player is Corrupt.', 'Each night, select one living player and privately learn whether they have the Corrupt trait.', [
      { id: `${ROLE.clairvoyant}.check`, name: 'Read corruption', kind: 'active', trigger: 'night.action', order: 10, target: { label: 'Player to check', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' } }, effects: [{ type: 'inspectTrait', targets: { kind: 'chosen' }, trait: TRAIT.corrupt, positive: 'CORRUPT', negative: 'NOT CORRUPT', rememberAs: 'last-clairvoyant-corrupt' }], instructions: 'Choose one living player to test for corruption.', requires: ['private-information'], dependencyBarrier: 'information' },
      { id: `${ROLE.clairvoyant}.setup-check`, name: 'First-night corruption read', kind: 'active', trigger: 'setup.action', order: 10, target: { label: 'Player to check', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' } }, effects: [{ type: 'inspectTrait', targets: { kind: 'chosen' }, trait: TRAIT.corrupt, positive: 'CORRUPT', negative: 'NOT CORRUPT', rememberAs: 'last-clairvoyant-corrupt' }], instructions: 'Choose one living player to test for corruption on the first night.', requires: ['private-information'], dependencyBarrier: 'information' },
    ]),
  role(ROLE.wizard, 'Wizard', FACTION.village, ['Information', 'Night'], [TRAIT.mystic],
    'Checks whether one player is Mystic.', 'Each night, select one living player and privately learn whether they have the Mystic trait.', [
      { id: `${ROLE.wizard}.check`, name: 'Read mysticism', kind: 'active', trigger: 'night.action', order: 20, target: { label: 'Player to test', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' } }, effects: [{ type: 'inspectTrait', targets: { kind: 'chosen' }, trait: TRAIT.mystic, positive: 'MYSTIC', negative: 'NOT MYSTIC' }], instructions: 'Choose one living player to test for mysticism.', requires: ['private-information'], dependencyBarrier: 'information' },
      { id: `${ROLE.wizard}.setup-check`, name: 'First-night mysticism read', kind: 'active', trigger: 'setup.action', order: 20, target: { label: 'Player to test', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' } }, effects: [{ type: 'inspectTrait', targets: { kind: 'chosen' }, trait: TRAIT.mystic, positive: 'MYSTIC', negative: 'NOT MYSTIC' }, { type: 'conditional', condition: { op: 'packSelected', packId: HIDDEN_PACK_ID }, effects: [{ type: 'learnPresence', targets: { kind: 'faction', faction: FACTION.inquisition, life: 'any' }, label: 'Inquisition' }] }], instructions: 'Choose one living player to test for mysticism on the first night. If Hidden Motives is attached, also tell the Wizard whether Inquisition is in play.', requires: ['private-information'], dependencyBarrier: 'information' },
    ]),
  role(ROLE.medium, 'Medium', FACTION.village, ['Information', 'Night'], [TRAIT.mystic],
    'Checks a dead player for corruption.', 'From the first repeating night, select one dead player and learn whether they were Corrupt.', [
      { id: `${ROLE.medium}.check`, name: 'Commune with the dead', kind: 'active', trigger: 'night.action', order: 30, activeFromNight: 1, target: { label: 'Dead player', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'dead' }, allowNone: true }, effects: [{ type: 'inspectTrait', targets: { kind: 'chosen' }, trait: TRAIT.corrupt, positive: 'CORRUPT', negative: 'NOT CORRUPT' }], instructions: 'Choose a dead player to test for corruption, or continue if no dead player can be checked.', requires: ['private-information'], dependencyBarrier: 'information' },
      { id: `${ROLE.medium}.spirit-check`, name: 'Check for a Spirit', kind: 'active', trigger: 'night.action', order: 31, activeFromNight: 2, condition: { op: 'packSelected', packId: HIDDEN_PACK_ID }, target: { label: 'Dead player', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'dead' }, allowNone: true }, effects: [{ type: 'conditional', condition: { op: 'hasStatus', subject: 'target', status: 'wherewolf.hidden-motives.status.known-spirit' }, effects: [{ type: 'removeStatus', targets: { kind: 'chosen' }, status: 'wherewolf.hidden-motives.status.spirit' }, { type: 'removeStatus', targets: { kind: 'chosen' }, status: 'wherewolf.hidden-motives.status.known-spirit' }, { type: 'announce', message: 'The known Spirit is removed from play.', visibility: 'moderator', category: 'Private result' }], otherwise: [{ type: 'inspectStatus', targets: { kind: 'chosen' }, status: 'wherewolf.hidden-motives.status.spirit', negative: 'NOT A SPIRIT' }, { type: 'conditional', condition: { op: 'hasStatus', subject: 'target', status: 'wherewolf.hidden-motives.status.spirit' }, effects: [{ type: 'addStatus', targets: { kind: 'chosen' }, status: { id: 'wherewolf.hidden-motives.status.known-spirit', name: 'Known Spirit' }, duration: 'permanent' }] }] }], instructions: 'Choose a dead player. Reveal whether they are a Spirit and which Spirit role they have. Choosing a Spirit already identified by the Medium removes that Spirit from play.', requires: ['private-information'], dependencyBarrier: 'information' },
    ]),
  role(ROLE.witch, 'Witch', FACTION.village, ['Protection', 'Night'], [TRAIT.mystic],
    'Protects another player from shadow attacks.', 'Each repeating night, choose one other living player. Shadow attacks attempted against them that night are prevented before redirection can trigger.', [
      { id: `${ROLE.witch}.protect`, name: 'Protect from shadow attack', kind: 'active', trigger: 'night.action', order: 40, activeFromNight: 1, target: { label: 'Player to protect', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true }, effects: [{ type: 'addStatus', targets: { kind: 'chosen' }, status: { id: 'wherewolf.base.status.shadow-protection', name: 'Protected from shadow attacks', traits: ['wherewolf.core.status.attack-protection'], data: { attackType: 'shadow' } }, duration: 'night' }], instructions: 'Choose one other living player to protect tonight.', requires: ['shadow-attacks'], dependencyBarrier: 'protection' },
    ]),
  role(ROLE.healer, 'Healer', FACTION.village, ['Revival', 'Night'], [TRAIT.mystic, TRAIT.healer],
    'Once per game, revives a player who died that night.', 'After attacks resolve, privately see the night’s deaths. Once per game, revive one other player who died that night.', [
      { id: `${ROLE.healer}.revive`, name: 'Revive', kind: 'active', trigger: 'night.action', order: 70, activeFromNight: 1, once: 'game', target: { label: 'Player to revive', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'dead' }, excludeSelf: true, allowNone: true }, effects: [{ type: 'revive', targets: { kind: 'chosen' }, limitKey: 'revive-used' }], instructions: 'Choose a player who died tonight to revive, or save this ability.', requires: ['revival'], dependencyBarrier: 'after-attack-resolution' },
    ]),
  role(ROLE.farmer, 'Farmer', FACTION.village, ['Latent', 'Transformation'], [TRAIT.farmer],
    'Has a moderator-selected hidden latent state.', 'The moderator secretly chooses ordinary, Wolf Descendent, or Hero Farmer. It may be changed and logged until a shadow attack resolves it.', [
      { id: `${ROLE.farmer}.descendent`, name: 'Wolf Descendent', kind: 'passive', trigger: 'attack.resolving', condition: { op: 'all', conditions: [{ op: 'targetIsSelf' }, { op: 'state', key: 'latent', compare: 'eq', value: 'wolf_descendant' }] }, effects: [{ type: 'preventEvent', reason: 'Wolf Descendent joins the Pack.' }, { type: 'transformRole', targets: { kind: 'self' }, roleId: ROLE.packWolf }] },
      { id: `${ROLE.farmer}.hero`, name: 'Hero Farmer', kind: 'passive', trigger: 'attack.resolving', condition: { op: 'all', conditions: [{ op: 'targetIsSelf' }, { op: 'state', key: 'latent', compare: 'eq', value: 'hero_farmer' }] }, effects: [{ type: 'kill', targets: { kind: 'highestRoleOrder', trait: TRAIT.werewolf, life: 'alive' }, cause: 'Hero Farmer' }] },
    ], [{ key: 'latent', label: 'Latent state', type: 'choice', initial: 'ordinary', hidden: true, editableUntil: 'attack.resolving', choices: ['ordinary', 'wolf_descendant', 'hero_farmer'] }], ['hidden-setup-state'], 3),
  withRoleConstants(role(ROLE.monk, 'Monk', FACTION.village, ['Information', 'Setup'], [],
    'Learns at least two publicly possible roles that are absent.', 'On setup, the moderator chooses roles from the public possible list whose actual count is zero. The app validates the minimum.', [
      { id: `${ROLE.monk}.reveal`, name: 'Absent roles', kind: 'active', trigger: 'setup.action', order: 30, effects: [{ type: 'learnRolesAbsent', minimum: { constant: 'minimumAbsentRoles' } }], instructions: 'Choose absent roles to reveal privately to the Monk.', requires: ['public-role-ranges', 'private-information'], dependencyBarrier: 'setup-information' },
    ]), [{ key: 'minimumAbsentRoles', label: 'Minimum absent roles', type: 'number', default: 2, min: 1, max: 12, scenarioOverridable: true }]),
  role(ROLE.priest, 'Priest', FACTION.village, ['Information', 'Setup'], [],
    'Locates the Sinner and learns whether the Seducer is present.', 'On setup, privately learn the Sinner’s identity and whether a Seducer is in the game.', [
      { id: `${ROLE.priest}.church`, name: 'Church knowledge', kind: 'active', trigger: 'setup.action', order: 40, effects: [{ type: 'learnRoleIdentity', roleId: ROLE.sinner }, { type: 'learnRolePresence', roleId: ROLE.seducer }], instructions: 'Reveal the Sinner identity and Seducer presence privately.', requires: ['private-information'], dependencyBarrier: 'setup-information' },
    ]),
  role(ROLE.sinner, 'Sinner', FACTION.village, ['Passive'], [TRAIT.corrupt],
    'A Village player who appears Corrupt.', 'Has no active power. Corruption checks return Corrupt, and the Priest can identify the Sinner.'),
  role(ROLE.seducer, 'Seducer', FACTION.village, ['Voting', 'Passive'], [TRAIT.corrupt, TRAIT.seducer],
    'Receives half votes, rounded up, and may vote on the Ballot.', 'In both voting phases, votes received are halved and rounded up. A Seducer may still vote while a Ballot candidate.', [
      { id: `${ROLE.seducer}.halve`, name: 'Alluring defence', kind: 'passive', trigger: 'vote.beforeTally', condition: { op: 'targetIsSelf' }, effects: [{ type: 'modifyVotesReceived', targets: { kind: 'self' }, operation: 'multiply', value: 0.5, rounding: 'ceil' }] },
      { id: `${ROLE.seducer}.candidate-vote`, name: 'Vote while nominated', kind: 'passive', trigger: 'vote.beforeTally', effects: [{ type: 'allowCandidateVote', targets: { kind: 'self' } }] },
    ], [], ['aggregate-voting']),
  role(ROLE.innkeeper, 'Innkeeper', FACTION.village, ['Announcement', 'Newsgiver'], [TRAIT.newsgiver],
    'Announces a Corrupt Clairvoyant result.', 'While alive, the morning announcements say if the Clairvoyant found a Corrupt player the previous night.', [
      { id: `${ROLE.innkeeper}.news`, name: 'Corrupt news', kind: 'passive', trigger: 'morning.announcements', condition: { op: 'fact', key: 'last-clairvoyant-corrupt', compare: 'eq', value: true }, effects: [{ type: 'announce', visibility: 'public', category: 'Newsgiver', message: 'Innkeeper: A Corrupt player was found by the Clairvoyant.' }] },
    ], [], ['announcements']),
  role(ROLE.bard, 'Bard', FACTION.village, ['Announcement', 'Newsgiver'], [TRAIT.newsgiver],
    'Announces a Non-Corrupt Clairvoyant result.', 'While alive, the morning announcements say if the Clairvoyant found a Non-Corrupt player the previous night.', [
      { id: `${ROLE.bard}.news`, name: 'Non-Corrupt news', kind: 'passive', trigger: 'morning.announcements', condition: { op: 'fact', key: 'last-clairvoyant-corrupt', compare: 'eq', value: false }, effects: [{ type: 'announce', visibility: 'public', category: 'Newsgiver', message: 'Bard: A Non-Corrupt player was found by the Clairvoyant.' }] },
    ], [], ['announcements']),
  role(ROLE.hermit, 'Hermit', FACTION.village, ['Protection', 'Passive'], [],
    'Cannot be killed by shadow attacks.', 'When a shadow attack is attempted against the Hermit, it is prevented.', [
      { id: `${ROLE.hermit}.immune`, name: 'Hermit immunity', kind: 'passive', trigger: 'attack.attempted', condition: { op: 'all', conditions: [{ op: 'targetIsSelf' }, { op: 'event', field: 'attackType', compare: 'eq', value: 'shadow' }] }, effects: [{ type: 'preventEvent', reason: 'Hermit immunity' }] },
    ], [], ['shadow-attacks']),
  role(ROLE.jester, 'Jester', FACTION.neutral, ['Alternate Victory', 'Voting'], [TRAIT.jester],
    'Wins when burned and cancels the next chronological day’s burn.', 'When burned, wins personally. The burn on the following chronological day is cancelled, expiring at that day’s end even if no burn is attempted.', [
      { id: `${ROLE.jester}.burned`, name: 'Final joke', kind: 'passive', trigger: 'burn.resolved', condition: { op: 'targetIsSelf' }, effects: [{ type: 'personalWin', targets: { kind: 'self' }, reason: 'Burned as the Jester.' }, { type: 'cancelNext', event: 'burn', duration: 'next-day' }] },
    ], [], ['aggregate-voting', 'personal-victory']),
  role(ROLE.madman, 'Madman', FACTION.neutral, ['Alternate Victory', 'Attack'], [TRAIT.madman],
    'Wins when killed by Wolves and cancels their first next attack.', 'When a shadow attack kills the Madman, wins personally and prevents the first shadow attack on the following night.', [
      { id: `${ROLE.madman}.killed`, name: 'Mad victory', kind: 'passive', trigger: 'death.resolved', condition: { op: 'all', conditions: [{ op: 'targetIsSelf' }, { op: 'event', field: 'cause', compare: 'eq', value: 'shadow' }] }, effects: [{ type: 'personalWin', targets: { kind: 'self' }, reason: 'Killed by Wolves.' }, { type: 'cancelNext', event: 'shadow-attack', duration: 'next-night' }] },
    ], [], ['shadow-attacks', 'personal-victory']),
  role(ROLE.juliet, 'Juliet', FACTION.neutral, ['Relationship', 'Alternate Victory'], [],
    'Chooses Romeo and shares a Lovers victory.', 'On setup, choose Romeo. Romeo keeps their original role and ability, becomes a Lover, and is protected from shadow attacks while Juliet lives.', [
      { id: `${ROLE.juliet}.choose`, name: 'Choose Romeo', kind: 'active', trigger: 'setup.action', order: 60, target: { label: 'Romeo', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true }, effects: [{ type: 'linkRelationship', targets: { kind: 'chosen' }, relationship: 'wherewolf.base.relationship.romeo', reciprocal: 'wherewolf.base.relationship.juliet' }, { type: 'addStatus', targets: { kind: 'chosen' }, status: { id: ROLE.romeo, name: 'Romeo', traits: ['wherewolf.base.trait.lover'] }, duration: 'permanent' }, { type: 'changeFaction', targets: { kind: 'chosen' }, faction: FACTION.lovers }], instructions: 'Choose one other player as Romeo.', requires: ['relationships'], dependencyBarrier: 'relationships' },
      { id: `${ROLE.juliet}.protect-romeo`, name: 'Juliet’s protection', kind: 'passive', trigger: 'attack.attempted', condition: { op: 'all', conditions: [{ op: 'targetIsRelationship', relationship: 'wherewolf.base.relationship.romeo' }, { op: 'isAlive', subject: 'self' }] }, effects: [{ type: 'preventEvent', reason: 'Romeo is protected while Juliet lives.' }] },
      { id: `${ROLE.juliet}.grief`, name: 'Lovers’ grief', kind: 'passive', trigger: 'death.resolved', condition: { op: 'targetIsRelationship', relationship: 'wherewolf.base.relationship.romeo' }, effects: [{ type: 'kill', targets: { kind: 'self' }, cause: 'Lovers grief', timing: 'next-morning' }] },
      { id: `${ROLE.juliet}.grief-romeo`, name: 'Romeo’s grief', kind: 'passive', trigger: 'death.resolved', condition: { op: 'targetIsSelf' }, effects: [{ type: 'kill', targets: { kind: 'relationship', relationship: 'wherewolf.base.relationship.romeo' }, cause: 'Lovers grief', timing: 'next-morning' }] },
    ], [], ['relationships', 'shadow-attacks']),
  role(ROLE.guardian, 'Guardian Angel', FACTION.neutral, ['Protection', 'Relationship', 'Alternate Victory'], [TRAIT.guardian],
    'Guards one player, substitutes onto their Ballot, and retargets attacks.', 'On setup, choose a guarded player. After that player qualifies for the Ballot, replace them as candidate. An otherwise successful shadow attack is retargeted onto the Guardian, who is then an ordinary protectable target.', [
      { id: `${ROLE.guardian}.choose`, name: 'Choose guarded player', kind: 'active', trigger: 'setup.action', order: 50, target: { label: 'Player to guard', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true }, effects: [{ type: 'linkRelationship', targets: { kind: 'chosen' }, relationship: 'wherewolf.base.relationship.guarded', reciprocal: 'wherewolf.base.relationship.guardian' }], instructions: 'Choose one other player to guard.', requires: ['relationships'], dependencyBarrier: 'relationships' },
      { id: `${ROLE.guardian}.ballot`, name: 'Ballot substitution', kind: 'passive', trigger: 'ballot.qualified', condition: { op: 'targetIsRelationship', relationship: 'wherewolf.base.relationship.guarded' }, effects: [{ type: 'replaceQualifiedCandidate', guarded: { kind: 'eventTarget' }, replacement: { kind: 'self' } }] },
      { id: `${ROLE.guardian}.redirect`, name: 'Attack retarget', kind: 'passive', trigger: 'attack.successful', condition: { op: 'targetIsRelationship', relationship: 'wherewolf.base.relationship.guarded' }, effects: [{ type: 'redirectEvent', targets: { kind: 'self' }, reason: 'Guardian Angel retarget', preventable: true }] },
      { id: `${ROLE.guardian}.win`, name: 'Guardian victory', kind: 'passive', trigger: 'victory.check', condition: { op: 'isAlive', subject: 'target' }, effects: [{ type: 'personalWin', targets: { kind: 'self' }, reason: 'Guarded player survived to the end.' }] },
    ], [], ['relationships', 'aggregate-voting', 'shadow-attacks', 'personal-victory']),
  role(ROLE.romeo, 'Romeo', FACTION.lovers, ['Status', 'Relationship'], [],
    'A status applied by Juliet; original role and abilities remain.', 'Romeo retains the original role and active ability, but uses the Lovers victory condition.', [], [], ['relationships']),
]

function withRoleConstants(base: RoleDefinition, constants: RoleDefinition['constants']): RoleDefinition {
  return withChecksum({ ...base, constants })
}

export const BASE_ROLES = roles.map((entry) => Object.freeze(entry))
export const BASE_DEALT_ROLES = BASE_ROLES.filter((entry) => entry.id !== ROLE.romeo)

export const BASE_PACK: PackDefinition = Object.freeze(withChecksum({
  id: PACK_ID,
  meta: { kind: 'pack', namespace: 'wherewolf.base', uuid: '10000000-0000-4000-8000-000000000001', name: 'Base Roles', version: '1.0.0', schemaVersion: 1, engineVersion: 'wherewolf.rules/v1', checksum: '', builtIn: true },
  description: 'The 21 dealt roles from the original Wherewolf game, plus the Romeo status.',
  roleIds: BASE_ROLES.map((entry) => entry.id), roles: BASE_ROLES,
}))

export const BASE_SCENARIO: ScenarioDefinition = Object.freeze(withChecksum<ScenarioDefinition>({
  id: SCENARIO_ID,
  meta: { kind: 'scenario', namespace: 'wherewolf.base', uuid: '20000000-0000-4000-8000-000000000001', name: 'Base Game', version: '1.0.0', schemaVersion: 1, engineVersion: 'wherewolf.rules/v1', checksum: '', builtIn: true },
  description: 'The open-ended Base Game: setup night, aggregate voting, Ballot, night actions, morning victory, then announcements.',
  factions: [
    { id: FACTION.village, name: 'Village', colour: '#d8c594', alignment: 'human' }, { id: FACTION.wolves, name: 'Wolf Pack', colour: '#b64d46', alignment: 'shadow' },
    { id: FACTION.neutral, name: 'Neutral', colour: '#938f84', alignment: 'neutral' }, { id: FACTION.lovers, name: 'Lovers', colour: '#c66d8c', alignment: 'neutral' },
  ],
  capabilities: ['private-information', 'public-role-ranges', 'hidden-setup-state', 'shadow-attacks', 'revival', 'aggregate-voting', 'announcements', 'relationships', 'personal-victory'],
  defaultPackIds: [PACK_ID], packs: [BASE_PACK], roleOverrides: {},
  setupPipeline: [
    { id: 'base.setup.actions', type: 'role-actions', label: 'First night', trigger: 'setup.action' },
    { id: 'base.setup.complete', type: 'cycle-end', label: 'Finish setup' },
  ],
  cyclePipeline: [
    { id: 'base.day.discussion', type: 'pause', label: 'Day discussion', message: 'Continue when the table is ready to vote.' },
    { id: 'base.day.nomination-vote', type: 'aggregate-vote', label: 'First vote', vote: 'nomination', eligible: 'alive' },
    { id: 'base.day.qualify', type: 'qualification', label: 'Create the Ballot', source: 'nomination', rule: 'highest-and-second' },
    { id: 'base.day.ballot-vote', type: 'aggregate-vote', label: 'Ballot vote', vote: 'ballot', eligible: 'alive-except-candidates', allowCandidateWithTrait: TRAIT.seducer },
    { id: 'base.day.burn', type: 'burn-resolution', label: 'Resolve the burn', rule: 'unique-highest' },
    { id: 'base.night.actions', type: 'role-actions', label: 'Night actions', trigger: 'night.action', dependencyBarrier: 'before-attack-resolution' },
    { id: 'base.night.attacks', type: 'attack-resolution', label: 'Resolve shadow attacks', attackType: 'shadow' },
    { id: 'base.night.healer', type: 'role-actions', label: 'After-attack actions', trigger: 'night.action', dependencyBarrier: 'after-attack-resolution' },
    { id: 'base.morning.victory', type: 'victory-check', label: 'Check victory' },
    { id: 'base.morning.news', type: 'announcements', label: 'Morning announcements', categories: ['Deaths', 'Newsgiver'] },
    { id: 'base.cycle.end', type: 'cycle-end', label: 'Begin next day' },
  ],
  victoryRules: [
    { id: 'base.victory.lovers', type: 'relationship-final-pair', relationship: 'wherewolf.base.relationship.romeo', faction: FACTION.lovers, priority: 10 },
    { id: 'base.victory.village', type: 'faction-eliminated', winningFaction: FACTION.village, eliminatedTrait: TRAIT.werewolf, excludedFactions: [FACTION.lovers], priority: 20 },
    { id: 'base.victory.wolves', type: 'parity', winningFaction: FACTION.wolves, countingTrait: TRAIT.werewolf, priority: 30 },
  ],
  nightOrder: [
    `${ROLE.clairvoyant}.check`, `${ROLE.wizard}.check`, `${ROLE.medium}.check`, `${ROLE.witch}.protect`,
    'wherewolf.base.ability.wolf-bite', `${ROLE.healer}.revive`,
  ],
  dependencyBarriers: [
    { before: `${ROLE.witch}.protect`, after: 'wherewolf.base.ability.wolf-bite', reason: 'Protection must exist before the Pack chooses and resolves attacks.' },
    { before: 'wherewolf.base.ability.wolf-bite', after: `${ROLE.healer}.revive`, reason: 'The Healer acts only after night deaths exist.' },
  ],
}))

export const BUILT_IN_ARTIFACTS = [BASE_PACK, BASE_SCENARIO]
export function roleById(id: string, extra: RoleDefinition[] = []): RoleDefinition | undefined { return [...BASE_ROLES, ...extra].find((entry) => entry.id === id) }
export function roleName(id: string): string { return roleById(id)?.meta.name ?? id.split('.').at(-1) ?? id }
