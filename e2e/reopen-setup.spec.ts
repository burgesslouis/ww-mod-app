import { expect, test } from '@playwright/test'

test('a fresh game can reopen its setup with the original values', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^New game$/i }).click()
  await page.getByRole('button', { name: /^Continue$/ }).click()
  for (let i = 6; i > 3; i--) await page.locator('.player-row .danger').last().click()
  for (let i = 1; i <= 3; i++) await page.getByLabel(`Player ${i} name`).fill(['Alex', 'Blair', 'Casey'][i - 1])
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.getByRole('button', { name: /Clear all/i }).click()
  for (const name of ['Alpha Wolf', 'Sinner', 'Bard']) {
    const row = page.locator('.role-config-row').filter({ has: page.locator('.role-check strong').getByText(name, { exact: true }) })
    await row.locator('.role-check').click()
    await page.getByLabel(`${name} in play`, { exact: true }).check()
  }
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.getByRole('button', { name: /Deal roles & begin/i }).click()
  await expect(page.getByRole('button', { name: /Edit setup/i })).toBeVisible()
  await page.getByRole('button', { name: /Edit setup/i }).click()
  await expect(page.getByRole('heading', { name: 'Choose role packs' })).toBeVisible()
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await expect(page.getByLabel('Player 1 name')).toHaveValue('Alex')
  await expect(page.getByLabel('Player 2 name')).toHaveValue('Blair')
  await expect(page.getByLabel('Player 3 name')).toHaveValue('Casey')
})
