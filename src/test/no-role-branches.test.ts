import { describe, expect, it } from 'vitest'
import engineSource from '../engine/engine.ts?raw'

describe('data-driven conformance', () => {
  it('contains no built-in role-name branches in the authoritative engine', () => {
    for (const roleName of ['Witch', 'Guardian Angel', 'Seducer', 'Jester', 'Farmer', 'Wolf Pup', 'Healer', 'Defector', 'Juliet', 'Romeo', 'Alpha Wolf', 'Pack Wolf']) {
      expect(engineSource).not.toContain(roleName)
    }
  })
})
