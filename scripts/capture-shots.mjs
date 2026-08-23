// scripts/capture-shots.mjs
/**
 * Captures the marketing screenshots in `scripts/lib/shots-manifest.mjs`
 * against a seeded demo cafe. A build tool, NOT a test: it must never run
 * under `pnpm test:e2e`, because "the image changed" is not an assertion
 * failure.
 *
 * Requires `pnpm dev:all` running, and SHOTS_CONVEX_DEPLOYMENT allowlisting a
 * DEDICATED Convex deployment (see scripts/lib/shots-env.mjs — seeding purges).
 *
 * Usage: pnpm shots
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { assertShotsDeployment } from './lib/shots-env.mjs';
import { SHOT_MANIFEST } from './lib/shots-manifest.mjs';

const BASE_URL = 'http://localhost:5173';
const OUT_DIR = resolve(process.cwd(), 'public/shots');
const SEED = 12345;
const CAFE_NAME = 'Kopi Shots';
const EMAIL = process.env.SHOTS_EMAIL ?? 'shots@kodapos.test';
const PASSWORD = process.env.SHOTS_PASSWORD ?? 'Sa{ngat-Aman-123';
const PIN = '1234';
const STATE_PATH = resolve(process.cwd(), 'node_modules/.cache/shots-state.json');
const MAX_BYTES = 150 * 1024;

function convexRun(fn, args) {
  return execFileSync('npx', ['convex', 'run', fn, JSON.stringify(args)], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

async function ensureSignedIn(browser) {
  let context;
  try {
    context = await browser.newContext({ storageState: STATE_PATH, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    if (!page.url().includes('/signin')) return context;
    await context.close();
  } catch {
    if (context) await context.close();
  }

  // First run: drive the real signup + onboarding + PIN flow. Convex Auth keeps
  // its session as a client-side JWT in localStorage, so there is no cookie to
  // forge and no SSR shortcut — the UI login is the only way in.
  context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/signup`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Nama Anda').fill('Shots Owner');
  await page.getByLabel('Nama kafe').fill(CAFE_NAME);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /Daftar/ }).click();
  await page.waitForURL(/\/onboarding\/profile$/, { timeout: 20_000 });
  await page.getByLabel('Persentase PPN').fill('11');
  await page.getByRole('button', { name: /Lanjut/ }).click();
  await page.waitForURL(/\/onboarding\/menu$/);
  await page.goto(`${BASE_URL}/onboarding/cashier`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /Atur PIN/ }).click();
  for (const d of PIN) await page.keyboard.type(d);
  await page.getByRole('button', { name: /Ganti PIN/ }).waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: /Selesai/ }).click();
  await page.waitForLoadState('networkidle');
  mkdirSync(resolve(process.cwd(), 'node_modules/.cache'), { recursive: true });
  await context.storageState({ path: STATE_PATH });
  return context;
}

async function unlockPin(page) {
  if (!page.url().includes('/pin')) return;
  await page.getByRole('button', { name: /Shots Owner/ }).click();
  for (const d of PIN) await page.keyboard.type(d);
  await page.waitForURL((u) => !u.pathname.includes('/pin'), { timeout: 15_000 });
}

async function main() {
  assertShotsDeployment({
    configured: process.env.CONVEX_DEPLOYMENT,
    allowed: process.env.SHOTS_CONVEX_DEPLOYMENT,
  });

  const res = await fetch(BASE_URL).catch(() => null);
  if (!res) {
    console.error(`Cannot reach ${BASE_URL}. Start the app first:\n\n  pnpm dev:all\n`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const authContext = await ensureSignedIn(browser);
  await authContext.close();

  const cafeIdRaw = convexRun('seed:cafeIdByName', { name: CAFE_NAME }).trim();
  const cafeId = JSON.parse(cafeIdRaw);
  if (!cafeId) throw new Error(`No cafe named "${CAFE_NAME}" — signup did not complete.`);
  convexRun('seed:run', { cafeId, purge: true, seed: SEED, days: 60 });
  const qrToken = JSON.parse(convexRun('seed:qrTokenForCafe', { cafeId }).trim());

  mkdirSync(OUT_DIR, { recursive: true });
  const shots = SHOT_MANIFEST;
  const failures = [];

  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({
      storageState: STATE_PATH,
      reducedMotion: 'reduce',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    // Pinned pre-paint: both are read by the root theme script before first
    // paint, so setting them here avoids a toggle click and a flash of the
    // wrong theme in the capture.
    await context.addInitScript(
      ([t]) => {
        localStorage.setItem('kodapos.theme', t);
        localStorage.setItem('kodapos.locale', 'id');
      },
      [theme]
    );
    const page = await context.newPage();

    for (const shot of shots) {
      const path = shot.path.replace(':qrToken', qrToken ?? '');
      try {
        await page.goto(`${BASE_URL}${path}`);
        await page.waitForLoadState('networkidle');
        await unlockPin(page);
        await page.waitForSelector(shot.waitFor, { timeout: 20_000 });
        // Geist loads from Google Fonts with display=swap and nothing in the app
        // waits for it. Without this the capture races the font swap (FOUT).
        await page.evaluate(() => document.fonts.ready);
        const png = await page.screenshot({ type: 'png' });
        const out = resolve(OUT_DIR, `${shot.id}-${theme}.webp`);
        await sharp(png).webp({ quality: 82 }).toFile(out);
        const bytes = statSync(out).size;
        if (bytes > MAX_BYTES) {
          console.warn(
            `  ! ${shot.id}-${theme}.webp is ${Math.round(bytes / 1024)}KB (budget 150KB)`
          );
        }
        console.log(`  ok ${shot.id}-${theme}.webp`);
      } catch (err) {
        failures.push(`${shot.id}-${theme}: ${err.message}`);
        console.error(`  FAILED ${shot.id}-${theme}: ${err.message}`);
      }
    }
    await context.close();
  }

  await browser.close();

  if (failures.length > 0) {
    console.error(`\n${failures.length} shot(s) failed:\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log(`\nCaptured ${shots.length * 2} screenshots into public/shots/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
