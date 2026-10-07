import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { createExample } from '../src/machine'

function active(page: Page) {
  return page.getByRole('tabpanel')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Multitape.' })).toBeVisible()
})

test.afterEach(async ({ page }) => {
  expect(await page.pageErrors()).toEqual([])
})

test('machines run in parallel with independent tapes, speed, undo, and reset', async ({
  page,
}) => {
  await page
    .getByRole('textbox', { name: 'Machine name', exact: true })
    .fill('Copy')
  await page
    .getByRole('textbox', { name: 'Input on tape 1', exact: true })
    .fill('10'.repeat(100))
  await page.getByRole('slider', { name: 'Speed', exact: true }).press('End')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const copy = page.getByRole('tabpanel', {
    name: 'Copy',
    exact: true,
    includeHidden: true,
  })
  await expect
    .poll(async () =>
      Number(await copy.getByTestId('step-count').textContent()),
    )
    .toBeGreaterThan(0)

  const definition = createExample('invert')
  definition.name = 'Flip'
  definition.input = '1'.repeat(200)
  await active(page)
    .getByLabel('Machine JSON file', { exact: true })
    .setInputFiles({
      name: 'flip.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ version: 1, machine: definition })),
    })
  const flip = page.getByRole('tabpanel', {
    name: 'Flip',
    exact: true,
    includeHidden: true,
  })
  await expect(active(page).getByTestId('step-count')).toHaveText('0000')
  await page.getByRole('slider', { name: 'Speed', exact: true }).press('End')
  await page
    .getByRole('slider', { name: 'Speed', exact: true })
    .press('ArrowLeft')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const copyBefore = Number(await copy.getByTestId('step-count').textContent())
  await expect
    .poll(async () =>
      Number(await copy.getByTestId('step-count').textContent()),
    )
    .toBeGreaterThan(copyBefore)
  await expect
    .poll(async () =>
      Number(await flip.getByTestId('step-count').textContent()),
    )
    .toBeGreaterThan(0)
  await expect(copy.locator('.machine-status')).toHaveText('Running')
  await expect(flip.locator('.machine-status')).toHaveText('Running')
  await expect(page.locator('.tab-status-dot.running')).toHaveCount(2)
  await expect(
    copy
      .getByRole('region', { name: 'Tape 2', includeHidden: true })
      .locator('[data-position="0"]'),
  ).toHaveAttribute('data-symbol', '1')
  await expect(
    flip
      .getByRole('region', { name: 'Tape 1', includeHidden: true })
      .locator('[data-position="0"]'),
  ).toHaveAttribute('data-symbol', '0')
  await page.screenshot({
    path: 'test-results/parallel-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })

  await page.getByRole('tab', { name: 'Copy', exact: true }).click()
  await expect(
    page.getByRole('slider', { name: 'Speed', exact: true }),
  ).toHaveValue('12')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const paused = Number(await copy.getByTestId('step-count').textContent())
  await page.getByRole('button', { name: 'Step back', exact: true }).click()
  await expect(copy.getByTestId('step-count')).toHaveText(
    String(paused - 1).padStart(4, '0'),
  )
  await expect(flip.locator('.machine-status')).toHaveText('Running')

  await page.getByRole('tab', { name: 'Flip', exact: true }).click()
  await expect(
    page.getByRole('slider', { name: 'Speed', exact: true }),
  ).toHaveValue('11')
  await page
    .getByRole('button', { name: 'Reset simulation', exact: true })
    .click()
  await expect(flip.getByTestId('step-count')).toHaveText('0000')
  await expect(copy.getByTestId('step-count')).toHaveText(
    String(paused - 1).padStart(4, '0'),
  )
  await page.getByRole('tab', { name: 'Copy', exact: true }).click()
  await expect(
    copy.getByRole('region', { name: 'Tape 2' }).locator('[data-position="0"]'),
  ).toHaveAttribute('data-symbol', '1')
})

test('new tabs preserve editing, restore after reload, and close only after confirmation', async ({
  page,
}) => {
  await page
    .getByRole('textbox', { name: 'Machine name', exact: true })
    .fill('First')
  await page
    .getByRole('textbox', { name: 'Input on tape 1', exact: true })
    .fill('10')
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  const firstTape = await active(page).locator('.tape').first().elementHandle()
  await page
    .getByRole('button', { name: 'New machine tab', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Machine name', exact: true })
    .fill('Second')
  await page
    .getByRole('textbox', { name: 'Input on tape 1', exact: true })
    .fill('abc')
  await page.getByRole('spinbutton', { name: 'Number of tapes' }).fill('3')
  await page.getByRole('tab', { name: 'First', exact: true }).click()
  await expect(active(page).getByTestId('step-count')).toHaveText('0001')
  await expect(
    page.getByRole('textbox', { name: 'Input on tape 1', exact: true }),
  ).toHaveValue('10')
  expect(await firstTape!.evaluate((node) => node.isConnected)).toBe(true)
  await page.getByRole('tab', { name: 'Second', exact: true }).click()
  await expect(
    page.getByRole('spinbutton', { name: 'Number of tapes' }),
  ).toHaveValue('3')
  await page.reload()
  await expect(page.getByRole('tab')).toHaveCount(2)
  await expect(
    page.getByRole('tab', { name: 'Second', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(
    page.getByRole('textbox', { name: 'Input on tape 1', exact: true }),
  ).toHaveValue('abc')
  await expect(
    page.getByRole('spinbutton', { name: 'Number of tapes' }),
  ).toHaveValue('3')
  await page.getByRole('tab', { name: 'First', exact: true }).click()
  await expect(active(page).getByTestId('step-count')).toHaveText('0000')
  await expect(
    page.getByRole('textbox', { name: 'Input on tape 1', exact: true }),
  ).toHaveValue('10')

  await page.getByRole('button', { name: 'Close Second', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await expect(page.getByRole('tab')).toHaveCount(2)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.getByRole('button', { name: 'Close First', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close tab', exact: true })
    .click()
  await expect(page.getByRole('tab')).toHaveCount(1)
  await expect(
    page.getByRole('tab', { name: 'Second', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(
    page.getByRole('textbox', { name: 'Input on tape 1', exact: true }),
  ).toHaveValue('abc')
  await expect(
    page.getByRole('button', { name: 'Close Second', exact: true }),
  ).toBeDisabled()
  await page.reload()
  await expect(page.getByRole('tab')).toHaveCount(1)
  await expect(
    page.getByRole('textbox', { name: 'Machine name', exact: true }),
  ).toHaveValue('Second')
})

test('mobile tabs scroll without page overflow and support keyboard switching', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole('textbox', { name: 'Machine name', exact: true })
    .fill('First')
  await page
    .getByRole('button', { name: 'New machine tab', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Machine name', exact: true })
    .fill('Second')
  await page
    .getByRole('button', { name: 'New machine tab', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Machine name', exact: true })
    .fill('Third with a very long name')
  await expect(page.getByRole('tab')).toHaveCount(3)
  const third = page.getByRole('tab', {
    name: 'Third with a very long name',
    exact: true,
  })
  await third.focus()
  await third.press('ArrowLeft')
  await expect(
    page.getByRole('tab', { name: 'Second', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(
    page.getByRole('tab', { name: 'Second', exact: true }),
  ).toBeFocused()
  await page.getByRole('tab', { name: 'Second', exact: true }).press('Home')
  await expect(
    page.getByRole('tab', { name: 'First', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'First', exact: true }).press('End')
  await expect(third).toHaveAttribute('aria-selected', 'true')
  await expect(third).toBeFocused()
  await page.screenshot({
    path: 'test-results/parallel-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  )
  for (let index = 0; index < 4; index += 1) {
    await page
      .getByRole('button', { name: 'New machine tab', exact: true })
      .click()
    await expect(page.getByRole('tab', { selected: true })).toBeInViewport()
    await expect(
      page.getByRole('button', { name: 'New machine tab', exact: true }),
    ).toBeInViewport()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320)
  }
})

test('N stays in place and legacy S movements migrate without changing tape symbols', async ({
  page,
}) => {
  const legacy = {
    name: 'Legacy stay',
    tapeCount: 1,
    input: 'S',
    initialState: 'start',
    states: [
      { id: 'start', name: 'S', halt: false },
      { id: 'done', name: 'done', halt: true },
    ],
    transitions: [
      {
        id: 'stay',
        from: 'start',
        to: 'done',
        read: ['S'],
        write: ['S'],
        move: ['S'],
      },
    ],
  }
  await page.evaluate((machine) => {
    localStorage.setItem(
      'multitape:machine:v1',
      JSON.stringify({ version: 1, machine }),
    )
  }, legacy)
  await page.reload()
  const movement = active(page).getByLabel('Transition 1, tape 1 move', {
    exact: true,
  })
  await expect(movement).toHaveValue('N')
  await expect(movement.locator('option')).toHaveText(['L', 'R', 'N'])
  await expect(
    active(page).getByLabel('State 1 name', { exact: true }),
  ).toHaveValue('S')
  await expect(
    active(page).getByLabel('Transition 1, tape 1 read', { exact: true }),
  ).toHaveValue('S')
  await expect(
    active(page).getByLabel('Transition 1, tape 1 write', { exact: true }),
  ).toHaveValue('S')
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  await expect(active(page).locator('.machine-status')).toHaveText('Halted')
  await expect(
    active(page).locator('.tape-cell[data-head="true"]'),
  ).toHaveAttribute('data-position', '0')
  await expect(
    active(page).locator('.tape-cell[data-head="true"]'),
  ).toHaveAttribute('data-symbol', 'S')

  await active(page)
    .getByLabel('Machine JSON file', { exact: true })
    .setInputFiles({
      name: 'legacy.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ version: 1, machine: legacy })),
    })
  await expect(movement).toHaveValue('N')
  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Download machine', exact: true })
    .click()
  const download = await downloadPromise
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(exported.machine.transitions[0]).toMatchObject({
    read: ['S'],
    write: ['S'],
    move: ['N'],
  })
})

test('read sets match both inputs and survive saving and importing', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New machine', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Input on tape 1', exact: true })
    .fill('01')
  await page
    .getByRole('button', { name: 'Add transition', exact: true })
    .click()
  await active(page)
    .getByLabel('Transition 1, tape 1 read', { exact: true })
    .fill('{0,1}')
  await active(page)
    .getByLabel('Transition 1, tape 2 read', { exact: true })
    .fill('{lambda,0,1}')
  await active(page)
    .getByLabel('Transition 1, tape 1 write', { exact: true })
    .fill('X')
  await active(page)
    .getByLabel('Transition 1, tape 2 write', { exact: true })
    .fill('X')
  for (const tape of [1, 2]) {
    await active(page)
      .getByLabel(`Transition 1, tape ${tape} move`, { exact: true })
      .selectOption('R')
  }
  await page
    .getByRole('button', { name: 'Add transition', exact: true })
    .click()
  await active(page)
    .getByLabel('Transition 2 next state', { exact: true })
    .selectOption({ label: 'done' })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(active(page).getByTestId('transition-1')).toHaveClass(
    /next-transition/,
  )
  await page.screenshot({
    path: 'test-results/read-sets.png',
    fullPage: true,
    animations: 'disabled',
  })

  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Download machine', exact: true })
    .click()
  const download = await downloadPromise
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(exported.machine.transitions[0].read).toEqual([
    '{0,1}',
    '{lambda,0,1}',
  ])
  await page.reload()
  await expect(
    active(page).getByLabel('Transition 1, tape 2 read', { exact: true }),
  ).toHaveValue('{lambda,0,1}')
  await active(page)
    .getByLabel('Machine JSON file', { exact: true })
    .setInputFiles({
      name: 'read-sets.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(exported)),
    })
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  await expect(active(page).getByTestId('transition-1')).toHaveClass(
    /next-transition/,
  )
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  await expect(active(page).locator('.machine-status')).toHaveText('Halted')
  await expect(active(page).getByTestId('step-count')).toHaveText('0003')
  for (const tape of [1, 2]) {
    const region = page.getByRole('region', {
      name: `Tape ${tape}`,
      exact: true,
    })
    for (const position of [0, 1]) {
      await expect(
        region.locator(`[data-position="${position}"]`),
      ).toHaveAttribute('data-symbol', 'X')
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  await page.screenshot({
    path: 'test-results/read-sets-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
})

for (const width of [1440, 390]) {
  test(`editing keeps tape views mounted at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    if (width === 390) {
      await page
        .getByRole('button', { name: 'Machine settings', exact: true })
        .click()
    }
    const tapeNodes = await active(page).locator('.tape').elementHandles()
    const gridNodes = await active(page).locator('.tape-cells').elementHandles()
    const cellCounts = await active(page)
      .locator('.tape-cells')
      .evaluateAll((grids) => grids.map((grid) => grid.childElementCount))
    await page
      .getByRole('textbox', { name: 'Input on tape 1', exact: true })
      .fill('0101')
    const name = page.getByRole('textbox', {
      name: 'State 1 name',
      exact: true,
    })
    await name.fill('walk')
    await name.pressSequentially(' right')
    await expect(name).toBeFocused()
    await page
      .getByRole('textbox', { name: 'Machine name', exact: true })
      .fill('Stable editing')
    await active(page)
      .getByLabel('Transition 1, tape 1 read', { exact: true })
      .fill('0,1')
    await expect(page.getByRole('alert')).toContainText('overlapping inputs')
    await active(page)
      .getByLabel('Transition 1, tape 1 read', { exact: true })
      .fill('0')
    await active(page)
      .getByLabel('Transition 1, tape 1 write', { exact: true })
      .fill('X')
    await active(page)
      .getByLabel('Transition 1, tape 1 move', { exact: true })
      .selectOption('L')
    await page
      .getByRole('radio', { name: 'Start in done', exact: true })
      .check()
    await page
      .getByRole('radio', { name: 'Start in walk right', exact: true })
      .check()
    await page
      .getByRole('checkbox', { name: 'Halt at done', exact: true })
      .uncheck()
    await page
      .getByRole('checkbox', { name: 'Halt at done', exact: true })
      .check()
    await page.getByRole('button', { name: 'Add tape', exact: true }).click()
    await page.getByRole('button', { name: 'Remove tape', exact: true }).click()
    await page.getByRole('slider', { name: 'Speed', exact: true }).press('End')
    for (const element of [...tapeNodes, ...gridNodes]) {
      expect(await element.evaluate((node) => node.isConnected)).toBe(true)
    }
    expect(
      await active(page)
        .locator('.tape-cells')
        .evaluateAll((grids) => grids.map((grid) => grid.childElementCount)),
    ).toEqual(cellCounts)
    await page
      .getByRole('button', { name: 'Tape 1: pan right', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Tape 1: follow head', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false')
    await page
      .getByRole('button', { name: 'Reset simulation', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Tape 1: follow head', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      page
        .getByRole('region', { name: 'Tape 1', exact: true })
        .locator('[data-head="true"]'),
    ).toHaveAttribute('data-position', '0')
    for (const element of tapeNodes) {
      expect(await element.evaluate((node) => node.isConnected)).toBe(true)
    }
  })
}

test('desktop tapes, playback, undo, pause, and reset', async ({ page }) => {
  const steps = active(page).getByTestId('step-count')
  const inputTape = page.getByRole('region', { name: 'Tape 1', exact: true })
  const workTape = page.getByRole('region', { name: 'Tape 2', exact: true })
  await expect(inputTape.locator('[data-head="true"]')).toHaveAttribute(
    'data-position',
    '0',
  )
  await expect(inputTape.locator('[data-head="true"]')).toHaveAttribute(
    'data-symbol',
    '1',
  )
  await expect(workTape.locator('[data-head="true"]')).toHaveAttribute(
    'data-symbol',
    '\u03bb',
  )
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: 'test-results/desktop.png',
    fullPage: true,
    animations: 'disabled',
  })

  await page.getByRole('button', { name: 'Step', exact: true }).click()
  await expect(steps).toHaveText('0001')
  await expect(workTape.locator('[data-position="0"]')).toHaveAttribute(
    'data-symbol',
    '1',
  )
  await expect(inputTape.locator('[data-head="true"]')).toHaveAttribute(
    'data-position',
    '1',
  )
  await page.getByRole('button', { name: 'Step back', exact: true }).click()
  await expect(steps).toHaveText('0000')
  await expect(workTape.locator('[data-position="0"]')).toHaveAttribute(
    'data-symbol',
    '\u03bb',
  )

  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(steps).not.toHaveText('0000')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const pausedStep = await steps.textContent()
  await page.waitForTimeout(650)
  await expect(steps).toHaveText(pausedStep!)
  await page.getByRole('slider', { name: 'Speed', exact: true }).press('End')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(active(page).locator('.machine-status')).toHaveText('Halted')
  await expect(steps).toHaveText('0007')
  const output = await workTape
    .locator('[data-position]')
    .evaluateAll((cells) =>
      cells
        .filter(
          (cell) =>
            Number(cell.getAttribute('data-position')) >= 0 &&
            Number(cell.getAttribute('data-position')) < 6,
        )
        .map((cell) => cell.getAttribute('data-symbol'))
        .join(''),
    )
  expect(output).toBe('101101')
  await page
    .getByRole('button', { name: 'Reset simulation', exact: true })
    .click()
  await expect(steps).toHaveText('0000')
  await expect(inputTape.locator('[data-head="true"]')).toHaveAttribute(
    'data-position',
    '0',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1440,
  )
})

test('a custom three-tape machine can be built, named, and saved', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New machine', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Number of tapes' }).fill('3')
  await page
    .getByRole('textbox', { name: 'Machine name', exact: true })
    .fill('Three tape check')
  await page
    .getByRole('textbox', { name: 'Input on tape 1', exact: true })
    .fill('m')
  await page
    .getByRole('textbox', { name: 'State 1 name', exact: true })
    .fill('Start (custom)')
  await page
    .getByRole('textbox', { name: 'State 2 name', exact: true })
    .fill('Finish')
  await page
    .getByRole('button', { name: 'Add transition', exact: true })
    .click()
  await active(page)
    .getByLabel('Transition 1, tape 1 read', { exact: true })
    .fill('m')
  await active(page)
    .getByLabel('Transition 1, tape 1 write', { exact: true })
    .fill('m')
  await active(page)
    .getByLabel('Transition 1, tape 2 write', { exact: true })
    .fill('n')
  await active(page)
    .getByLabel('Transition 1, tape 3 write', { exact: true })
    .fill('o')
  for (const [index, direction] of ['L', 'R', 'N'].entries()) {
    await active(page)
      .getByLabel(`Transition 1, tape ${index + 1} move`, { exact: true })
      .selectOption(direction)
  }
  await active(page)
    .getByLabel('Transition 1 next state', { exact: true })
    .selectOption({ label: 'Finish' })
  await active(page)
    .getByLabel('Transition 1, tape 2 read', { exact: true })
    .fill('lambda')
  await active(page)
    .getByLabel('Transition 1, tape 2 read', { exact: true })
    .press('Tab')
  await expect(
    active(page).getByLabel('Transition 1, tape 2 read', { exact: true }),
  ).toHaveValue('\u03bb')
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  expect(
    await active(page)
      .locator('.tape-cell[data-head="true"]')
      .evaluateAll((cells) =>
        cells.map((cell) => Number(cell.getAttribute('data-position'))),
      ),
  ).toEqual([-1, 1, 0])
  expect(
    await active(page)
      .locator('.tape-cell[data-position="0"]')
      .evaluateAll((cells) =>
        cells.map((cell) => cell.getAttribute('data-symbol')),
      ),
  ).toEqual(['m', 'n', 'o'])
  await expect(active(page).locator('.current-state-value')).toHaveText(
    'Finish',
  )
  await expect(active(page).locator('.machine-status')).toHaveText('Halted')

  await page.reload()
  await expect(
    page.getByRole('textbox', { name: 'Machine name', exact: true }),
  ).toHaveValue('Three tape check')
  await expect(active(page).getByTestId('step-count')).toHaveText('0000')
  await page
    .getByRole('radio', { name: 'Start in Finish', exact: true })
    .check()
  await expect(active(page).locator('.machine-status')).toHaveText('Halted')
  await page
    .getByRole('radio', { name: 'Start in Start (custom)', exact: true })
    .check()
  await page.getByRole('button', { name: 'Add state', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'State 3 name', exact: true })
    .fill('spare')
  await page
    .getByRole('button', {
      name: 'Delete spare and its transitions',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'State 3 name', exact: true }),
  ).toHaveCount(0)
})

test('lambda and empty inputs start at zero; missing rules do not add a step', async ({
  page,
}) => {
  for (const input of ['', '\u03bb']) {
    await page
      .getByRole('textbox', { name: 'Input on tape 1', exact: true })
      .fill(input)
    await expect(
      page
        .getByRole('region', { name: 'Tape 1', exact: true })
        .locator('[data-head="true"]'),
    ).toHaveAttribute('data-position', '0')
    await page.getByRole('button', { name: 'Step', exact: true }).click()
    await expect(active(page).locator('.machine-status')).toHaveText('Halted')
    await expect(active(page).getByTestId('step-count')).toHaveText('0001')
  }
  await page
    .getByRole('textbox', { name: 'Input on tape 1', exact: true })
    .fill('x')
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  await expect(active(page).locator('.machine-status')).toHaveText(
    'No matching rule',
  )
  await expect(active(page).getByTestId('step-count')).toHaveText('0000')
})

test('invalid rules are blocked and deleting the duplicate repairs the machine', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Add transition', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'same state and read symbols',
  )
  await expect(
    page.getByRole('button', { name: 'Run', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Delete transition 4', exact: true })
    .click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await active(page)
    .getByLabel('Transition 1, tape 1 read', { exact: true })
    .fill('ab')
  await expect(page.getByRole('alert')).toContainText('one character')
  await expect(
    page.getByRole('button', { name: 'Step', exact: true }),
  ).toBeDisabled()
  await active(page)
    .getByLabel('Transition 1, tape 1 read', { exact: true })
    .fill('0')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('download and import round-trip opens a new tab and protects against invalid files', async ({
  page,
}) => {
  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Download machine', exact: true })
    .click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('binary-copy.json')
  const filePath = await download.path()
  const exported = JSON.parse(await readFile(filePath!, 'utf8'))
  expect(exported.version).toBe(1)
  expect(exported.machine.tapeCount).toBe(2)
  expect(exported.machine.transitions).toHaveLength(3)

  await page
    .getByRole('textbox', { name: 'Machine name', exact: true })
    .fill('Current work')
  const importFile = {
    name: 'round-trip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  }
  await active(page)
    .getByLabel('Machine JSON file', { exact: true })
    .setInputFiles(importFile)
  await expect(page.getByRole('tab')).toHaveCount(2)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Current work', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Machine name', exact: true }),
  ).toHaveValue('Current work')
  await page.getByRole('tab', { name: 'Binary copy', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Machine name', exact: true }),
  ).toHaveValue('Binary copy')
  await active(page)
    .getByLabel('Machine JSON file', { exact: true })
    .setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":1,"machine":{}}'),
    })
  await expect(page.getByRole('alert')).toContainText('invalid settings')
  await expect(page.getByRole('tab')).toHaveCount(2)
  await expect(
    page.getByRole('textbox', { name: 'Machine name', exact: true }),
  ).toHaveValue('Binary copy')
})

test('mobile workbench fits, exposes settings, and keeps the heads visible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => document.fonts.ready)
  await expect(
    page.getByRole('button', { name: 'Machine settings', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: 'Input on tape 1', exact: true }),
  ).toBeHidden()
  await expect(
    page
      .getByRole('region', { name: 'Tape 1', exact: true })
      .locator('[data-head="true"]'),
  ).toBeInViewport()
  await expect(
    page
      .getByRole('region', { name: 'Tape 2', exact: true })
      .locator('[data-head="true"]'),
  ).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  await page.screenshot({
    path: 'test-results/mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page
    .getByRole('button', { name: 'Machine settings', exact: true })
    .click()
  await page.getByRole('spinbutton', { name: 'Number of tapes' }).fill('3')
  await page
    .getByRole('textbox', { name: 'Input on tape 1', exact: true })
    .fill('10')
  await page.screenshot({
    path: 'test-results/mobile-settings.png',
    fullPage: true,
    animations: 'disabled',
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  await page
    .getByRole('button', { name: 'Machine settings', exact: true })
    .click()
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  await expect(active(page).getByTestId('step-count')).toHaveText('0001')
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  )
})
