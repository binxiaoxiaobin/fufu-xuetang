import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end: drives the real build in Chromium. Game state is read through
 * the window.__fishslop hook; all actions go through real keyboard/mouse input
 * except where a test needs to fast-forward the economy (coins).
 */

type Hook = {
  sim: {
    coins: number;
    fish: { species: string }[];
    pellets: unknown[];
    sonarCooldown: number;
    stats: { pelletsDropped: number };
    sub: { pos: { x: number; y: number; z: number } };
    upgrades: Record<string, number>;
    veilfin: { timer: number; fish: { highlight: number } | null };
  };
  mode: string;
  shopOpen: boolean;
  night: boolean;
};

/** Runs `fn` in the page with the game hook as its argument. */
/** Small render target + low quality keeps software-GL (CI) runs fast. */
const URL = '/?quality=low&scale=0.35';

const hook = <T>(page: Page, fn: (h: Hook) => T): Promise<T> =>
  page.evaluate((src) => {
    const h = (window as unknown as { __fishslop?: unknown }).__fishslop;
    if (!h) throw new Error('E_HOOK_MISSING');
    return new Function('h', `return (${src})(h);`)(h);
  }, fn.toString()) as Promise<T>;

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // Font CDN hiccups in CI are not game errors.
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

async function dive(page: Page): Promise<void> {
  await page.goto(URL);
  const btn = page.locator('#btn-dive');
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('playing');
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
});

test('title screen loads the 3D reef without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(URL);
  await expect(page.locator('#logo')).toHaveText(/fish\s*slop/i);
  await expect(page.locator('#btn-dive')).toHaveText('Dive in');
  await expect.poll(() => hook(page, (h) => h.mode)).toBe('title');
  // The canvas really renders: read back pixels and require colour variety (not a blank clear).
  await page.waitForTimeout(1500);
  const png = await page.screenshot({ clip: { x: 640, y: 0, width: 640, height: 400 } });
  const spread = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 20;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 32, 20);
    const d = ctx.getImageData(0, 0, 32, 20).data;
    let min = 765, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] + d[i + 1] + d[i + 2];
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    return max - min;
  }, png.toString('base64'));
  expect(spread).toBeGreaterThan(60);
  expect(errors).toEqual([]);
});

test('dive, steer, feed and ping sonar', async ({ page }) => {
  const errors = trackErrors(page);
  await dive(page);
  const start = await hook(page, (h) => ({ ...h.sim.sub.pos }));

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  const moved = await hook(page, (h) => ({ ...h.sim.sub.pos }));
  expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeGreaterThan(1);

  await page.keyboard.down('KeyE');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyE');
  expect(await hook(page, (h) => h.sim.sub.pos.y)).toBeGreaterThan(moved.y);

  await page.keyboard.down('Space');
  await page.waitForTimeout(900);
  await page.keyboard.up('Space');
  await expect.poll(() => hook(page, (h) => h.sim.stats.pelletsDropped)).toBeGreaterThan(2);
  await expect(page.locator('#hopper i.on')).not.toHaveCount(14);

  await page.keyboard.press('KeyF');
  await expect.poll(() => hook(page, (h) => h.sim.sonarCooldown)).toBeGreaterThan(0);
  await expect(page.locator('#sonar-state')).toContainText('Recharging');
  expect(errors).toEqual([]);
});

test('the dock sells fish and sub parts', async ({ page }) => {
  await dive(page);
  await hook(page, (h) => { h.sim.coins = 500; });
  await page.keyboard.press('KeyB');
  await expect(page.locator('#shop')).toBeVisible();
  expect(await hook(page, (h) => h.shopOpen)).toBe(true);

  const before = await hook(page, (h) => h.sim.fish.length);
  await page.locator('button[data-fish="clown"]').click();
  await expect.poll(() => hook(page, (h) => h.sim.fish.length)).toBe(before + 1);
  expect(await hook(page, (h) => h.sim.coins)).toBeLessThan(500);

  // Locked species stay locked.
  await expect(page.locator('button[data-fish="slopfish"]')).toBeDisabled();

  await page.locator('#tab-sub').click();
  await page.locator('button[data-upgrade="magnet"]').click();
  await expect.poll(() => hook(page, (h) => h.sim.upgrades.magnet)).toBe(1);
  await expect(page.locator('#toasts')).toContainText('Coin magnet upgraded');

  await page.keyboard.press('Escape');
  await expect(page.locator('#shop')).toBeHidden();
  expect(await hook(page, (h) => h.mode)).toBe('playing');
});

