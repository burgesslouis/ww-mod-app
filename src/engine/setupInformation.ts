import type { GameSetup, RoleDefinition, ScenarioDefinition } from '../domain/types'

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
