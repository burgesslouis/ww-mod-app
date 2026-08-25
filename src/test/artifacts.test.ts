import { describe, expect, it } from 'vitest'
import { BASE_PACK, BASE_ROLES } from '../data/base'
import { checksum, forkArtifact, parseArtifact, previewImport, stableStringify, withChecksum } from '../domain/artifacts'
import { runRoleTestBench } from '../engine/engine'

describe('Portable artifacts', () => {
  it('round-trips a readable role with a valid checksum', () => {
    const role = BASE_ROLES[0]
    const parsed = parseArtifact(JSON.stringify(role, null, 2))
    expect(parsed.meta.kind).toBe('role')
    expect(checksum(parsed)).toBe(role.meta.checksum)
    expect(stableStringify(parsed)).toContain('wherewolf.base.ability.wolf-bite')
    if (!('faction' in parsed)) throw new Error('Expected role')
    expect(parsed.traitDefinitions?.find((trait) => trait.id === 'wherewolf.base.trait.werewolf')).toMatchObject({ label: 'Werewolf', colour: '#a94f4b' })
  })

  it('deduplicates identical versions and forks conflicting content', () => {
    expect(previewImport(JSON.stringify(BASE_PACK), [BASE_PACK]).status).toBe('identical')
    const conflict = structuredClone(BASE_PACK); conflict.description = 'Different content'; conflict.meta.checksum = checksum(conflict)
    const preview = previewImport(JSON.stringify(conflict), [BASE_PACK])
    expect(preview.status).toBe('fork')
    const fork = forkArtifact(conflict)
    expect(fork.meta.forkedFrom?.uuid).toBe(BASE_PACK.meta.uuid)
    expect(fork.meta.namespace).not.toBe(BASE_PACK.meta.namespace)
    expect(fork.id).not.toBe(BASE_PACK.id)
  })

  it('retains unsupported engine versions as unavailable with an explanation', () => {
    const unsupported = structuredClone(BASE_PACK)
    unsupported.meta.engineVersion = 'future.rules/v9' as typeof unsupported.meta.engineVersion
    unsupported.meta.checksum = checksum(unsupported)
    const preview = previewImport(JSON.stringify(unsupported), [])
    expect(preview.status).toBe('unsupported')
    expect(preview.issues.join(' ')).toContain('future.rules/v9')
  })

  it('cloned, exported and imported built-ins retain behavior without engine changes', () => {
    const original = BASE_ROLES.find((role) => role.meta.name === 'Guardian Angel')!
    const clone = forkArtifact(original)
    clone.meta.name = 'Guardian Copy'
    const imported = parseArtifact(JSON.stringify(withChecksum(clone)))
    if (!('faction' in imported)) throw new Error('Expected role')
    const originalTrace = runRoleTestBench(original, 'attack.successful').trace.flatMap((entry) => entry.effects ?? [])
    const importedTrace = runRoleTestBench(imported, 'attack.successful').trace.flatMap((entry) => entry.effects ?? [])
    expect(importedTrace).toEqual(originalTrace)
  })
})