test('pause and resume', async ({ page }) => {
  await dive(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('#stats')).toContainText('Residents');
  expect(await hook(page, (h) => h.mode)).toBe('paused');
  await page.locator('#btn-resume').click();
  await expect(page.locator('#pause')).toBeHidden();
  expect(await hook(page, (h) => h.mode)).toBe('playing');
});

test('progress and settings survive a reload', async ({ page }) => {
  await dive(page);
  await hook(page, (h) => { h.sim.coins = 400; });
  await page.keyboard.press('KeyB');
  await page.locator('button[data-fish="clown"]').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyN');
  expect(await hook(page, (h) => h.night)).toBe(true);
  const fish = await hook(page, (h) => h.sim.fish.length);
  // Pausing forces a save.
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();

  await page.reload();
  await expect(page.locator('#btn-dive')).toHaveText('Continue dive');
  await expect(page.locator('#save-note')).toContainText(`${fish} fish`);
  await expect(page.locator('#btn-new')).toBeVisible();
  expect(await hook(page, (h) => h.night)).toBe(true);
  expect(await hook(page, (h) => h.sim.fish.length)).toBe(fish);
});

test('starting a new reef wipes the save', async ({ page }) => {
  await dive(page);
  await hook(page, (h) => { h.sim.coins = 999; });
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('#btn-new')).toBeVisible();
  await page.locator('#btn-new').click();
  await expect.poll(() => hook(page, (h) => h.sim.coins)).toBeLessThan(100);
  expect(await hook(page, (h) => h.sim.fish.length)).toBe(8);
});

test('the Veilfin appears and sonar reveals it', async ({ page }) => {
  await dive(page);
  await hook(page, (h) => { h.sim.veilfin.timer = 0.05; });
  await expect(page.locator('#toasts')).toContainText('Something pale');
  // Pings have finite range; bring the sub next to it, then ping.
  await page.evaluate(() => {
    const h = (window as unknown as { __fishslop: { sim: { veilfin: { fish: { pos: { x: number; y: number; z: number } } }; sub: { pos: { set: (x: number, y: number, z: number) => void } } } } }).__fishslop;
    const p = h.sim.veilfin.fish.pos;
    h.sim.sub.pos.set(p.x, p.y + 3, p.z);
  });
  await page.keyboard.press('KeyF');
  await expect.poll(() => hook(page, (h) => h.sim.veilfin.fish?.highlight ?? 0), { timeout: 10_000 }).toBeGreaterThan(0);
});

test.describe('touch controls', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 414, height: 820 } });

  test('stick steers and the feed button drops food', async ({ page }) => {
    await dive(page);
    await expect(page.locator('#stick')).toBeVisible();
    const start = await hook(page, (h) => ({ ...h.sim.sub.pos }));
    const box = (await page.locator('#stick').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.locator('#stick').dispatchEvent('pointerdown', { pointerId: 7, clientX: cx, clientY: cy, pointerType: 'touch', isPrimary: true });
    await page.locator('#stick').dispatchEvent('pointermove', { pointerId: 7, clientX: cx, clientY: cy - 60, pointerType: 'touch', isPrimary: true });
    await page.waitForTimeout(1000);
    await page.locator('#stick').dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch' });
    const moved = await hook(page, (h) => ({ ...h.sim.sub.pos }));
    expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeGreaterThan(0.8);

    const feed = page.locator('.tbtn.feed');
    await feed.dispatchEvent('pointerdown', { pointerId: 8, pointerType: 'touch' });
    await page.waitForTimeout(600);
    await feed.dispatchEvent('pointerup', { pointerId: 8, pointerType: 'touch' });
    await expect.poll(() => hook(page, (h) => h.sim.stats.pelletsDropped)).toBeGreaterThan(0);
  });
});
