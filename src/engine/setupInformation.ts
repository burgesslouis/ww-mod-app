import type { GameSetup, PublicRequirements, RoleDefinition, ScenarioDefinition } from '../domain/types'

export function publicRequirementsMet(requirements: PublicRequirements | undefined, setup: Pick<GameSetup, 'packIds' | 'publicRoles'>, roles: RoleDefinition[]): boolean {
  if (!requirements?.requirements.length) return true
  const possibleRoleIds = new Set(setup.publicRoles.filter(range => range.max > 0).map(range => range.roleId))
  const possibleRoles = roles.filter(role => possibleRoleIds.has(role.id))
  const matches = requirements.requirements.map(requirement => {
    if (requirement.kind === 'packSelected') return setup.packIds.includes(requirement.packId)
    if (requirement.kind === 'rolePossible') return possibleRoleIds.has(requirement.roleId)
    if (requirement.kind === 'factionPossible') return possibleRoles.some(role => role.faction === requirement.faction)
    return possibleRoles.some(role => role.traits.includes(requirement.trait))
  })
  return requirements.match === 'any' ? matches.some(Boolean) : matches.every(Boolean)
}

export interface SpokenTurnBlocker {
  roleId: string
  roleName: string
  abilityId: string
  abilityName: string
  anchorAbilityIds: string[]
}

export function possibleAbilityDefinitions(setup: Pick<GameSetup, 'packIds' | 'publicRoles'>, roles: RoleDefinition[], trigger: 'setup.action' | 'day.action' | 'night.action') {
  const possibleRoleIds = new Set(setup.publicRoles.filter(range => range.max > 0).map(range => range.roleId))
  return roles.filter(role => possibleRoleIds.has(role.id)).flatMap(role => role.abilities
    .filter(ability => ability.trigger === trigger && (ability.kind === 'active' || ability.kind === 'shared-faction'))
    .filter(ability => publicRequirementsMet(ability.publicRequirements, setup, roles))
    .map(ability => ({ role, ability })))
}

export function resolveTurnAnchorIds(ability: RoleDefinition['abilities'][number], setup: Pick<GameSetup, 'packIds' | 'publicRoles'>, roles: RoleDefinition[]): string[] {
  const dependency = ability.turnDependency
  if (!dependency) return []
  if (dependency.anchors.kind === 'abilityIds') {
    const possibleIds = new Set(possibleAbilityDefinitions(setup, roles, 'night.action').map(({ ability: candidate }) => candidate.id))
    return dependency.anchors.abilityIds.filter((id) => possibleIds.has(id))
  }
  const trait = dependency.anchors.kind === 'roleTrait' ? dependency.anchors.trait : undefined
  return trait ? possibleAbilityDefinitions(setup, roles, 'night.action')
    .filter(({ role }) => role.traits.includes(trait))
    .map(({ ability: candidate }) => candidate.id) : []
}

export function spokenTurnBlockers(setup: Pick<GameSetup, 'packIds' | 'publicRoles'>, roles: RoleDefinition[]): SpokenTurnBlocker[] {
  return possibleAbilityDefinitions(setup, roles, 'night.action')
    .filter(({ ability }) => ability.turnDependency?.requiresSpokenCall)
    .map(({ role, ability }) => ({ roleId: role.id, roleName: role.meta.name, abilityId: ability.id, abilityName: ability.name, anchorAbilityIds: resolveTurnAnchorIds(ability, setup, roles) }))
    .filter(entry => entry.anchorAbilityIds.length > 0)
}

/** Base scenario order plus any publicly possible night actions contributed by attached packs. */
export function publicNightOrder(setup: Pick<GameSetup, 'packIds' | 'publicRoles' | 'nightOrder'> & { rules?: GameSetup['rules'] }, roles: RoleDefinition[], standardNightOrder: string[] = setup.rules?.scenario.nightOrder ?? []): string[] {
  const base = [...(setup.nightOrder ?? standardNightOrder)]
  const known = new Set(base)
  const additions = new Map<string, number>()
  possibleAbilityDefinitions(setup, roles, 'night.action').forEach(({ ability }) => {
    if (!known.has(ability.id)) additions.set(ability.id, ability.order ?? 100)
  })
  return [...base, ...[...additions.entries()].sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0])).map(([id]) => id)]
}

