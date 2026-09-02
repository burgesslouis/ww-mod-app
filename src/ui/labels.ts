import { TRAIT } from '../domain/ids'
import type { RoleDefinition, TraitDefinition } from '../domain/types'

export function capitaliseLabel(value: string): string {
  const label = value.trim()
  return label ? label[0].toUpperCase() + label.slice(1) : label
}

export function technicalLabel(value: string): string {
  const label = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .trim()
    .toLocaleLowerCase()
  return capitaliseLabel(label).replace(/\bn(\d+)\b/gi, 'N$1')
}

/** Moderator-facing names for the common faction references used by role definitions. */
export function friendlyFactionLabel(value: string): string {
  const raw = value.trim()
  const key = raw.split('.').at(-1)?.toLowerCase() ?? raw.toLowerCase()
  const known: Record<string, string> = {
    village: 'Village',
    wolves: 'Wolf Pack',
    neutral: 'Third Party',
    'any-shadow': 'Shadow',
    'any-human': 'Human',
  }
  return known[key] ?? technicalLabel(key).replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

export function roleTeamLabel(role: RoleDefinition, factionName?: string): string {
  const label = role.displayTeam?.trim() || factionName || friendlyFactionLabel(role.faction)
  return label === 'Neutral' ? 'Third Party' : label === 'Any Shadow' ? 'Shadow' : label === 'Any Human' ? 'Human' : label
}

export function moderatorTraits(ids: string[], catalogue: TraitDefinition[]): TraitDefinition[] {
  return [TRAIT.corrupt, TRAIT.mystic].filter((id) => ids.includes(id)).map((id) => ({
    id, colour: id === TRAIT.corrupt ? '#a94f4b' : '#8273a8',
    ...catalogue.find((trait) => trait.id === id),
    label: id === TRAIT.corrupt ? 'Corrupt' : 'Mystic',
  }))
}

/** Make the setup-night prefix unambiguous in moderator-facing action titles. */
export function displayActionLabel(value: string): string {
  return value.replace(/^N0(?=\s|$)/, 'Night 0')
}
