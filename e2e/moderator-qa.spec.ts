import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function prepare(page: Page, names: string[], roles: string[]) {
  await page.goto('/')
  await page.getByRole('button', { name: /^new game$/i }).click()
  await expect(page.getByRole('button', { name: /silent night/i })).toHaveCount(0)
  await page.getByRole('button', { name: /^continue$/i }).click()
  for (let index = 6; index > names.length; index--) await page.locator('.player-row .danger').last().click()
  for (let index = 0; index < names.length; index++) await page.getByLabel(`Player ${index + 1} name`).fill(names[index])
  await page.getByRole('button', { name: /^continue$/i }).click()
  await page.getByRole('button', { name: /clear all/i }).click()
  for (const name of roles) {
    const row = page.locator('.role-config-row').filter({ has: page.locator('.role-check strong').getByText(name, { exact: true }) })
    await row.locator('.role-check').click()
    await page.getByLabel(`${name} in play`, { exact: true }).check()
  }
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: false })
}

test('moderator setup keeps options together and releases removed gardened cards at narrow and wide widths', async ({ page }, testInfo) => {
  const widths = testInfo.project.name === 'phone' ? [360, 393] : [768, 1280]
  for (const width of widths) {
    await page.setViewportSize({ width, height: 850 })
    const names = ['Alexandria Long-Surname', 'Beatrice', 'Charlie', 'Daniel', 'Eleanor', 'Frederick']
    await prepare(page, names, ['Alpha Wolf', 'Clairvoyant', 'Wizard', 'Medium', 'Witch', 'Healer'])
    await page.evaluate(() => window.scrollTo(0, 0))
    await noHorizontalOverflow(page)
    await capture(page, testInfo, `role-pool-${width}`)
    await page.getByRole('button', { name: /^continue$/i }).click()
    const options = page.getByLabel('Before dealing')
    await expect(options.getByRole('button', { name: /silent night/i })).toBeVisible()
    await expect(options.getByRole('button', { name: /use app to distribute roles/i })).toBeVisible()
    await options.getByRole('button', { name: /silent night/i }).click()
    await options.getByRole('button', { name: /use app to distribute roles/i }).click()
    await page.getByRole('button', { name: /gardened allocation/i }).click()
    await page.locator('.assignment-list select').first().selectOption({ label: 'Alpha Wolf' })
    await expect(page.locator('.assignment-list select').nth(1).locator('option', { hasText: 'Alpha Wolf' })).toHaveJSProperty('disabled', true)
    await noHorizontalOverflow(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await capture(page, testInfo, `deal-review-${width}`)
    await page.locator('.review-grid').scrollIntoViewIfNeeded()
    await capture(page, testInfo, `night-order-${width}`)
    await page.getByRole('main').getByRole('button', { name: /^back$/i }).click()
    await page.getByLabel('Alpha Wolf in play', { exact: true }).uncheck()
    const sinner = page.locator('.role-config-row').filter({ hasText: 'Sinner' })
    await sinner.locator('.role-check').click()
    await page.getByLabel('Sinner in play', { exact: true }).check()
    await page.getByRole('button', { name: /^continue$/i }).click()
    await expect(page.locator('.assignment-list select').first()).toHaveValue('')
    await expect(page.locator('.validation-box')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^distribute roles$/i })).toBeEnabled()
    await expect(options.getByRole('button', { name: /silent night/i })).toHaveAttribute('aria-pressed', 'true')
    await options.getByRole('button', { name: /use app to distribute roles/i }).click()
    await page.getByRole('button', { name: /deal roles & begin/i }).click()
    await expect(page.getByRole('button', { name: 'Choose a target', exact: true })).toBeDisabled()
    await expect(page.locator('.phase-instruction')).not.toContainText('Say “')
    await expect(page.locator('.phase-card h1')).toHaveCSS('font-family', /Trattatello/)
    await expect(page.locator('.phase-card h1')).toHaveCSS('font-variant-numeric', 'lining-nums')
    await expect(page.locator('.phase-instruction')).not.toHaveCSS('font-family', /Trattatello/)
    const headingFont = await page.evaluate(async () => {
      try { return (await document.fonts.load('400 48px Trattatello', 'Night 0')).map(font => font.status) }
      catch { return [] }
    })
    await testInfo.attach(`heading-font-${width}`, { body: JSON.stringify({ locallyAvailable: headingFont.includes('loaded') }), contentType: 'application/json' })
    await noHorizontalOverflow(page)
    await capture(page, testInfo, `role-action-${width}`)
    const confirm = page.getByRole('button', { name: 'Choose a target', exact: true })
    await confirm.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const confirmBottom = await confirm.evaluate(button => button.getBoundingClientRect().bottom)
    const navTop = await page.locator('.bottom-nav').evaluate(nav => getComputedStyle(nav).display === 'none' ? innerHeight : nav.getBoundingClientRect().top)
    expect(confirmBottom).toBeLessThanOrEqual(navTop)
    await capture(page, testInfo, `action-controls-${width}`)
  }
})

