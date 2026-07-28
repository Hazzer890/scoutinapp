import { expect, test, type Locator } from '@playwright/test'

// Throwaway local test account — seeded/reset dev deployment only.
const PASSWORD = 'e2e-smoke-password-123'
const EMAIL = `e2e+${Date.now()}@example.com`

// Team the pit-scout + match-report + picklist steps all exercise. Must match
// convex/seed.ts's TEAM_NUMBERS[4] and be a red team in match Q1.
const TEAM_NUMBER = '1678'

async function clickTimes(locator: Locator, times: number) {
  for (let i = 0; i < times; i++) await locator.click()
}

test('sign up, pit scout, file a match report, and organize a pick list', async ({ page }) => {
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

  // Pit-scout that team.
  await page.goto('/pit')
  await page.locator(`a[href^="/pit/"]:has-text("${TEAM_NUMBER}")`).click()
  await page.getByRole('button', { name: 'Can score balls' }).click()
  await page.getByRole('button', { name: 'Can climb' }).click()
  await clickTimes(page.getByRole('button', { name: 'Increase Storage capacity' }), 3)
  await page.getByRole('group', { name: 'Driver rating' }).getByRole('button', { name: '8', exact: true }).click()
  await page.getByRole('group', { name: 'Defense rating' }).getByRole('button', { name: '3', exact: true }).click()
  await page.getByRole('button', { name: 'Fast', exact: true }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText('Pit report saved')).toBeVisible()
  await expect(page).toHaveURL('/pit')

  // Tile now shows the scouted badge.
  const pitTile = page.locator(`a[href^="/pit/"]:has-text("${TEAM_NUMBER}")`)
  await expect(pitTile.locator('span.bg-green-600')).toBeVisible()

  // File a match report via the schedule (not manual entry).
  await page.goto('/matches')
  await page.getByRole('button', { name: /^Q1/ }).click()
  await page.getByRole('button', { name: TEAM_NUMBER, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/matches/1/${TEAM_NUMBER}`))
  await clickTimes(page.getByRole('button', { name: 'Increase Balls scored' }), 12)
  await clickTimes(page.getByRole('button', { name: 'Increase Balls missed' }), 2)
  await clickTimes(page.getByRole('button', { name: 'Increase Max balls held' }), 4)
  await page.getByRole('switch', { name: 'Attempted climb' }).click()
  await page.getByRole('switch', { name: 'Climb succeeded' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText('Match report saved')).toBeVisible()
  await expect(page).toHaveURL('/matches')

  // Team detail now shows real averages for that one match. Scoped to the open
  // sheet/dialog content, not the whole page, so other teams' stats can't collide.
  await page.goto('/teams')
  await page.locator('a[href^="/teams?team="]', { hasText: TEAM_NUMBER }).click()
  const detail = page.locator('[data-slot="dialog-content"], [data-slot="sheet-content"]')
  await expect(detail.getByText('12.0', { exact: true })).toBeVisible() // Avg balls
  await expect(detail.getByText('86%', { exact: true })).toBeVisible() // Accuracy (12 / 14)

  // Switch to desktop and organize the pick list. A wide viewport keeps every
  // tier column on screen at once so the drag doesn't need mid-drag scrolling.
  await page.setViewportSize({ width: 2200, height: 1000 })
  await page.goto('/picklist')

  const card = page.locator('section[aria-label="Uncategorized"] .cursor-grab', { hasText: TEAM_NUMBER })
  const columnA = page.locator('section[aria-label="A"]')
  await expect(card).toBeVisible()

  const from = await card.boundingBox()
  const to = await columnA.boundingBox()
  if (!from || !to) throw new Error('Could not measure drag source/target')

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * 0.7, { steps: 20 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * 0.7, { steps: 5 })
  await page.mouse.up()

  await expect(columnA.getByText(TEAM_NUMBER, { exact: true })).toBeVisible()
  await expect(page.locator('section[aria-label="Uncategorized"]', { hasText: TEAM_NUMBER })).toHaveCount(0)

  await page.reload()
  await expect(page.locator('section[aria-label="A"]').getByText(TEAM_NUMBER, { exact: true })).toBeVisible()
})
