import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

// Landing page statique servie sous /decouvrir/ (public/decouvrir, copiée telle quelle dans dist/)
const dir = path.resolve(__dirname, '../../../public/decouvrir');
const html = readFileSync(path.join(dir, 'index.html'), 'utf8');

describe('Landing page /decouvrir/', () => {
  it('référence uniquement des fichiers locaux existants', () => {
    const refs = [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)]
      .map(m => m[1])
      .filter(u => !/^https?:/.test(u));
    expect(refs.length).toBeGreaterThan(5);
    for (const ref of refs) {
      const file = ref.startsWith('/')
        ? path.resolve(dir, '../', ref.slice(1))
        : path.join(dir, ref);
      expect(existsSync(file), ref).toBe(true);
    }
  });

  it('pointe les ancres internes vers des sections existantes', () => {
    const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
    for (const id of anchors) expect(html, `#${id}`).toContain(`id="${id}"`);
  });

  it('a les métadonnées SEO attendues et un seul h1', () => {
    expect(html).toContain('<link rel="canonical" href="https://genealogor.swinux.ch/decouvrir/" />');
    expect(html).toMatch(/<meta name="description" content="[^"]{50,}"/);
    expect(html).toContain('property="og:image" content="https://genealogor.swinux.ch/decouvrir/images/og-genealogor.jpg"');
    expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
  });

  it("dirige les appels à l'action vers l'application", () => {
    const ctas = [...html.matchAll(/<a class="btn[^"]*" href="([^"]+)"/g)].map(m => m[1]);
    expect(ctas.filter(h => h === 'https://genealogor.swinux.ch/').length).toBeGreaterThanOrEqual(3);
  });

  it("n'embarque aucun outil de mesure d'audience", () => {
    expect(html).not.toMatch(/gtag|googletagmanager|analytics|plausible|matomo/i);
  });

  it('donne un texte alternatif à chaque image informative', () => {
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
    for (const img of imgs) expect(img, img).toMatch(/\salt="/);
  });
});
