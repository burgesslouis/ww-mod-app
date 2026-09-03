import { Workbox } from 'workbox-window'

export interface UpdateState { available: boolean; applying: boolean; error: string }
type UpdateWorker = Pick<Workbox, 'addEventListener' | 'register' | 'messageSkipWaiting'>

/** Download updates in the background, but reload only the tab that consents. */
export function createAppUpdater(
  createWorker: () => UpdateWorker = () => new Workbox(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }),
  reload: () => void = () => window.location.reload(),
) {
  let state: UpdateState = { available: false, applying: false, error: '' }
  const listeners = new Set<() => void>()
  let worker: UpdateWorker | undefined
  let registration: ServiceWorkerRegistration | undefined
  let starting: Promise<void> | undefined
  let reloadRequested = false
  let timeout: ReturnType<typeof setTimeout> | undefined

  function change(patch: Partial<UpdateState>) {
    state = { ...state, ...patch }
    listeners.forEach(listener => listener())
  }
  function fail() {
    clearTimeout(timeout)
    reloadRequested = false
    change({ applying: false, error: 'The update could not finish. Please try again.' })
  }
  function reloadOnce() {
    if (!reloadRequested) return
    reloadRequested = false
    clearTimeout(timeout)
    reload()
  }
  function start() {
    if (starting) return starting
    starting = (async () => {
      try {
        worker = createWorker()
        worker.addEventListener('waiting', () => change({ available: true, error: '' }))
        worker.addEventListener('controlling', event => {
          if (reloadRequested) reloadOnce()
          else if (event.isUpdate || event.isExternal) change({ available: true, error: '' })
        })
        registration = await worker.register({ immediate: true })
        if (registration?.waiting) change({ available: true, error: '' })
      } catch {
        // An unavailable update service must not prevent offline moderation.
        if (state.applying) fail()
      }
    })()
    return starting
  }
  function apply() {
    if (!state.available || state.applying) return
    change({ applying: true, error: '' })
    reloadRequested = true
    try {
      if (registration?.waiting && worker) {
        timeout = setTimeout(fail, 15000)
        worker.messageSkipWaiting()
      } else {
        // Another tab may have activated the update. This tab still needs consent.
        reloadOnce()
      }
    } catch { fail() }
  }
  return {
    start, apply,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

export type AppUpdater = ReturnType<typeof createAppUpdater>
export const appUpdater = createAppUpdater()
