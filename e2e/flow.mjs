// End-to-End-Test des Hauptablaufs im iPhone-Format.
// Aufruf: npm run build && npm run e2e   (startet vite preview selbst)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const PORT = 4179;
const BASE = `http://localhost:${PORT}/?debug`;
const shots = process.env.SHOTS || 'e2e/screenshots';
mkdirSync(shots, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
const stopServer = () => { try { process.kill(-server.pid); } catch { /* bereits beendet */ } };
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* startet noch */ }
  if (i > 60) { stopServer(); throw new Error('vite preview startet nicht'); }
  await new Promise((r) => setTimeout(r, 250));
}

const fail = (msg) => { throw new Error(msg); };
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPhone 15'], locale: 'de-DE', timezoneId: 'Europe/Berlin', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-11-25T17:40:00+01:00') });
  await page.goto(BASE);
  await page.getByText('Noch nichts geplant').waitFor();
  await page.screenshot({ path: `${shots}/01-leer.png` });

  // 1) Planen: „Kochen & Essen“, täglich 18:00, 60 Min., Foto Pflicht
  await page.getByRole('button', { name: 'Aktivität planen' }).first().click();
  await page.getByPlaceholder('z. B. Kochen & Essen').fill('Kochen & Essen');
  await page.locator('input[type=time]').fill('18:00');
  await page.getByRole('button', { name: '1 Std.', exact: true }).click();
  await page.getByRole('button', { name: 'Täglich', exact: true }).click();
  await page.locator('.segmented button').filter({ hasText: 'Foto Pflicht' }).click();
  await page.screenshot({ path: `${shots}/02-planen.png` });
  await page.getByRole('button', { name: 'Planen', exact: true }).click();
  await page.getByText('Als Nächstes').waitFor();
  await page.screenshot({ path: `${shots}/03-heute-naechstes.png` });

  // 2) 18:05 → aktuelle Aktivität, starten
  await page.clock.setFixedTime(new Date('2026-11-25T18:05:00+01:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.getByText('Jetzt', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Starten', exact: true }).click();
  await page.getByText(/Läuft seit/).waitFor();
  await page.screenshot({ path: `${shots}/04-heute-laeuft.png` });

  // 3) Abschluss ohne Foto unmöglich
  await page.getByRole('button', { name: 'Foto & fertig' }).click();
  const submit = page.locator('.sheet .btn.lg.primary');
  if (!(await submit.isDisabled())) fail('Abschluss ohne Foto war möglich');

  // 4) Foto wählen, Uploadfehler simulieren, Eingaben bleiben erhalten
  const png = Buffer.from(await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 600;
    const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 800, 600);
    gr.addColorStop(0, '#c06a3a'); gr.addColorStop(1, '#f4d9a0'); g.fillStyle = gr; g.fillRect(0, 0, 800, 600);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(400, 300, 180, 0, 7); g.fill();
    g.fillStyle = '#4f9161'; g.beginPath(); g.arc(360, 270, 60, 0, 7); g.fill();
    g.fillStyle = '#c94'; g.beginPath(); g.arc(450, 330, 70, 0, 7); g.fill();
    return Array.from(new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/png'))).arrayBuffer()));
  }));
  await page.locator('.sheet input[type=file]:not([capture])').setInputFiles({ name: 'essen.png', mimeType: 'image/png', buffer: png });
  await page.locator('.photo-preview img').waitFor();
  await page.locator('.sheet textarea').fill('Gemüsecurry mit Reis');
  await page.screenshot({ path: `${shots}/05-foto-vorschau.png` });
  await page.evaluate(() => { window.__tagwerkFaults.failPhotoSave = true; });
  await page.getByRole('button', { name: 'Foto speichern & abschließen' }).click();
  await page.getByText('Foto nicht gespeichert').waitFor();
  if ((await page.locator('.sheet textarea').inputValue()) !== 'Gemüsecurry mit Reis') fail('Notiz verloren');
  if (!(await page.locator('.photo-preview img').isVisible())) fail('Foto verloren');
  await page.screenshot({ path: `${shots}/06-uploadfehler.png` });

  // 5) Erneut versuchen → abgeschlossen, +35 XP
  await page.evaluate(() => { window.__tagwerkFaults.failPhotoSave = false; });
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await page.getByText('+35 XP · Kochen & Essen').waitFor();
  await page.screenshot({ path: `${shots}/07-xp.png` });

  // 6) Neuladen → keine zusätzlichen XP
  await page.reload();
  await page.locator('a, button').filter({ hasText: 'Profil' }).click();
  await page.getByText('35 XP gesamt').waitFor();
  await page.screenshot({ path: `${shots}/08-profil.png`, fullPage: true });

  // 7) Verlauf: Eintrag mit Foto und Notiz
  await page.locator('button').filter({ hasText: 'Verlauf' }).click();
  await page.getByText('„Gemüsecurry mit Reis“').waitFor();
  await page.locator('.item img.thumb').waitFor();
  await page.screenshot({ path: `${shots}/09-verlauf.png` });
  await page.getByText('„Gemüsecurry mit Reis“').click();
  await page.locator('.photo-full').waitFor();
  await page.screenshot({ path: `${shots}/10-detail.png` });
  await page.keyboard.press('Escape');

  // 8) Wochenübersicht und Planung
  await page.getByRole('button', { name: 'Woche' }).click();
  await page.locator('.weekgrid .cell.hit').first().waitFor();
  await page.screenshot({ path: `${shots}/11-woche.png` });
  await page.locator('button').filter({ hasText: 'Planung' }).click();
  await page.getByRole('button', { name: 'Routinen' }).click();
  await page.getByText('täglich').waitFor();
  await page.screenshot({ path: `${shots}/12-routinen.png` });

  // 9) Am nächsten Tag: neuer Termin aus der Routine, Serie läuft
  await page.clock.setFixedTime(new Date('2026-11-26T08:00:00+01:00'));
  await page.reload();
  await page.getByText('Kochen & Essen').first().waitFor();
  await page.screenshot({ path: `${shots}/13-naechster-tag.png` });

  if (errors.length) fail('Seitenfehler: ' + errors.join('; '));
  console.log('E2E OK – Screenshots in', shots);
} finally {
  await browser.close();
  stopServer();
}
