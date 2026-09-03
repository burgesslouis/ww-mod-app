import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Workbox } from 'workbox-window'
import App from '../App'
import { createAppUpdater } from '../pwa/updates'

vi.mock('../storage/db', () => ({
  seedBuiltIns: vi.fn(async () => {}), listArtifacts: vi.fn(async () => []),
  listSessions: vi.fn(async () => []), saveSession: vi.fn(async () => {}),
}))

function fixture() {
  const callbacks = new Map<string, (event: { isUpdate?: boolean; isExternal?: boolean }) => void>()
  const registration = { waiting: {} as ServiceWorker | null }
  const worker = {
    addEventListener: vi.fn((type: string, callback: (event: { isUpdate?: boolean; isExternal?: boolean }) => void) => callbacks.set(type, callback)),
    register: vi.fn(async () => registration as ServiceWorkerRegistration),
    messageSkipWaiting: vi.fn(),
  }
  const reload = vi.fn(), updater = createAppUpdater(() => worker as unknown as Workbox, reload)
  const emit = (type: string, event = { isUpdate: true }) => callbacks.get(type)?.(event)
  return { worker, registration, reload, updater, emit }
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('Explicit app updates', () => {
  it('registers once and does not reload or offer an update on first installation', async () => {
    const f = fixture(); f.registration.waiting = null
    await Promise.all([f.updater.start(), f.updater.start()])
    f.emit('controlling', { isUpdate: false })
    expect(f.worker.register).toHaveBeenCalledTimes(1)
    expect(f.updater.getSnapshot().available).toBe(false)
    expect(f.reload).not.toHaveBeenCalled()
  })
  it('remembers a waiting update without applying or reloading it', async () => {
    const f = fixture(); f.registration.waiting = null
    await f.updater.start()
    f.emit('waiting')
    expect(f.updater.getSnapshot()).toEqual({ available: true, applying: false, error: '' })
    expect(f.worker.messageSkipWaiting).not.toHaveBeenCalled()
    expect(f.reload).not.toHaveBeenCalled()
  })
  it('applies once after consent and reloads only when the new worker controls the page', async () => {
    const f = fixture(); await f.updater.start()
    f.updater.apply(); f.updater.apply()
    expect(f.worker.messageSkipWaiting).toHaveBeenCalledTimes(1)
    expect(f.updater.getSnapshot().applying).toBe(true)
    expect(f.reload).not.toHaveBeenCalled()
    f.emit('controlling'); f.emit('controlling')
    expect(f.reload).toHaveBeenCalledTimes(1)
  })
  it('does not reload when another tab activates an update, until this tab consents', async () => {
    const f = fixture(); await f.updater.start()
    f.registration.waiting = null
    f.emit('controlling')
    expect(f.reload).not.toHaveBeenCalled()
    f.updater.apply()
    expect(f.worker.messageSkipWaiting).not.toHaveBeenCalled()
    expect(f.reload).toHaveBeenCalledTimes(1)
  })
  it('does nothing if no update is available', async () => {
    const f = fixture(); f.registration.waiting = null; await f.updater.start()
    f.updater.apply()
    expect(f.worker.messageSkipWaiting).not.toHaveBeenCalled()
    expect(f.reload).not.toHaveBeenCalled()
  })
  it('allows retry after a failed update request', async () => {
    const f = fixture(); await f.updater.start()
    f.worker.messageSkipWaiting.mockImplementationOnce(() => { throw new Error('Unavailable') })
    f.updater.apply()
    expect(f.updater.getSnapshot()).toMatchObject({ available: true, applying: false, error: expect.any(String) })
    expect(f.updater.getSnapshot().error).not.toBe('')
    f.updater.apply(); f.emit('controlling')
    expect(f.reload).toHaveBeenCalledTimes(1)
  })
  it('unlocks navigation after a timeout and does not reload on late activation', async () => {
    vi.useFakeTimers()
    const f = fixture(); await f.updater.start()
    f.updater.apply(); vi.advanceTimersByTime(15000)
    expect(f.updater.getSnapshot().applying).toBe(false)
    expect(f.updater.getSnapshot().error).not.toBe('')
    f.emit('controlling')
    expect(f.reload).not.toHaveBeenCalled()
  })
  it('does not crash the app when registration fails', async () => {
    const f = fixture(); f.worker.register.mockRejectedValueOnce(new Error('Offline'))
    await expect(f.updater.start()).resolves.toBeUndefined()
    expect(f.updater.getSnapshot().available).toBe(false)
  })
  it('keeps setup inputs when an update arrives and only offers it on Home', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const f = fixture(); f.registration.waiting = null; await f.updater.start()
    render(<App updater={f.updater} />)
    fireEvent.click(await screen.findByRole('button', { name: /^New game$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }))
    fireEvent.change(screen.getByLabelText('Player 1 name'), { target: { value: 'Keep this name' } })
    act(() => f.emit('waiting'))
    expect(screen.getByLabelText('Player 1 name')).toHaveValue('Keep this name')
    expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Wherewolf home' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Update now' }))
    expect(f.reload).toHaveBeenCalledTimes(1)
  })
  it('blocks entering setup while an accepted update is applying', async () => {
    const f = fixture(); await f.updater.start()
    render(<App updater={f.updater} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Update now' }))
    expect(screen.getByRole('button', { name: /^New game$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^New$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Updating…' })).toBeDisabled()
    act(() => f.emit('controlling'))
  })
})
