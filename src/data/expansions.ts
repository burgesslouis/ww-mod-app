import { withChecksum } from '../domain/artifacts'
import { BASE_PACK } from './base'
import { DARKEST_PACK_ID, DARKEST_ROLE as D, FACTION, HIDDEN_PACK_ID, HIDDEN_ROLE as H, OFFICIAL_SCENARIO_ID, PACK_ID, ROLE, TRAIT } from '../domain/ids'
import type { AbilityDefinition, PackDefinition, RoleDefinition, ScenarioDefinition, StateVariable, TraitDefinition } from '../domain/types'

const TRAITS: TraitDefinition[] = [
  { id: TRAIT.shadow, label: 'Shadow', colour: '#665776', description: 'Must be removed before a Human victory.', builtIn: true },
  { id: TRAIT.undead, label: 'Undead', colour: '#6e6681', builtIn: true },
  { id: TRAIT.guard, label: 'Guard', colour: '#547b91', builtIn: true },
  { id: TRAIT.littleFolk, label: 'Little Folk', colour: '#6d9a64', builtIn: true },
  { id: TRAIT.spirit, label: 'Spirit', colour: '#8d83ae', builtIn: true },
  { id: TRAIT.ballotVoter, label: 'Ballot voter', colour: '#bd8d46', builtIn: true },
  { id: TRAIT.anyHumanWinner, label: 'Any Human', colour: '#7f9d7b', builtIn: true },
  { id: TRAIT.anyShadowWinner, label: 'Any Shadow', colour: '#8a5b70', builtIn: true },
  { id: TRAIT.undeadSupport, label: 'Undead supporter', colour: '#766783', builtIn: true },
  { id: TRAIT.undeadHunter, label: 'Undead hunter', colour: '#9d784e', builtIn: true },
]

const ids: string[] = [...Object.values(D), ...Object.values(H)]
const uuid = (id: string) => `30000000-0000-4000-8000-${String(ids.indexOf(id) + 1).padStart(12, '0')}`

function role(id: string, name: string, faction: string, categories: string[], traits: string[], summary: string, description: string, abilities: AbilityDefinition[] = [], state: StateVariable[] = [], maximumCopies = 1, statuses?: RoleDefinition['statuses']): RoleDefinition {
  const namespace = id.includes('.darkest-night.') ? 'wherewolf.darkest-night' : 'wherewolf.hidden-motives'
  return withChecksum({
    id,
    meta: { kind: 'role', namespace, uuid: uuid(id), name, version: '1.0.0', schemaVersion: 1, engineVersion: 'wherewolf.rules/v1', checksum: '', builtIn: true },
    faction, categories, traits,
    traitDefinitions: traits.map((traitId) => TRAITS.find((trait) => trait.id === traitId) ?? { id: traitId, label: traitId.split('.').at(-1) ?? traitId, colour: '#8c857b' }),
    multiplicity: { min: 0, max: maximumCopies }, text: { summary, description }, constants: [], state, requirements: [], abilities, statuses,
  })
}

const setup = (id: string, name: string, order: number, effects: AbilityDefinition['effects'], instructions: string, simultaneous?: AbilityDefinition['simultaneous']): AbilityDefinition => ({
  id, name, kind: 'active', trigger: 'setup.action', order, effects, instructions, simultaneous, dependencyBarrier: 'setup-information', resultPresentation: simultaneous ? 'inline' : undefined,
})
const night = (id: string, name: string, order: number, target: AbilityDefinition['target'], effects: AbilityDefinition['effects'], instructions: string, extra: Partial<AbilityDefinition> = {}): AbilityDefinition => ({
  id, name, kind: 'active', trigger: 'night.action', order, target, effects, instructions, dependencyBarrier: 'before-attack-resolution', ...extra,
})
const day = (id: string, name: string, order: number, target: AbilityDefinition['target'], effects: AbilityDefinition['effects'], instructions: string): AbilityDefinition => ({
  id, name, kind: 'active', trigger: 'day.action', order, target, effects, instructions,
})

const wolfIntro = setup('wherewolf.darkest-night.ability.wolf-intro', 'Meet the wolves', 91, [
  { type: 'learnPlayers', targets: { kind: 'trait', trait: TRAIT.werewolf, life: 'alive' }, label: 'Living Werewolves' },
  { type: 'learnRoleIdentity', roleId: ROLE.defector }, { type: 'learnRoleIdentity', roleId: D.hag },
], 'Wake the role with the Wolf Pack. Show all living Werewolves, the Defector, and the Hag.', { id: 'wherewolf.base.group.wolf-introduction', label: 'Wolf Pack' })

const outcastBite = night('wherewolf.base.ability.wolf-bite', 'Join the Pack bite', 51,
  { label: 'Bite target', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, allowNone: true },
  [{ type: 'queueAttack', targets: { kind: 'chosen' }, attackType: 'shadow' }], 'Wake with the strongest biting Werewolf and agree the Pack target.',
  { activeFromNight: 2, kind: 'shared-faction', simultaneous: { id: 'wherewolf.darkest-night.group.pack-bite', label: 'Biting Werewolves' } })

