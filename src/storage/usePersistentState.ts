import { useCallback, useEffect, useState } from 'react'
import type { GameSession } from '../domain/types'
import { listSessions, saveSession, seedBuiltIns } from './db'

export function useSessions() {
  const [sessions, setSessions] = useState<GameSession[]>([])
  const [ready, setReady] = useState(false)
  const refresh = useCallback(async () => { setSessions(await listSessions()) }, [])
  useEffect(() => { seedBuiltIns().then(refresh).finally(() => setReady(true)) }, [refresh])
  const persist = useCallback(async (session: GameSession) => { await saveSession(session); await refresh() }, [refresh])
  return { sessions, ready, refresh, persist }
}
