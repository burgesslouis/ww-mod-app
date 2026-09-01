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