export const DARKEST_NIGHT_ROLES: RoleDefinition[] = [
  role(D.outcastWolf, 'Outcast Wolf', FACTION.wolves, ['Wolf Pack', 'Night'], [TRAIT.werewolf, TRAIT.wolfAttacker, TRAIT.corrupt, TRAIT.shadow],
    'Joins the Pack from the second night but loses while the Alpha Wolf lives.', 'Meets the wolves, Defector, and Hag. The Alpha Wolf cannot kill it. It loses if the Alpha Wolf is alive when play ends.', [
      wolfIntro, outcastBite,
      { id: `${D.outcastWolf}.alpha-protection`, name: 'Protected from Alpha', kind: 'passive', trigger: 'attack.resolving', condition: { op: 'all', conditions: [{ op: 'targetIsSelf' }, { op: 'hasRole', subject: 'actor', roleId: ROLE.alphaWolf }] }, effects: [{ type: 'preventEvent', reason: 'The Outcast Wolf is protected from the Alpha Wolf.' }] },
      { id: `${D.outcastWolf}.alpha-loss`, name: 'Outcast condition', kind: 'passive', trigger: 'victory.check', condition: { op: 'count', selector: { kind: 'role', roleId: ROLE.alphaWolf, life: 'alive' }, compare: 'gt', value: 0 }, effects: [{ type: 'personalLose', targets: { kind: 'self' }, reason: 'The Alpha Wolf was still alive.' }] },
    ]),
  role(D.loneWolf, 'Lone Wolf', FACTION.loneWolf, ['Shadow', 'Night', 'Alternate Victory'], [TRAIT.werewolf, TRAIT.corrupt, TRAIT.shadow],
    'Takes the bite only after the Wolf Pack is gone.', 'Meets the wolves, Defector, and Hag. Other Werewolves cannot kill it. It follows its own Shadow victory.', [
      wolfIntro,
      night(`${D.loneWolf}.bite`, 'Lone bite', 54, { label: 'Bite target', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true, allowNone: true }, [{ type: 'queueAttack', targets: { kind: 'chosen' }, attackType: 'shadow' }], 'If no Wolf Pack member lives, choose one player to bite.', { condition: { op: 'count', selector: { kind: 'faction', faction: FACTION.wolves, life: 'alive' }, compare: 'eq', value: 0 } }),
      { id: `${D.loneWolf}.wolf-protection`, name: 'Protected from Werewolves', kind: 'passive', trigger: 'attack.resolving', condition: { op: 'all', conditions: [{ op: 'targetIsSelf' }, { op: 'hasTrait', subject: 'actor', trait: TRAIT.werewolf }] }, effects: [{ type: 'preventEvent', reason: 'The Lone Wolf is protected from other Werewolves.' }] },
    ]),
  role(D.shapeshifter, 'Shapeshifter', FACTION.village, ['Mystic', 'Transformation'], [TRAIT.mystic],
    'May become a biting Werewolf before the Pack acts.', 'Each night it may remain Human or join the Wolf Pack, becoming Mystic, Shadow, Corrupt, and Werewolf.', [
      night(`${D.shapeshifter}.turn`, 'Choose whether to turn', 44, { label: 'Become a Werewolf', min: 0, max: 1, selector: { kind: 'self' }, allowNone: true }, [{ type: 'addStatus', targets: { kind: 'chosen' }, status: { id: 'wherewolf.darkest-night.status.shapeshifted', name: 'Shapeshifted', traits: [TRAIT.shadow, TRAIT.corrupt, TRAIT.werewolf, TRAIT.wolfAttacker] }, duration: 'permanent' }, { type: 'changeFaction', targets: { kind: 'chosen' }, faction: FACTION.wolves }], 'Ask whether the Shapeshifter turns. Select the Shapeshifter to turn, or choose nobody to remain Human.'),
      outcastBite,
    ]),
  role(D.poacher, 'Poacher', FACTION.village, ['Information', 'Protection'], [], 'Counts Werewolves and can stop a lone bite.', 'On the first night learns the Werewolf count and whether the Lone Wolf is present. The moderator applies its signal during a solo bite.', [
    setup(`${D.poacher}.information`, 'Count the wolves', 35, [{ type: 'learnCount', targets: { kind: 'trait', trait: TRAIT.werewolf, life: 'alive' }, label: 'Werewolves in play' }, { type: 'learnRolePresence', roleId: D.loneWolf }], 'Tell the Poacher how many Werewolves are in play and whether the Lone Wolf is present.'),
  ]),
  role(D.hag, 'Hag', FACTION.anyShadow, ['Any Shadow', 'Mystic'], [TRAIT.shadow, TRAIT.corrupt, TRAIT.mystic, TRAIT.anyShadowWinner], 'Hexes Mystics who choose it.', 'All Shadow roles locate the Hag on the first night. A Mystic who targets the Hag receives inverted information while the Hag lives.', [
    setup(`${D.hag}.shadow-intro`, 'Meet the Shadows', 94, [{ type: 'learnPlayers', targets: { kind: 'trait', trait: TRAIT.shadow, life: 'alive' }, label: 'Shadow players' }], 'Show the Hag the other Shadow players.'),
    { id: `${D.hag}.hex`, name: 'Hex', kind: 'passive', trigger: 'night.action', condition: { op: 'all', conditions: [{ op: 'targetIsSelf' }, { op: 'hasTrait', subject: 'actor', trait: TRAIT.mystic }] }, effects: [{ type: 'addStatus', targets: { kind: 'eventActor' }, status: { id: 'wherewolf.darkest-night.status.hex', name: 'Hex', data: { invertInformation: true, sourceMustLive: true } }, duration: 'permanent' }] },
  ]),
  role(D.vampire, 'Vampire', FACTION.vampire, ['Undead', 'Transformation'], [TRAIT.shadow, TRAIT.corrupt, TRAIT.undead], 'Turns a non-Mystic player into a Minion.', 'From the second night, bites one living player. A Werewolf or Vampire Hunter target causes undead backlash instead.', [
    setup(`${D.vampire}.intro`, 'Meet Igor', 95, [{ type: 'learnRoleIdentity', roleId: D.igor }, { type: 'learnRoleIdentity', roleId: D.hag }], 'Show the Vampire Igor and the Hag.'),
    night(`${D.vampire}.bite`, 'Create a Minion', 42, { label: 'Player to bite', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true }, [
      { type: 'conditional', condition: { op: 'any', conditions: [{ op: 'targetRoleHasTrait', trait: TRAIT.werewolf }, { op: 'targetRoleHasTrait', trait: TRAIT.undeadHunter }] }, effects: [{ type: 'queueAttack', targets: { kind: 'self' }, attackType: 'undead-backlash' }], otherwise: [
        { type: 'conditional', condition: { op: 'targetRoleHasTrait', trait: TRAIT.mystic }, effects: [{ type: 'noop', message: 'Mystic target resisted the bite.' }], otherwise: [{ type: 'transformRole', targets: { kind: 'chosen' }, roleId: D.minion }] },
      ] },
    ], 'Choose a living player. Werewolves and the Vampire Hunter cause backlash; Mystics resist; another target becomes a Minion.', { activeFromNight: 2 }),
  ]),
  role(D.minion, 'Minion', FACTION.vampire, ['Status', 'Undead'], [TRAIT.shadow, TRAIT.corrupt, TRAIT.undead], 'A replacement role created by the Vampire.', 'Minion is not dealt. It replaces the bitten player’s original role and wins with the Vampire faction.'),
  role(D.nosferatu, 'Nosferatu', FACTION.nosferatu, ['Undead', 'Revival'], [TRAIT.shadow, TRAIT.corrupt, TRAIT.undead], 'Raises one eligible night victim as a Thrall.', 'After attacks from the second night, chooses someone killed that night. Werewolves and Vampire Hunters cause backlash.', [
    setup(`${D.nosferatu}.intro`, 'Meet Igor', 96, [{ type: 'learnRoleIdentity', roleId: D.igor }, { type: 'learnRoleIdentity', roleId: D.hag }], 'Show Nosferatu Igor and the Hag.'),
    night(`${D.nosferatu}.raise`, 'Raise a Thrall', 82, { label: 'Night victim', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'dead' }, allowNone: true }, [
      { type: 'conditional', condition: { op: 'any', conditions: [{ op: 'targetRoleHasTrait', trait: TRAIT.werewolf }, { op: 'targetRoleHasTrait', trait: TRAIT.undeadHunter }] }, effects: [{ type: 'queueAttack', targets: { kind: 'self' }, attackType: 'undead-backlash' }], otherwise: [{ type: 'revive', targets: { kind: 'chosen' } }, { type: 'transformRole', targets: { kind: 'chosen' }, roleId: D.thrall }] },
    ], 'Choose an eligible player killed tonight, or nobody. Resolve backlash before raising a Thrall.', { activeFromNight: 2, dependencyBarrier: 'after-attack-resolution' }),
  ]),
  role(D.thrall, 'Thrall', FACTION.nosferatu, ['Status', 'Undead'], [TRAIT.shadow, TRAIT.corrupt, TRAIT.undead], 'A replacement role created by Nosferatu.', 'Thrall is not dealt. It replaces the raised player’s original role and wins with Nosferatu.'),
  role(D.igor, 'Igor', FACTION.undeadSupport, ['Undead support'], [TRAIT.corrupt, TRAIT.undeadSupport], 'Supports both Vampire and Nosferatu.', 'Igor meets both leaders and wins with either faction. If a leader suffers backlash after targeting a Wolf or Hunter, Igor dies instead.', [
    setup(`${D.igor}.vampire`, 'Protect the Vampire', 97, [{ type: 'learnRoleIdentity', roleId: D.vampire }, { type: 'linkRelationship', targets: { kind: 'role', roleId: D.vampire, life: 'any' }, relationship: 'wherewolf.darkest-night.relationship.protect-vampire', reciprocal: 'wherewolf.darkest-night.relationship.igor-vampire' }], 'Show Igor the Vampire, if present.'),
    setup(`${D.igor}.nosferatu`, 'Protect Nosferatu', 98, [{ type: 'learnRoleIdentity', roleId: D.nosferatu }, { type: 'linkRelationship', targets: { kind: 'role', roleId: D.nosferatu, life: 'any' }, relationship: 'wherewolf.darkest-night.relationship.protect-nosferatu', reciprocal: 'wherewolf.darkest-night.relationship.igor-nosferatu' }], 'Show Igor Nosferatu, if present.'),
    { id: `${D.igor}.protect-vampire`, name: 'Protect Vampire', kind: 'passive', trigger: 'attack.successful', condition: { op: 'all', conditions: [{ op: 'targetIsRelationship', relationship: 'wherewolf.darkest-night.relationship.protect-vampire' }, { op: 'event', field: 'attackType', compare: 'eq', value: 'undead-backlash' }] }, effects: [{ type: 'redirectEvent', targets: { kind: 'self' }, reason: 'Igor protects the Vampire', preventable: false }] },
    { id: `${D.igor}.protect-nosferatu`, name: 'Protect Nosferatu', kind: 'passive', trigger: 'attack.successful', condition: { op: 'all', conditions: [{ op: 'targetIsRelationship', relationship: 'wherewolf.darkest-night.relationship.protect-nosferatu' }, { op: 'event', field: 'attackType', compare: 'eq', value: 'undead-backlash' }] }, effects: [{ type: 'redirectEvent', targets: { kind: 'self' }, reason: 'Igor protects Nosferatu', preventable: false }] },
  ]),
  role(D.vampireHunter, 'Vampire Hunter', FACTION.village, ['Information', 'Protection'], [TRAIT.undeadHunter], 'Detects Vampire and Nosferatu and kills an undead attacker.', 'On the first night learns whether each undead leader is present. A leader targeting it suffers backlash.', [
    setup(`${D.vampireHunter}.check`, 'Check for undead', 36, [{ type: 'learnRolePresence', roleId: D.vampire }, { type: 'learnRolePresence', roleId: D.nosferatu }], 'Tell the Vampire Hunter whether Vampire and Nosferatu are present.'),
  ]),
  role(D.necromancer, 'Necromancer', FACTION.necromancer, ['Shadow', 'Curse', 'Alternate Victory'], [TRAIT.shadow, TRAIT.corrupt, TRAIT.mystic], 'Curses two players and threatens a one-morning ritual.', 'Cursed players appear Corrupt and receive one extra vote in both tallies. When the last Curse is gone, announce the ritual; if it is not stopped, Necromancer wins.', [
    { ...setup(`${D.necromancer}.curse`, 'Place two Curses', 70, [{ type: 'addStatus', targets: { kind: 'chosen' }, status: { id: 'wherewolf.darkest-night.status.curse', name: 'Curse', traits: [TRAIT.corrupt], data: { sourceMustLive: true }, abilities: [{ id: 'wherewolf.darkest-night.status.curse.vote', name: 'Curse vote', kind: 'status', trigger: 'vote.beforeTally', condition: { op: 'targetIsSelf' }, effects: [{ type: 'modifyVotesReceived', targets: { kind: 'self' }, operation: 'add', value: 1 }] }] }, duration: 'permanent' }], 'Choose two different players to Curse.'), target: { label: 'Players to Curse', min: 2, max: 2, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true, distinct: true } },
    night(`${D.necromancer}.ritual`, 'Check the ritual', 88, { label: 'Start the ritual if all Curses are gone', min: 0, max: 1, selector: { kind: 'self' }, allowNone: true }, [{ type: 'conditional', condition: { op: 'state', key: 'ritualStarted', compare: 'eq', value: true }, effects: [{ type: 'endGame', winningFaction: FACTION.necromancer, reason: 'The Necromancer completed the ritual.' }], otherwise: [{ type: 'setState', key: 'ritualStarted', value: true }, { type: 'announce', message: 'The Necromancer ritual has started.', visibility: 'public', category: 'Ritual' }] }], 'If the last active Curse is gone, select the Necromancer to start the ritual. If it was already started and not stopped, select again to complete it.', { activeFromNight: 2 }),
  ], [{ key: 'ritualStarted', label: 'Ritual started', type: 'boolean', initial: false }]),
  role(D.undertaker, 'Undertaker', FACTION.village, ['Information'], [], 'Knows whether Necromancer is present.', 'The Undertaker learns whether Necromancer is present and can use the moderator trace to follow Curse eliminations.', [setup(`${D.undertaker}.check`, 'Check for Necromancer', 37, [{ type: 'learnRolePresence', roleId: D.necromancer }], 'Tell the Undertaker whether Necromancer is present.')]),
  role(D.possessed, 'Possessed', FACTION.possessed, ['Shadow', 'Transformation'], [TRAIT.shadow, TRAIT.corrupt, TRAIT.possessed], 'Passes possession to a chosen successor when killed outside a burn.', 'Choose a possible successor on the first night. If the Possessed later dies other than by burning, that player becomes Possessed.', [
    { ...setup(`${D.possessed}.successor`, 'Choose a successor', 75, [{ type: 'linkRelationship', targets: { kind: 'chosen' }, relationship: 'wherewolf.darkest-night.relationship.possessed-successor' }], 'Choose the player who will inherit possession if this Possessed dies.'), target: { label: 'Possession successor', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true } },
    { id: `${D.possessed}.transfer`, name: 'Transfer possession', kind: 'passive', trigger: 'death.resolved', condition: { op: 'all', conditions: [{ op: 'targetIsSelf' }, { op: 'event', field: 'cause', compare: 'neq', value: 'Burned' }] }, effects: [{ type: 'transformRole', targets: { kind: 'relationship', relationship: 'wherewolf.darkest-night.relationship.possessed-successor' }, roleId: D.possessed }] },
  ]),
  role(D.vagrant, 'Vagrant', FACTION.neutral, ['Alternate Victory'], [], 'Wins after surviving a night with six or fewer living players.', 'At morning, if six or fewer players live, Vagrant wins personally and is eliminated. A living Vagrant also wins at normal game end.', [
    { id: `${D.vagrant}.threshold`, name: 'Vagrant threshold', kind: 'passive', trigger: 'morning.beforeVictory', condition: { op: 'all', conditions: [{ op: 'isAlive', subject: 'self' }, { op: 'count', selector: { kind: 'allPlayers', life: 'alive' }, compare: 'lte', value: 6 }] }, effects: [{ type: 'personalWin', targets: { kind: 'self' }, reason: 'Survived a night with six or fewer players.' }, { type: 'kill', targets: { kind: 'self' }, cause: 'Vagrant departed' }] },
    { id: `${D.vagrant}.survive`, name: 'Vagrant survival', kind: 'passive', trigger: 'victory.check', condition: { op: 'isAlive', subject: 'self' }, effects: [{ type: 'personalWin', targets: { kind: 'self' }, reason: 'Survived to the end.' }] },
  ]),
  role(D.lyncher, 'Lyncher', FACTION.neutral, ['Alternate Victory'], [], 'Wins if one chosen player is burned.', 'Chooses a target on the first night. The Lyncher wins if that target burns and dies the next morning after the target dies.', [
    { ...setup(`${D.lyncher}.target`, 'Choose the mark', 65, [{ type: 'linkRelationship', targets: { kind: 'chosen' }, relationship: 'wherewolf.darkest-night.relationship.lyncher-target' }], 'Choose one other player as the Lyncher’s mark.'), target: { label: 'Lyncher target', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true } },
    { id: `${D.lyncher}.win`, name: 'Successful lynch', kind: 'passive', trigger: 'burn.resolved', condition: { op: 'targetIsRelationship', relationship: 'wherewolf.darkest-night.relationship.lyncher-target' }, effects: [{ type: 'personalWin', targets: { kind: 'self' }, reason: 'The chosen player was burned.' }] },
    { id: `${D.lyncher}.depart`, name: 'Lyncher departs', kind: 'passive', trigger: 'death.resolved', condition: { op: 'targetIsRelationship', relationship: 'wherewolf.darkest-night.relationship.lyncher-target' }, effects: [{ type: 'kill', targets: { kind: 'self' }, cause: 'Lyncher target died', timing: 'next-morning' }] },
  ]),
  role(D.sensitive, 'Sensitive', FACTION.village, ['Mystic', 'Information'], [TRAIT.mystic], 'Checks whether one player belongs to the Village.', 'Each night the Sensitive learns whether a chosen living player is in the Village faction.', [night(`${D.sensitive}.check`, 'Read allegiance', 12, { label: 'Player to check', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' } }, [{ type: 'inspectFaction', targets: { kind: 'chosen' }, faction: FACTION.village, positive: 'VILLAGE', negative: 'NOT VILLAGE' }], 'Choose one living player and report whether they are Village.')]),
  role(D.pestilent, 'Pestilent', FACTION.village, ['Infection'], [TRAIT.pestilent], 'Spreads infection when inspected by a Mystic.', 'A Mystic check of the Pestilent infects the checker and nearby players. Infected Werewolves cannot bite; Healer and Undead are immune. The moderator can track Infection as statuses.', []),
  role(D.gunsmith, 'Gunsmith', FACTION.village, ['Night', 'Voting'], [TRAIT.gunsmith], 'Gives one player a single-use Gun for the following day.', 'A Gun kills its target immediately and forces the shooter onto that day’s Ballot. A player cannot receive one on consecutive nights.', [
    night(`${D.gunsmith}.give`, 'Give a Gun', 38, { label: 'Gun recipient', min: 1, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true }, [{ type: 'addStatus', targets: { kind: 'chosen' }, status: { id: 'wherewolf.darkest-night.status.gun', name: 'Gun', abilities: [day('wherewolf.darkest-night.status.gun.fire', 'Fire the Gun', 5, { label: 'Player to shoot', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true, allowNone: true }, [{ type: 'kill', targets: { kind: 'chosen' }, cause: 'Shot' }, { type: 'forceBallot', targets: { kind: 'self' } }], 'If the player fires, select the target. Choose nobody if the Gun is not fired today.')] }, duration: 'next-day' }], 'Choose a player who did not receive a Gun last night.'),
  ]),
  role(D.amnesiac, 'Amnesiac', FACTION.neutral, ['Transformation'], [TRAIT.amnesiac], 'Receives a publicly possible role on the second night.', 'On the second night the moderator chooses its actual role from the roles announced as possible at setup. It loses if burned first.', [
    night(`${D.amnesiac}.remember`, 'Choose the remembered role', 8, { label: 'Publicly possible role', min: 1, max: 1, selector: { kind: 'publicPossibleRoles' } }, [{ type: 'transformRole', targets: { kind: 'self' }, roleId: { chosenRole: true } }], 'Choose the Amnesiac’s real role from the roles announced as possible at the start.', { activeFromNight: 2, once: 'game' }),
    { id: `${D.amnesiac}.day-one-loss`, name: 'Forgotten forever', kind: 'passive', trigger: 'burn.resolved', condition: { op: 'all', conditions: [{ op: 'targetIsSelf' }, { op: 'cycle', compare: 'eq', value: 1 }] }, effects: [{ type: 'personalLose', targets: { kind: 'self' }, reason: 'Burned before remembering a role.' }] },
  ]),
]

const littleFolkIntro = setup('wherewolf.hidden-motives.ability.little-folk-intro', 'Meet the Little Folk', 105, [{ type: 'learnPlayers', targets: { kind: 'trait', trait: TRAIT.littleFolk, life: 'alive' }, label: 'Little Folk' }], 'Wake all Little Folk together and show them one another.', { id: 'wherewolf.hidden-motives.group.little-folk', label: 'Little Folk' })
const littleFolkDeath: AbilityDefinition = { id: 'wherewolf.hidden-motives.ability.last-little-folk', name: 'Last Little Folk', kind: 'passive', trigger: 'morning.beforeVictory', condition: { op: 'all', conditions: [{ op: 'isAlive', subject: 'self' }, { op: 'count', selector: { kind: 'trait', trait: TRAIT.littleFolk, life: 'alive' }, compare: 'eq', value: 1 }] }, effects: [{ type: 'kill', targets: { kind: 'self' }, cause: 'Last Little Folk', timing: 'next-morning' }] }

export const HIDDEN_MOTIVES_ROLES: RoleDefinition[] = [
  role(H.inquisitor, 'Inquisitor', FACTION.inquisition, ['Inquisition', 'Information'], [], 'Finds the Inquisition and counts living Mystics.', 'On the first night learns the Templar, Executioner, and Mystic count. It is alerted whenever a Mystic targets it.', [
    setup(`${H.inquisitor}.intro`, 'Review the Inquisition', 110, [{ type: 'learnRoleIdentity', roleId: H.templar }, { type: 'learnRoleIdentity', roleId: H.executioner }, { type: 'learnCount', targets: { kind: 'trait', trait: TRAIT.mystic, life: 'alive' }, label: 'Living Mystics' }], 'Show the Inquisitor the other Inquisition roles and report the number of living Mystics.'),
    { id: `${H.inquisitor}.notice`, name: 'Notice a Mystic', kind: 'passive', trigger: 'night.action', condition: { op: 'all', conditions: [{ op: 'targetIsSelf' }, { op: 'hasTrait', subject: 'actor', trait: TRAIT.mystic }] }, effects: [{ type: 'learnPlayers', targets: { kind: 'eventActor' }, label: 'Mystic who chose the Inquisitor' }] },
  ]),
  role(H.templar, 'Templar', FACTION.inquisition, ['Inquisition', 'Crusades'], [], 'Starts the Crusades if the Inquisitor dies.', 'The Crusades countdown begins at the number of living Mystics. If Mystics or Werewolves are not eliminated before it reaches zero, the Mystics win.', [
    { id: `${H.templar}.start`, name: 'Start the Crusades', kind: 'passive', trigger: 'death.resolved', condition: { op: 'all', conditions: [{ op: 'hasRole', subject: 'target', roleId: H.inquisitor }, { op: 'isAlive', subject: 'self' }] }, effects: [{ type: 'setStateCount', key: 'crusadesRemaining', targets: { kind: 'trait', trait: TRAIT.mystic, life: 'alive' } }, { type: 'setState', key: 'crusadesActive', value: true }, { type: 'announce', message: 'The Crusades have begun.', visibility: 'public', category: 'Crusades' }] },
    { id: `${H.templar}.countdown`, name: 'Crusades countdown', kind: 'passive', trigger: 'morning.beforeVictory', condition: { op: 'all', conditions: [{ op: 'state', key: 'crusadesActive', compare: 'eq', value: true }, { op: 'count', selector: { kind: 'trait', trait: TRAIT.mystic, life: 'alive' }, compare: 'gt', value: 0 }, { op: 'count', selector: { kind: 'trait', trait: TRAIT.werewolf, life: 'alive' }, compare: 'gt', value: 0 }] }, effects: [{ type: 'incrementState', key: 'crusadesRemaining', amount: -1 }, { type: 'conditional', condition: { op: 'state', key: 'crusadesRemaining', compare: 'lte', value: 0 }, effects: [{ type: 'endGame', winningTrait: TRAIT.mystic, reason: 'The Crusades were not stopped; the Mystics win.' }], otherwise: [{ type: 'announce', message: 'The Crusades continue.', visibility: 'public', category: 'Crusades' }] }] },
  ], [{ key: 'crusadesActive', label: 'Crusades active', type: 'boolean', initial: false }, { key: 'crusadesRemaining', label: 'Crusades turns remaining', type: 'number', initial: 0 }]),
  role(H.executioner, 'Executioner', FACTION.inquisition, ['Inquisition', 'Voting'], [TRAIT.corrupt], 'Can secure an eligible Mystic or Shadow Ballot target.', 'During the Ballot, the moderator may select a Mystic or Shadow candidate for the Executioner’s signal.', [day(`${H.executioner}.signal`, 'Executioner signal', 45, { label: 'Mystic or Shadow candidate', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, allowNone: true }, [{ type: 'forceBallot', targets: { kind: 'chosen' } }], 'Record the Executioner’s signal if it names an eligible Mystic or Shadow player.')]),
  role(H.assassin, 'Assassin', FACTION.criminals, ['Criminal', 'Night'], [TRAIT.corrupt], 'Once per game, attacks during a possible Mystic turn.', 'From the second night, name a publicly possible Mystic. If present, kill that role; if absent, choose another player to kill.', [
    setup(`${H.assassin}.intro`, 'Meet the Criminals', 115, [{ type: 'learnFactionMembers', faction: FACTION.criminals }], 'Show the Assassin the other Criminals.'),
    night(`${H.assassin}.kill`, 'Assassination', 18, { label: 'Player killed by the Assassin', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true, allowNone: true }, [{ type: 'kill', targets: { kind: 'chosen' }, cause: 'Assassin' }], 'If the Assassin uses the once-per-game power, announce a publicly possible Mystic call and select the resulting victim.', { activeFromNight: 2, once: 'game' }),
  ]),
  role(H.guildMaster, 'Guild Master', FACTION.criminals, ['Criminal', 'Night'], [], 'Once per game tries to recruit through a possible Mystic turn.', 'From the second night names a publicly possible Mystic. If absent, it may approach another player; Guards and Werewolves kill the Guild Master, while Human City or Village targets become Criminal.', [
    setup(`${H.guildMaster}.intro`, 'Meet the Criminals', 116, [{ type: 'learnFactionMembers', faction: FACTION.criminals }], 'Show the Guild Master the other Criminals.'),
    night(`${H.guildMaster}.recruit`, 'Recruit', 19, { label: 'Player approached', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, excludeSelf: true, allowNone: true }, [{ type: 'conditional', condition: { op: 'any', conditions: [{ op: 'targetRoleHasTrait', trait: TRAIT.guard }, { op: 'targetRoleHasTrait', trait: TRAIT.werewolf }] }, effects: [{ type: 'kill', targets: { kind: 'self' }, cause: 'Failed Guild recruitment' }], otherwise: [{ type: 'changeFaction', targets: { kind: 'chosen' }, faction: FACTION.criminals }] }], 'If the Guild Master uses the power, announce the relevant possible Mystic call and select the player approached.', { activeFromNight: 2, once: 'game' }),
  ]),
  role(H.spy, 'Spy', FACTION.criminals, ['Criminal', 'Voting'], [], 'Knows the Criminals but must cast its own vote.', 'The Spy recognises the Criminal faction on the first night. Record the aggregate vote normally; the moderator enforces its required self-vote.', [setup(`${H.spy}.intro`, 'Meet the Criminals', 117, [{ type: 'learnFactionMembers', faction: FACTION.criminals }], 'Show the Spy the other Criminals.')]),
  role(H.thief, 'Thief', FACTION.criminals, ['Criminal', 'Protection'], [], 'Can interrupt one possible Mystic action and has one Shadow protection.', 'The Thief recognises Criminals, can suppress one player’s night action once, and survives the first Shadow attack.', [
    setup(`${H.thief}.intro`, 'Meet the Criminals', 118, [{ type: 'learnFactionMembers', faction: FACTION.criminals }, { type: 'addStatus', targets: { kind: 'self' }, status: { id: 'wherewolf.hidden-motives.status.thief-protection', name: 'Thief protection', data: { attackType: 'shadow' } }, duration: 'permanent' }], 'Show the Thief the other Criminals and note its unused protection.'),
    night(`${H.thief}.interrupt`, 'Interrupt a role', 9, { label: 'Player whose night action is interrupted', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, allowNone: true }, [{ type: 'suppressAction', targets: { kind: 'chosen' }, trigger: 'night.action', duration: 'night' }], 'If the Thief uses the once-per-game interruption, name the public role call and select the affected player.', { once: 'game' }),
  ]),
  role(H.corruptGuard, 'Corrupt Guard', FACTION.anyShadow, ['Guard', 'Any Shadow'], [TRAIT.corrupt, TRAIT.guard, TRAIT.anyShadowWinner], 'Knows the Guards and Criminals and wins with any Shadow faction.', 'On the first night recognises all Guards and Criminals.', [setup(`${H.corruptGuard}.intro`, 'Meet Guards and Criminals', 120, [{ type: 'learnPlayers', targets: { kind: 'trait', trait: TRAIT.guard, life: 'alive' }, label: 'Guards' }, { type: 'learnPlayers', targets: { kind: 'faction', faction: FACTION.criminals, life: 'alive' }, label: 'Criminals' }], 'Show the Corrupt Guard all Guards and Criminals.')]),
  role(H.guard, 'Guard', FACTION.village, ['Guard', 'Information'], [TRAIT.guard], 'Knows other Guards and the Criminal count.', 'On the first night recognises other Guards and learns the number of Criminals.', [setup(`${H.guard}.intro`, 'Meet the Guards', 121, [{ type: 'learnPlayers', targets: { kind: 'trait', trait: TRAIT.guard, life: 'alive' }, label: 'Guards' }, { type: 'learnCount', targets: { kind: 'faction', faction: FACTION.criminals, life: 'alive' }, label: 'Criminals' }], 'Wake all Guards together and tell them the number of Criminals.')], [], 2),
  role(H.lawyer, 'Lawyer', FACTION.city, ['City', 'Voting'], [TRAIT.ballotVoter], 'Votes while accused and may signal during nominations.', 'The Lawyer can vote while on the Ballot. A signal on a City or Criminal target removes its votes; another target is forced onto the Ballot.', [day(`${H.lawyer}.signal`, 'Lawyer signal', 20, { label: 'Signalled player', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, allowNone: true }, [{ type: 'forceBallot', targets: { kind: 'chosen' } }], 'Record the Lawyer’s nomination signal, if any.')]),
  role(H.mayor, 'Mayor', FACTION.city, ['City', 'Voting'], [TRAIT.ballotVoter], 'Votes while accused and can add City-backed Ballot votes.', 'The Mayor may signal a Ballot candidate; that candidate receives extra votes based on the living City faction.', [day(`${H.mayor}.signal`, 'Mayor signal', 50, { label: 'Ballot candidate', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, allowNone: true }, [{ type: 'addStatus', targets: { kind: 'chosen' }, status: { id: 'wherewolf.hidden-motives.status.mayor-support', name: 'Mayor support', abilities: [{ id: 'wherewolf.hidden-motives.status.mayor-support.vote', name: 'City votes', kind: 'status', trigger: 'vote.beforeTally', condition: { op: 'targetIsSelf' }, effects: [{ type: 'modifyVotesReceived', targets: { kind: 'self' }, operation: 'add', value: { count: { kind: 'faction', faction: FACTION.city, life: 'alive' }, add: -1 } }] }] }, duration: 'day' }], 'Record the Mayor’s Ballot signal, if any.')]),
  role(H.merchant, 'Merchant', FACTION.city, ['City', 'Voting'], [TRAIT.ballotVoter], 'May cast multiple votes and receives fewer votes as the City grows.', 'The Merchant votes while accused. Reduce votes received by the number of other living City members; record extra ballots as expected votes.', [
    { id: `${H.merchant}.discount`, name: 'City influence', kind: 'passive', trigger: 'vote.beforeTally', condition: { op: 'targetIsSelf' }, effects: [{ type: 'modifyVotesReceived', targets: { kind: 'self' }, operation: 'add', value: { count: { kind: 'faction', faction: FACTION.city, life: 'alive' }, multiplier: -1, add: 1 } }] },
  ]),
  role(H.preacher, 'Preacher', FACTION.city, ['City', 'Voting', 'Protection'], [TRAIT.ballotVoter], 'Can prevent another City player from burning.', 'The Preacher votes while accused and may protect a Ballot candidate. Another City player’s burn is always prevented.', [
    day(`${H.preacher}.protect`, 'Preacher protection', 55, { label: 'Ballot candidate to protect', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, allowNone: true }, [{ type: 'addStatus', targets: { kind: 'chosen' }, status: { id: 'wherewolf.hidden-motives.status.preacher-protection', name: 'Preacher protection', abilities: [{ id: 'wherewolf.hidden-motives.status.preacher-protection.burn', name: 'Prevent burn', kind: 'status', trigger: 'burn.resolving', condition: { op: 'targetIsSelf' }, effects: [{ type: 'preventEvent', reason: 'The Preacher protected this candidate.' }] }] }, duration: 'day' }], 'Record the Preacher’s Ballot protection signal, if any.'),
    { id: `${H.preacher}.city`, name: 'Protect the City', kind: 'passive', trigger: 'burn.resolving', condition: { op: 'all', conditions: [{ op: 'hasFaction', subject: 'target', faction: FACTION.city }, { op: 'not', condition: { op: 'targetIsSelf' } }] }, effects: [{ type: 'preventEvent', reason: 'The Preacher protects another City player.' }] },
  ]),
  role(H.leprechaun, 'Leprechaun', FACTION.anyHuman, ['Little Folk', 'Any Human'], [TRAIT.littleFolk, TRAIT.anyHumanWinner], 'Wins with any Human victory while another Little Folk survives.', 'Mystic powers have no effect on living Little Folk. The last living Little Folk dies the following morning.', [littleFolkIntro, littleFolkDeath]),
  role(H.sidhe, 'Sidhe', FACTION.anyHuman, ['Little Folk', 'Any Human'], [TRAIT.littleFolk, TRAIT.anyHumanWinner], 'Wins with any Human victory while another Little Folk survives.', 'Mystic powers have no effect on living Little Folk. The last living Little Folk dies the following morning.', [littleFolkIntro, littleFolkDeath]),
  role(H.goblin, 'Goblin', FACTION.anyShadow, ['Little Folk', 'Any Shadow'], [TRAIT.littleFolk, TRAIT.corrupt, TRAIT.anyShadowWinner], 'Wins with any Shadow faction while another Little Folk survives.', 'Mystic powers have no effect on living Little Folk. The last living Little Folk dies the following morning.', [littleFolkIntro, littleFolkDeath]),
  role(H.ghost, 'Ghost', FACTION.spirit, ['Status', 'Spirit', 'Voting'], [TRAIT.spirit], 'A moderator-assigned Spirit that can force one player onto the Ballot.', 'After a death the moderator may assign Ghost. It wins with Shadow if its living role was burned or Assassin-killed; otherwise with Human.', [day(`${H.ghost}.signal`, 'Ghost signal', 15, { label: 'Player to put on the Ballot', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, allowNone: true }, [{ type: 'forceBallot', targets: { kind: 'chosen' } }], 'Record the Ghost’s nomination signal, if any.')], [], 1, [{ id: 'wherewolf.hidden-motives.status.spirit', name: 'Ghost', data: { shadowDeathCauses: ['Burned', 'Assassin'] } }]),
  role(H.presence, 'Presence', FACTION.spirit, ['Status', 'Spirit', 'Voting'], [TRAIT.spirit], 'A moderator-assigned Spirit that can add votes.', 'After a death the moderator may assign Presence. It wins with Shadow if its living role was Corrupt; otherwise with Human.', [
    day(`${H.presence}.nomination`, 'Presence nomination vote', 16, { label: 'Use an additional nomination vote', min: 0, max: 1, selector: { kind: 'self' }, allowNone: true }, [{ type: 'grantExtraVotes', amount: 1, vote: 'nomination' }], 'Select the Presence if it casts an additional nomination vote.'),
    day(`${H.presence}.ballot`, 'Presence Ballot vote', 46, { label: 'Use an additional Ballot vote', min: 0, max: 1, selector: { kind: 'self' }, allowNone: true }, [{ type: 'grantExtraVotes', amount: 1, vote: 'ballot' }], 'Select the Presence if it casts an additional Ballot vote.'),
  ], [], 1, [{ id: 'wherewolf.hidden-motives.status.spirit', name: 'Presence', data: { winnerFromCorrupt: true } }]),
  role(H.spectre, 'Spectre', FACTION.anyShadow, ['Status', 'Spirit', 'Voting'], [TRAIT.spirit, TRAIT.anyShadowWinner], 'A Shadow Spirit that adds votes based on the number of Spirits.', 'After a death the moderator may assign Spectre. It cannot act while Medium lives and wins with any Shadow faction.', [day(`${H.spectre}.signal`, 'Spectre signal', 47, { label: 'Ballot candidate', min: 0, max: 1, selector: { kind: 'allPlayers', life: 'alive' }, allowNone: true }, [{ type: 'addStatus', targets: { kind: 'chosen' }, status: { id: 'wherewolf.hidden-motives.status.spectre-votes', name: 'Spectre votes', abilities: [{ id: 'wherewolf.hidden-motives.status.spectre-votes.tally', name: 'Spirit votes', kind: 'status', trigger: 'vote.beforeTally', condition: { op: 'targetIsSelf' }, effects: [{ type: 'modifyVotesReceived', targets: { kind: 'self' }, operation: 'add', value: { count: { kind: 'trait', trait: TRAIT.spirit, life: 'any' }, add: 1 } }] }] }, duration: 'day' }], 'If Medium is dead, record the Spectre’s Ballot signal.')], [], 1, [{ id: 'wherewolf.hidden-motives.status.spirit', name: 'Spectre', data: { winningAlignment: 'shadow', cannotVoteWhileRoleAlive: ROLE.medium } }]),
]

export const DARKEST_NIGHT_PACK: PackDefinition = withChecksum({
  id: DARKEST_PACK_ID,
  meta: { kind: 'pack', namespace: 'wherewolf.darkest-night', uuid: '40000000-0000-4000-8000-000000000001', name: 'Darkest Night', version: '1.0.0', schemaVersion: 1, engineVersion: 'wherewolf.rules/v1', checksum: '', builtIn: true },
  description: 'The official Darkest Night expansion. Minion and Thrall are created roles and are not dealt.', roleIds: DARKEST_NIGHT_ROLES.map((entry) => entry.id), roles: DARKEST_NIGHT_ROLES,
})

export const HIDDEN_MOTIVES_PACK: PackDefinition = withChecksum({
  id: HIDDEN_PACK_ID,
  meta: { kind: 'pack', namespace: 'wherewolf.hidden-motives', uuid: '40000000-0000-4000-8000-000000000002', name: 'Hidden Motives', version: '1.0.0', schemaVersion: 1, engineVersion: 'wherewolf.rules/v1', checksum: '', builtIn: true },
  description: 'The official Hidden Motives expansion. Ghost, Presence, and Spectre are moderator-assigned Spirits and are not dealt.', roleIds: HIDDEN_MOTIVES_ROLES.map((entry) => entry.id), roles: HIDDEN_MOTIVES_ROLES,
})

const allRoles = [...BASE_PACK.roles, ...DARKEST_NIGHT_ROLES, ...HIDDEN_MOTIVES_ROLES]
const setupIds = allRoles.flatMap((entry) => entry.abilities.filter((ability) => ability.trigger === 'setup.action').map((ability) => ability.id))
const nominationActions = [
  'wherewolf.darkest-night.status.gun.fire', `${H.ghost}.signal`, `${H.presence}.nomination`, `${H.lawyer}.signal`,
]
const ballotActions = [`${H.executioner}.signal`, `${H.mayor}.signal`, `${H.preacher}.protect`, `${H.presence}.ballot`, `${H.spectre}.signal`]

export const OFFICIAL_SCENARIO: ScenarioDefinition = withChecksum({
  id: OFFICIAL_SCENARIO_ID,
  meta: { kind: 'scenario', namespace: 'wherewolf.official', uuid: '50000000-0000-4000-8000-000000000001', name: 'Official Game', version: '1.0.0', schemaVersion: 1, engineVersion: 'wherewolf.rules/v1', checksum: '', builtIn: true },
  description: 'Base Game with optional Darkest Night and Hidden Motives packs.',
  factions: [
    { id: FACTION.village, name: 'Village', colour: '#d8c594', alignment: 'human' }, { id: FACTION.wolves, name: 'Wolf Pack', colour: '#b64d46', alignment: 'shadow' },
    { id: FACTION.loneWolf, name: 'Lone Wolf', colour: '#984a49', alignment: 'shadow' }, { id: FACTION.vampire, name: 'Vampire', colour: '#772f49', alignment: 'shadow' },
    { id: FACTION.nosferatu, name: 'Nosferatu', colour: '#5f405e', alignment: 'shadow' }, { id: FACTION.necromancer, name: 'Necromancer', colour: '#66507a', alignment: 'shadow' },
    { id: FACTION.possessed, name: 'Possessed', colour: '#73576c', alignment: 'shadow' }, { id: FACTION.inquisition, name: 'Inquisition', colour: '#b48a4c', alignment: 'human' },
    { id: FACTION.criminals, name: 'Criminals', colour: '#706b66', alignment: 'human' }, { id: FACTION.city, name: 'City', colour: '#537e8d', alignment: 'human' },
    { id: FACTION.neutral, name: 'Neutral', colour: '#938f84', alignment: 'neutral' }, { id: FACTION.lovers, name: 'Lovers', colour: '#c66d8c', alignment: 'neutral' },
    { id: FACTION.anyHuman, name: 'Any Human', colour: '#759175', alignment: 'human' }, { id: FACTION.anyShadow, name: 'Any Shadow', colour: '#77566d', alignment: 'shadow' },
    { id: FACTION.undeadSupport, name: 'Undead support', colour: '#766783', alignment: 'shadow' }, { id: FACTION.spirit, name: 'Spirit', colour: '#8d83ae', alignment: 'neutral' },
  ],
  capabilities: ['private-information', 'public-role-ranges', 'hidden-setup-state', 'shadow-attacks', 'revival', 'aggregate-voting', 'announcements', 'relationships', 'personal-victory', 'transformations', 'spirits', 'crusades'],
  defaultPackIds: [PACK_ID], packs: [BASE_PACK, DARKEST_NIGHT_PACK, HIDDEN_MOTIVES_PACK], roleOverrides: {},
  setupPipeline: [{ id: 'official.setup.actions', type: 'role-actions', label: 'First night', trigger: 'setup.action', abilityIds: setupIds }, { id: 'official.setup.complete', type: 'cycle-end', label: 'Finish setup' }],
  cyclePipeline: [
    { id: 'official.day.discussion', type: 'pause', label: 'Day discussion', message: 'Continue when the table is ready for daytime actions and voting.' },
    { id: 'official.day.nomination-actions', type: 'role-actions', label: 'Before the first vote', trigger: 'day.action', abilityIds: nominationActions },
    { id: 'official.day.nomination-vote', type: 'aggregate-vote', label: 'First vote', vote: 'nomination', eligible: 'alive' },
    { id: 'official.day.qualify', type: 'qualification', label: 'Create the Ballot', source: 'nomination', rule: 'highest-and-second' },
    { id: 'official.day.ballot-actions', type: 'role-actions', label: 'Before the Ballot vote', trigger: 'day.action', abilityIds: ballotActions },
    { id: 'official.day.ballot-vote', type: 'aggregate-vote', label: 'Ballot vote', vote: 'ballot', eligible: 'alive-except-candidates', allowCandidateWithTrait: TRAIT.ballotVoter },
    { id: 'official.day.burn', type: 'burn-resolution', label: 'Burn outcome', rule: 'unique-highest' },
    { id: 'official.night.actions', type: 'role-actions', label: 'Night actions', trigger: 'night.action', dependencyBarrier: 'before-attack-resolution' },
    { id: 'official.night.attacks', type: 'attack-resolution', label: 'Night attacks', attackType: 'shadow' },
    { id: 'official.night.after-attacks', type: 'role-actions', label: 'After attacks', trigger: 'night.action', dependencyBarrier: 'after-attack-resolution' },
    { id: 'official.morning.victory', type: 'victory-check', label: 'Check victory' },
    { id: 'official.morning.news', type: 'announcements', label: 'Morning announcements', categories: ['Deaths', 'Newsgiver', 'Crusades', 'Ritual'] },
    { id: 'official.cycle.end', type: 'cycle-end', label: 'Begin next day' },
  ],
  victoryRules: [
    { id: 'official.victory.lovers', type: 'relationship-final-pair', relationship: 'wherewolf.base.relationship.romeo', faction: FACTION.lovers, priority: 5 },
    { id: 'official.victory.humans', type: 'faction-eliminated', winningFaction: FACTION.village, eliminatedTrait: TRAIT.shadow, excludedFactions: [FACTION.lovers], priority: 20 },
    { id: 'official.victory.wolves', type: 'parity', winningFaction: FACTION.wolves, countingTrait: TRAIT.werewolf, priority: 30 },
    { id: 'official.victory.lone-wolf', type: 'parity', winningFaction: FACTION.loneWolf, countingTrait: TRAIT.shadow, priority: 31 },
    { id: 'official.victory.vampire', type: 'parity', winningFaction: FACTION.vampire, countingTrait: TRAIT.shadow, priority: 32 },
    { id: 'official.victory.nosferatu', type: 'parity', winningFaction: FACTION.nosferatu, countingTrait: TRAIT.shadow, priority: 33 },
    { id: 'official.victory.possessed', type: 'parity', winningFaction: FACTION.possessed, countingTrait: TRAIT.shadow, priority: 34 },
  ],
  nightOrder: [
    `${D.amnesiac}.remember`, `${D.sensitive}.check`, `${ROLE.clairvoyant}.check`, `${ROLE.wizard}.check`, `${ROLE.medium}.check`, `${ROLE.medium}.spirit-check`,
    `${H.thief}.interrupt`, `${H.assassin}.kill`, `${H.guildMaster}.recruit`, `${D.gunsmith}.give`, `${D.vampire}.bite`, `${D.shapeshifter}.turn`, `${ROLE.witch}.protect`,
    'wherewolf.base.ability.wolf-bite', `${D.loneWolf}.bite`, `${D.necromancer}.ritual`, `${ROLE.healer}.revive`, `${D.nosferatu}.raise`,
  ],
  dependencyBarriers: [
    { before: `${ROLE.witch}.protect`, after: 'wherewolf.base.ability.wolf-bite', reason: 'Protection is applied before shadow attacks.' },
    { before: 'wherewolf.base.ability.wolf-bite', after: `${ROLE.healer}.revive`, reason: 'Revival happens only after attack deaths are known.' },
    { before: 'wherewolf.base.ability.wolf-bite', after: `${D.nosferatu}.raise`, reason: 'Nosferatu chooses from that night’s victims.' },
  ],
})

export const EXPANSION_BUILT_INS = [DARKEST_NIGHT_PACK, HIDDEN_MOTIVES_PACK, OFFICIAL_SCENARIO]
