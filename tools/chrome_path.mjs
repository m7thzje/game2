// Zoekt een Chromium voor Playwright: CHROME=<pad> of de eerste bestaande uit /opt/pw-browsers (nieuwste eerst).
import fs from 'node:fs'; import path from 'node:path';
export function chromePath() {
  if (process.env.CHROME && fs.existsSync(process.env.CHROME)) return process.env.CHROME;
  const base = '/opt/pw-browsers';
  let dirs = []; try { dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => parseInt(b.split('-')[1]) - parseInt(a.split('-')[1])); } catch (e) { /* geen map */ }
  for (const d of dirs) for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) { const f = path.join(base, d, sub); if (fs.existsSync(f)) return f; }
  return undefined;   // playwright zoekt zelf
}
export const BROWSER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
