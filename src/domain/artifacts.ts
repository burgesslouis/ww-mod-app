import { z } from 'zod'
import type { ArtifactMeta, ImportPreview, PackDefinition, RoleDefinition, ScenarioDefinition } from './types'

export const ENGINE_VERSION = 'wherewolf.rules/v1' as const

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'checksum')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function checksum(value: unknown): string {
  const text = stableStringify(value)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function withChecksum<T extends { meta: ArtifactMeta }>(artifact: T): T {
  const copy = structuredClone(artifact)
  copy.meta.checksum = checksum(copy)
  return copy
}

const metaSchema = z.object({
  kind: z.enum(['role', 'pack', 'scenario']), namespace: z.string().min(1), uuid: z.string().min(8),
  name: z.string().min(1), version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/),
  schemaVersion: z.number(), engineVersion: z.string(), checksum: z.string().min(1),
  builtIn: z.boolean().optional(), forkedFrom: z.object({ namespace: z.string(), uuid: z.string(), version: z.string() }).optional(),
  unavailableReasons: z.array(z.string()).optional(),
})

const roleLooseSchema = z.object({ id: z.string(), meta: metaSchema.extend({ kind: z.literal('role') }), faction: z.string(), categories: z.array(z.string()), traits: z.array(z.string()), traitDefinitions: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), colour: z.string().regex(/^#[0-9a-fA-F]{6}$/), description: z.string().optional(), builtIn: z.boolean().optional() })).optional(), text: z.object({ summary: z.string(), description: z.string(), moderatorNotes: z.string().optional() }), constants: z.array(z.unknown()), state: z.array(z.unknown()), requirements: z.array(z.string()), abilities: z.array(z.unknown()) }).passthrough()
const packLooseSchema = z.object({ id: z.string(), meta: metaSchema.extend({ kind: z.literal('pack') }), description: z.string(), roleIds: z.array(z.string()), roles: z.array(roleLooseSchema) }).passthrough()
const scenarioLooseSchema = z.object({ id: z.string(), meta: metaSchema.extend({ kind: z.literal('scenario') }), description: z.string(), factions: z.array(z.unknown()), capabilities: z.array(z.string()), defaultPackIds: z.array(z.string()), packs: z.array(packLooseSchema), setupPipeline: z.array(z.unknown()), cyclePipeline: z.array(z.unknown()), victoryRules: z.array(z.unknown()) }).passthrough()

export function parseArtifact(input: string): RoleDefinition | PackDefinition | ScenarioDefinition {
  const raw: unknown = JSON.parse(input)
  const kind = (raw as { meta?: { kind?: string } })?.meta?.kind
  const parsed = kind === 'role' ? roleLooseSchema.parse(raw) : kind === 'pack' ? packLooseSchema.parse(raw) : kind === 'scenario' ? scenarioLooseSchema.parse(raw) : (() => { throw new Error('This file is not a Wherewolf role, pack, or scenario.') })()
  return parsed as unknown as RoleDefinition | PackDefinition | ScenarioDefinition
}

export function previewImport(input: string, installed: Array<RoleDefinition | PackDefinition | ScenarioDefinition>): ImportPreview {
  let artifact: RoleDefinition | PackDefinition | ScenarioDefinition
  try { artifact = parseArtifact(input) } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Invalid artifact')
  }
  const issues: string[] = []
  if (artifact.meta.engineVersion !== ENGINE_VERSION) issues.push(`Requires ${artifact.meta.engineVersion}; this app supports ${ENGINE_VERSION}.`)
  if (artifact.meta.schemaVersion !== 1) issues.push(`Requires artifact schema ${artifact.meta.schemaVersion}; this app supports schema 1.`)
  if (checksum(artifact) !== artifact.meta.checksum) issues.push('Checksum does not match the file contents.')
  const supportedEffects = new Set(['inspectTrait', 'inspectFaction', 'learnRolesAbsent', 'learnRoleIdentity', 'learnRolePresence', 'learnFactionMembers', 'addStatus', 'removeStatus', 'preventEvent', 'redirectEvent', 'queueAttack', 'kill', 'revive', 'transformRole', 'changeFaction', 'linkRelationship', 'modifyVotesReceived', 'replaceQualifiedCandidate', 'allowCandidateVote', 'announce', 'setState', 'incrementState', 'personalWin', 'cancelNext', 'noop'])
  const supportedPhases = new Set(['role-actions', 'pause', 'aggregate-vote', 'qualification', 'burn-resolution', 'attack-resolution', 'announcements', 'victory-check', 'cycle-end'])
  const embeddedRoles = 'faction' in artifact ? [artifact] : 'roles' in artifact ? artifact.roles : artifact.packs.flatMap((pack) => pack.roles)
  const effectTypes = embeddedRoles.flatMap((role) => role.abilities.flatMap((ability) => ability.effects.map((effect) => String((effect as { type?: unknown }).type))))
  for (const type of new Set(effectTypes)) if (!supportedEffects.has(type)) issues.push(`Unsupported effect primitive “${type}”.`)
  if ('packs' in artifact) for (const type of new Set([...artifact.setupPipeline, ...artifact.cyclePipeline].map((phase) => String((phase as { type?: unknown }).type)))) if (!supportedPhases.has(type)) issues.push(`Unsupported phase primitive “${type}”.`)
  const sameIdentity = installed.find((item) => item.meta.namespace === artifact.meta.namespace && item.meta.uuid === artifact.meta.uuid && item.meta.version === artifact.meta.version)
  const unsupported = issues.some((issue) => issue.startsWith('Requires') || issue.startsWith('Unsupported') || issue.startsWith('Checksum'))
  const status = unsupported ? 'unsupported' : sameIdentity?.meta.checksum === artifact.meta.checksum ? 'identical' : sameIdentity ? 'fork' : 'new'
  if (status === 'fork') issues.push('The same identity and version already exists with different content. It will be imported as a fork.')
  return { artifact, status, issues }
}

export function forkArtifact<T extends RoleDefinition | PackDefinition | ScenarioDefinition>(artifact: T): T {
  const copy = structuredClone(artifact)
  const oldId = copy.id
  copy.meta.forkedFrom = { namespace: artifact.meta.namespace, uuid: artifact.meta.uuid, version: artifact.meta.version }
  copy.meta.namespace = `local.${crypto.randomUUID().slice(0, 8)}`
  copy.meta.uuid = crypto.randomUUID()
  copy.id = `${copy.meta.namespace}.${copy.meta.kind}.${copy.meta.uuid}`
  copy.meta.name = `${artifact.meta.name} (fork)`
  copy.meta.builtIn = false
  delete copy.meta.unavailableReasons
  if ('faction' in copy) copy.abilities = copy.abilities.map((ability) => ({ ...ability, id: ability.id.startsWith(`${oldId}.`) ? `${copy.id}${ability.id.slice(oldId.length)}` : `${copy.id}.ability.${ability.id.split('.').at(-1)}` }))
  return withChecksum(copy)
}

export function exportFilename(meta: ArtifactMeta): string {
  const safe = meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${safe}.ww${meta.kind}.json`
}

export function downloadArtifact(artifact: RoleDefinition | PackDefinition | ScenarioDefinition): void {
  const payload = JSON.stringify(withChecksum(artifact), null, 2)
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = exportFilename(artifact.meta); link.click()
  URL.revokeObjectURL(url)
}
