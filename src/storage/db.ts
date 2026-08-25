import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { BASE_PACK, BASE_SCENARIO } from '../data/base'
import { DARKEST_NIGHT_PACK, HIDDEN_MOTIVES_PACK, OFFICIAL_SCENARIO } from '../data/expansions'
import type { GameSession, PackDefinition, RoleDefinition, ScenarioDefinition } from '../domain/types'

type Artifact = RoleDefinition | PackDefinition | ScenarioDefinition
interface WherewolfDB extends DBSchema {
  artifacts: { key: string; value: Artifact; indexes: { 'by-kind': string } }
  drafts: { key: string; value: { id: string; kind: string; updatedAt: string; value: unknown } }
  sessions: { key: string; value: GameSession; indexes: { 'by-updated': string } }
  settings: { key: string; value: unknown }
}

let database: Promise<IDBPDatabase<WherewolfDB>> | undefined

function getDatabase() {
  if (!database) database = openDB<WherewolfDB>('wherewolf-moderator', 2, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const artifacts = db.createObjectStore('artifacts', { keyPath: 'id' })
        artifacts.createIndex('by-kind', 'meta.kind')
        db.createObjectStore('drafts', { keyPath: 'id' })
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
        sessions.createIndex('by-updated', 'updatedAt')
        db.createObjectStore('settings')
      }
      if (oldVersion < 2) transaction.objectStore('settings').put(2, 'schemaVersion')
    },
  })
  return database
}

export async function seedBuiltIns(): Promise<void> {
  const db = await getDatabase()
  const tx = db.transaction('artifacts', 'readwrite')
  await Promise.all([tx.store.put(BASE_PACK), tx.store.put(BASE_SCENARIO), tx.store.put(DARKEST_NIGHT_PACK), tx.store.put(HIDDEN_MOTIVES_PACK), tx.store.put(OFFICIAL_SCENARIO), tx.done])
}

export async function listArtifacts(): Promise<Artifact[]> { return (await getDatabase()).getAll('artifacts') }
export async function saveArtifact(artifact: Artifact): Promise<void> { await (await getDatabase()).put('artifacts', artifact) }
export async function deleteArtifact(id: string): Promise<void> {
  const artifact = await (await getDatabase()).get('artifacts', id)
  if (artifact?.meta.builtIn) throw new Error('Built-in definitions are immutable. Clone one to edit it.')
  await (await getDatabase()).delete('artifacts', id)
}

export async function saveDraft(id: string, kind: string, value: unknown): Promise<void> {
  await (await getDatabase()).put('drafts', { id, kind, value, updatedAt: new Date().toISOString() })
}
export async function loadDraft(id: string) { return (await getDatabase()).get('drafts', id) }

export async function saveSession(session: GameSession): Promise<void> { await (await getDatabase()).put('sessions', session) }
export async function loadSession(id: string): Promise<GameSession | undefined> { return (await getDatabase()).get('sessions', id) }
export async function listSessions(): Promise<GameSession[]> {
  const sessions = await (await getDatabase()).getAllFromIndex('sessions', 'by-updated')
  return sessions.reverse()
}
export async function deleteSession(id: string): Promise<void> { await (await getDatabase()).delete('sessions', id) }

export async function exportBackup(): Promise<string> {
  const [artifacts, sessions] = await Promise.all([listArtifacts(), listSessions()])
  return JSON.stringify({ format: 'wherewolf-backup/v1', exportedAt: new Date().toISOString(), artifacts, sessions }, null, 2)
}
