import { test, expect, type Page } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, sep, extname } from 'node:path'

// Serve two real worker versions on a fresh origin without touching a user's app.
async function releaseServer() {
  const root = fileURLToPath(new URL('../dist/', import.meta.url))
  let version = 1
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname
      const file = resolve(root, `.${path === '/' ? '/index.html' : path}`)
      if (!file.startsWith(resolve(root) + sep)) { response.writeHead(403).end(); return }
      let data: string | Buffer = await readFile(file)
      if (path === '/sw.js') data = `${data.toString()}\nself.addEventListener('message', event => { if (event.data === 'qa-version') event.ports[0].postMessage(${version}); });`
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test address')
  return {
    url: `http://127.0.0.1:${address.port}/`,
    update: () => { version++ },
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }),
  }
}

async function ready(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
  })
}
async function workerVersion(page: Page) {
  return page.evaluate(() => new Promise<number>(resolve => {
    const channel = new MessageChannel()
    channel.port1.onmessage = event => { resolve(event.data); channel.port1.close() }
    navigator.serviceWorker.controller!.postMessage('qa-version', [channel.port2])
  }))
}
async function findUpdate(page: Page) {
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update() })
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting))).toBe(true)
}

test('an arriving update and another tab accepting it do not reset New Game', async ({ page, context }, testInfo) => {
  const server = await releaseServer()
  try {
    await page.goto(server.url); await ready(page)
    await expect(page.getByRole('button', { name: 'Update now' })).toHaveCount(0)
    await page.getByRole('button', { name: /^new game$/i }).click()
    await page.getByRole('button', { name: /^continue$/i }).click()
    await page.getByLabel('Player 1 name').fill('Keep this player')
    const other = await context.newPage()
    await other.goto(server.url); await ready(other)
    let navigations = 0
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++ })
    server.update(); await findUpdate(other)
    await expect(other.getByRole('button', { name: 'Update now' })).toBeVisible()
    await expect(page.getByLabel('Player 1 name')).toHaveValue('Keep this player')
    await expect(page.getByRole('button', { name: 'Update now' })).toHaveCount(0)
    expect(await workerVersion(page)).toBe(1)
    expect(await other.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await other.evaluate(() => innerWidth))
    await other.screenshot({ path: testInfo.outputPath('update-notice.png'), fullPage: true })
    await Promise.all([other.waitForEvent('load'), other.getByRole('button', { name: 'Update now' }).click()])
    await expect.poll(() => workerVersion(page)).toBe(2)
    await expect(page.getByLabel('Player 1 name')).toHaveValue('Keep this player')
    expect(navigations).toBe(0)
    await page.getByRole('button', { name: 'Wherewolf home' }).click()
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Update now' }).click()])
    await expect(page.getByRole('button', { name: /^new game$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Update now' })).toHaveCount(0)
    expect(navigations).toBe(1)
  } finally { await server.close() }
})

test('an update waits through a game and can be accepted offline without losing the save', async ({ page, context }) => {
  const server = await releaseServer()
  try {
    await page.goto(server.url); await ready(page)
    await page.getByRole('button', { name: /^new game$/i }).click()
    await page.getByRole('button', { name: /^continue$/i }).click()
    for (let i = 0; i < 3; i++) await page.locator('.player-row .danger').last().click()
    for (let i = 1; i <= 3; i++) await page.getByLabel(`Player ${i} name`).fill(`Player ${i}`)
    await page.getByRole('button', { name: /^continue$/i }).click()
    await page.getByRole('button', { name: /clear all/i }).click()
    for (const name of ['Alpha Wolf', 'Healer', 'Sinner']) {
      const row = page.locator('.role-config-row').filter({ has: page.locator('.role-check strong').getByText(name, { exact: true }) })
      await row.locator('.role-check').click()
      await page.getByLabel(`${name} in play`, { exact: true }).check()
    }
    await page.getByRole('button', { name: /^continue$/i }).click()
    await page.getByRole('button', { name: /silent night/i }).click()
    await page.getByRole('button', { name: /deal roles & begin/i }).click()
    const heading = await page.locator('.phase-card h1').innerText()
    server.update(); await findUpdate(page)
    await expect(page.locator('.phase-card h1')).toHaveText(heading)
    await expect(page.getByRole('button', { name: 'Update now' })).toHaveCount(0)
    expect(await workerVersion(page)).toBe(1)
    await page.getByRole('button', { name: 'Wherewolf home' }).click()
    await expect(page.getByRole('button', { name: 'Update now' })).toBeVisible()
    await context.setOffline(true)
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Update now' }).click()])
    await page.getByRole('button', { name: /resume game/i }).click()
    await expect(page.locator('.phase-card h1')).toHaveText(heading)
    await expect(page.locator('.game-statusbar')).toContainText('3 alive')
    expect(await workerVersion(page)).toBe(2)
  } finally { await context.setOffline(false); await server.close() }
})