/** Validate the part of the night order contributed by declarative turn dependencies. */
export function turnDependencyIssues(setup: GameSetup, roles: RoleDefinition[], standardNightOrder = setup.rules?.scenario.nightOrder ?? []): string[] {
  const order = publicNightOrder(setup, roles, standardNightOrder)
  const positions = new Map(order.map((id, index) => [id, index]))
  const possible = possibleAbilityDefinitions(setup, roles, 'night.action')
  const edges = new Map(order.map((id) => [id, new Set<string>()]))
  const indegree = new Map(order.map((id) => [id, 0]))
  const issues: string[] = []
  possible.forEach(({ ability }) => {
    const dependency = ability.turnDependency
    if (!dependency) return
    const anchors = resolveTurnAnchorIds(ability, setup, roles)
    if (!anchors.length) return
    if (!positions.has(ability.id)) issues.push(`${ability.name} is possible but missing from the selected night order.`)
    anchors.forEach((anchorId) => {
      if (!positions.has(anchorId)) {
        issues.push(`${ability.name} depends on an action that is missing from the selected night order.`)
        return
      }
      const before = dependency.placement === 'before' ? ability.id : anchorId
      const after = dependency.placement === 'before' ? anchorId : ability.id
      if (!edges.has(before) || !edges.has(after)) return
      const outgoing = edges.get(before)!
      if (outgoing.has(after)) return
      outgoing.add(after)
      indegree.set(after, (indegree.get(after) ?? 0) + 1)
    })
  })
  const ready = order.filter((id) => indegree.get(id) === 0)
  let visited = 0
  while (ready.length) {
    const id = ready.shift()!
    visited += 1
    edges.get(id)?.forEach((after) => {
      indegree.set(after, (indegree.get(after) ?? 1) - 1)
      if (indegree.get(after) === 0) ready.push(after)
    })
  }
  if (visited !== order.length) issues.push('The selected night order contains a cycle in its spoken-turn dependencies.')
  return [...new Set(issues)]
}

export function publiclyPossibleFactions(setup: Pick<GameSetup, 'packIds' | 'publicRoles'>, roles: RoleDefinition[]): string[] {
  const possibleRoleIds = new Set(setup.publicRoles.filter(range => range.max > 0).map(range => range.roleId))
  const possibleRoles = roles.filter(role => possibleRoleIds.has(role.id))
  const factions = new Set(possibleRoles.map(role => role.faction))
  possibleRoles.flatMap(role => role.factionRecommendations ?? [])
    .filter(recommendation => !recommendation.when || publicRequirementsMet(recommendation.when, setup, roles))
    .forEach(recommendation => factions.add(recommendation.faction))
  return [...factions]
}

export function absentRoleCandidates(setup: GameSetup, roles: RoleDefinition[]): string[] {
  const dealt = new Set(setup.exactDeck)
  const known = new Map(roles.map(role => [role.id, role]))
  return [...new Set(setup.publicRoles.filter(range => range.max > 0 && !dealt.has(range.roleId) && known.has(range.roleId) && !known.get(range.roleId)!.categories.includes('Status')).map(range => range.roleId))]
}

export function absentRoleRequirements(setup: GameSetup, roles: RoleDefinition[], scenario: ScenarioDefinition) {
  return roles.filter(role => setup.exactDeck.includes(role.id)).flatMap(role => role.abilities.flatMap(ability => {
    if (ability.trigger !== 'setup.action' || ability.kind !== 'active') return []
    const effects = ability.effects.filter(effect => effect.type === 'learnRolesAbsent')
    if (!effects.length) return []
    const minimum = Math.max(...effects.map(effect => {
      if (typeof effect.minimum === 'number') return effect.minimum
      const key = effect.minimum.constant
      return Number(scenario.roleOverrides[role.id]?.[key] ?? role.constants.find(constant => constant.key === key)?.default)
    }))
    return [{ roleId: role.id, abilityId: ability.id, roleName: role.meta.name, abilityName: ability.name, minimum }]
  }))
}

export function reconcileAbsentRoleSelections(setup: GameSetup, roles: RoleDefinition[], scenario: ScenarioDefinition): NonNullable<GameSetup['absentRoleSelections']> {
  const candidates = new Set(absentRoleCandidates(setup, roles))
  const next: NonNullable<GameSetup['absentRoleSelections']> = {}
  for (const requirement of absentRoleRequirements(setup, roles, scenario)) {
    const selected = setup.absentRoleSelections?.[requirement.roleId]?.[requirement.abilityId]
    if (selected) (next[requirement.roleId] ??= {})[requirement.abilityId] = [...new Set(selected.filter(id => candidates.has(id)))]
  }
  return next
}
