// Régénère les captures de la landing page à partir de l'application locale et de la famille fictive.
// Prérequis : `npm run dev` (http://localhost:3000), Chromium installé, `playwright-core` disponible
// (ex. `npm i --no-save playwright-core`). Usage : node docs/landing/captures.mjs <dossier-de-sortie>
// Les PNG produits sont ensuite recadrés et convertis en WebP (voir docs/landing-page.md).
import { chromium } from 'playwright-core';
import path from 'path';

const out = path.resolve(process.argv[2] || 'captures');
const ged = path.resolve(import.meta.dirname, 'famille-vallier-fictive.ged');
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const browser = await chromium.launch({ executablePath });

// 1. Premier lancement : mentions, création de l'arbre, import du GEDCOM fictif
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/');
await page.locator('input[type=checkbox]').first().check();
await page.getByRole('button', { name: /Commencer/ }).click();
await page.getByPlaceholder(/Famille Coste/).fill('Famille Vallier (exemple fictif)');
await page.getByRole('button', { name: /Créer l'arbre et continuer/ }).click();
await page.locator('input[type=file]').first().setInputFiles(ged);
await page.getByRole('button', { name: /Finaliser/ }).click();
await page.waitForTimeout(1500);
const hideGuides = page.getByRole('button', { name: /Masquer les guides/ });
if (await hideGuides.count()) await hideGuides.first().click();
await page.waitForTimeout(4000); // laisse disparaître la notification « Arbre activé »
const state = await ctx.storageState();

const shot = async (p, name) => { await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/${name}.png` }); };

// 2. Vues bureau (onglets)
await shot(page, 'tree');
for (const [tab, name] of [['Fiche', 'profile'], ['Chronologie', 'timeline'], ['Stats', 'stats'], ['Carte', 'map']]) {
  await page.getByRole('button', { name: tab, exact: true }).first().click();
  await shot(page, name);
}
await page.waitForTimeout(6000); // géocodage des communes
await shot(page, 'map');

// 3. Vue bureau accessible par le menu
await page.getByRole('button', { name: 'Menu principal' }).click();
await page.getByText('Graphe des relations', { exact: true }).click();
await shot(page, 'graph');

// 4. Vues mobiles
const mobile = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
const m = await mobile.newPage();
await m.goto('http://localhost:3000/');
await m.waitForTimeout(4000);
await shot(m, 'm-tree');
await m.getByRole('button', { name: 'Fiche', exact: true }).first().click();
await shot(m, 'm-profile');

await browser.close();
console.log(`Captures écrites dans ${out}`);
