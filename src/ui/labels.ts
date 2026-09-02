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
  return known[key] ?? technicalLabel(raw)
}