async function hungVote(page: Page) {
  await page.getByRole('button', { name: /begin first vote/i }).click()
  for (const name of ['Wolf', 'Healer', 'Sinner']) await page.getByLabel(`${name} votes`, { exact: true }).fill('1')
  await page.getByRole('button', { name: /record vote/i }).click()
  await expect(page.getByRole('heading', { name: 'On the ballot: Wolf, Healer, and Sinner.' })).toBeVisible()
  await page.getByRole('button', { name: /begin ballot vote/i }).click()
  await page.getByRole('button', { name: /record vote/i }).click()
  await expect(page.getByRole('heading', { name: 'The village is undecided.' })).toBeVisible()
  await page.getByRole('button', { name: /continue to night/i }).click()
}

test('Healer can skip an empty night, resume offline, then revive on the next night', async ({ page, context }, testInfo) => {
  await prepare(page, ['Wolf', 'Healer', 'Sinner'], ['Alpha Wolf', 'Healer', 'Sinner'])
  await page.getByRole('button', { name: /^continue$/i }).click()
  await page.getByRole('button', { name: /silent night/i }).click()
  await page.getByRole('button', { name: /gardened allocation/i }).click()
  for (const [index, name] of ['Alpha Wolf', 'Healer', 'Sinner'].entries()) await page.locator('.assignment-list select').nth(index).selectOption({ label: name })
  await page.getByRole('button', { name: /deal roles & begin/i }).click()
  await page.getByRole('button', { name: /^confirm$/i }).click()
  await hungVote(page)
  await page.getByRole('button', { name: /^skip$/i }).click()
  await expect(page.getByRole('heading', { name: 'No night attack was made.' })).toBeVisible()
  await page.getByRole('button', { name: /^continue$/i }).click()
  await expect(page.getByRole('heading', { name: 'Healer · Revive' })).toBeVisible()
  await expect(page.getByText(/There are no eligible targets/)).toBeVisible()
  await capture(page, testInfo, 'healer-skip')
  await page.getByRole('button', { name: /^skip$/i }).click()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: /resume game/i }).click()
  await page.getByRole('button', { name: /begin the next day/i }).click()
  await hungVote(page)
  await page.locator('.target-grid button').filter({ hasText: 'Sinner' }).click()
  await page.getByRole('button', { name: /confirm 1 selection/i }).click()
  await page.getByRole('button', { name: /^continue$/i }).click()
  await expect(page.getByRole('heading', { name: 'Healer · Revive' })).toBeVisible()
  await page.locator('.target-grid button').filter({ hasText: 'Sinner' }).click()
  await page.getByRole('button', { name: /confirm 1 selection/i }).click()
  await expect(page.locator('.game-statusbar')).toContainText('3 alive')
  await noHorizontalOverflow(page)
  await context.setOffline(false)
})

test('exported official packs and scenario reimport without errors', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /roles and rules/i }).click()
  for (const [tab, title] of [['Packs', 'Darkest Night'], ['Packs', 'Hidden Motives'], ['Scenarios', 'Official Game']]) {
    await page.locator('.library-tabs').getByRole('button', { name: new RegExp(tab) }).click()
    await page.locator('.artifact-card').filter({ hasText: title }).getByRole('button', { name: /view & clone/i }).click()
    const downloadReady = page.waitForEvent('download')
    await page.locator('.editor-toolbar > div:last-child .icon-button').click()
    const download = await downloadReady
    const data = await readFile((await download.path())!)
    await page.getByRole('button', { name: /^library$/i }).click()
    await page.locator('input[type="file"]').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/json', buffer: data })
    await expect(page.getByText('Already installed', { exact: true })).toBeVisible()
    await expect(page.locator('.import-modal')).not.toContainText('Checksum does not match')
    await page.locator('.modal-close').click()
  }
})
