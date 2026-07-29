import { expect, test, type Locator } from '@playwright/test'

// Throwaway local test account — seeded/reset dev deployment only.
const PASSWORD = 'e2e-smoke-password-123'
const EMAIL = `e2e+${Date.now()}@example.com`

// Team the scouting + picklist steps all exercise. Must match
// convex/seed.ts's TEAM_NUMBERS[4].
const TEAM_NUMBER = '1678'

async function clickTimes(locator: Locator, times: number) {
  for (let i = 0; i < times; i++) await locator.click()
}

test('sign up, scout a team, and organize a pick list', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })

  await page.goto('/sign-in')
  await page.getByRole('button', { name: "Don't have an account? Sign up" }).click()
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()
  await expect(page).toHaveURL('/')

  // Teams page shows the full seeded roster.
  await page.goto('/teams')
  await expect(page.locator('a[href^="/teams?team="]')).toHaveCount(12)

  // Open a team detail (mobile -> bottom sheet).
  await page.locator('a[href^="/teams?team="]', { hasText: TEAM_NUMBER }).click()
  await expect(page.locator('[data-slot="team-detail-header"] p').first()).toHaveText(
    `#${TEAM_NUMBER} — Team ${TEAM_NUMBER}`,
  )
  await expect(page.getByText('Not scouted yet.')).toBeVisible()

  // Scout that team (pit report).
  await page.goto('/scout')
  await page.locator(`a[href^="/scout/"]:has-text("${TEAM_NUMBER}")`).click()
  await page.getByRole('button', { name: 'Can score balls' }).click()
  await page.getByRole('button', { name: 'Can climb' }).click()
  await clickTimes(page.getByRole('button', { name: 'Increase Storage capacity' }), 3)
  await clickTimes(page.getByRole('button', { name: 'Add 5 to Est. balls per match' }), 2)
  await clickTimes(page.getByRole('button', { name: 'Increase Est. balls per match' }), 2)
  await page.getByRole('group', { name: 'Driver rating' }).getByRole('button', { name: '5', exact: true }).click()
  await page.getByRole('group', { name: 'Defense rating' }).getByRole('button', { name: '3', exact: true }).click()
  await page.getByRole('button', { name: 'Fast', exact: true }).click()
  await page.getByRole('button', { name: 'Save report' }).click()
  await expect(page.getByText('Pit report saved')).toBeVisible()
  await expect(page).toHaveURL('/scout')

  // Tile now shows the scouted badge.
  const scoutTile = page.locator(`a[href^="/scout/"]:has-text("${TEAM_NUMBER}")`)
  await expect(scoutTile.locator('span.bg-green-600')).toBeVisible()

  // Team detail shows the ball estimate and its percentage of the seeded
  // benchmark (12 of 4788's 20 -> 60%). Scoped to the open sheet/dialog
  // content, not the whole page, so other teams' stats can't collide.
  await page.goto('/teams')
  await page.locator('a[href^="/teams?team="]', { hasText: TEAM_NUMBER }).click()
  const detail = page.locator('[data-slot="dialog-content"], [data-slot="sheet-content"]')
  await expect(detail.getByText('12', { exact: true })).toBeVisible() // Balls / match
  await expect(detail.getByText('60%', { exact: true })).toBeVisible() // % of benchmark

  // Rank the team on the pick list: tap its tier badge, pick A from the sheet.
  await page.goto('/picklist')
  await page.getByRole('button', { name: `Set tier for ${TEAM_NUMBER}` }).click()
  await page.getByRole('button', { name: 'Move to A' }).click()

  const columnA = page.locator('section[aria-label="A"]')
  await expect(columnA.getByText(TEAM_NUMBER, { exact: true })).toBeVisible()
  await expect(
    page.locator('section[aria-label="Unranked"]').getByText(TEAM_NUMBER, { exact: true }),
  ).toHaveCount(0)

  await page.reload()
  await expect(page.locator('section[aria-label="A"]').getByText(TEAM_NUMBER, { exact: true })).toBeVisible()
})
