# Landing page « Découvrir Genealogor »

Page de présentation publique de Genealogor, servie à **https://genealogor.swinux.ch/decouvrir/**.
Elle complète l'application (servie à `/`) sans la remplacer.

## Architecture

| Élément | Choix |
| :--- | :--- |
| Emplacement | `public/decouvrir/` — copié tel quel par Vite dans `dist/decouvrir/` au build |
| Technologie | HTML statique + CSS autonome (`landing.css`) + 40 lignes de JS (`landing.js`, menu mobile) |
| Dépendances ajoutées | Aucune |
| Polices | Plus Jakarta Sans et Playfair Display (Google Fonts), comme l'application |
| Icônes | Tracés Lucide (licence ISC) en sprite SVG inline, comme l'application (`lucide-react`) |
| Mesure d'audience | Aucune |
| Images | Captures réelles en WebP (~250 Ko au total), chargement différé hors hero |

Pourquoi des fichiers statiques plutôt qu'une page React : la page n'a pas besoin du bundle de
l'application (~1 Mo de JS, Firebase, Leaflet). Elle s'affiche immédiatement et n'impose aucune
modification de `vite.config.ts`, de `server.ts` ni du routage de l'application.

## Stratégie d'URL

- `/` reste l'application (inchangée).
- `/decouvrir/` sert la landing page. Sur Cloudflare, un fichier existant est toujours servi avant le
  repli monopage (`not_found_handling: "single-page-application"`), donc aucune règle n'est nécessaire.
- `/decouvrir` (sans barre finale) et `/decouvrir/index.html` redirigent en 307 vers `/decouvrir/`
  (comportement par défaut `html_handling: "auto-trailing-slash"` des assets Cloudflare).
- `public/robots.txt` et `public/sitemap.xml` ont été ajoutés : ces URL renvoyaient auparavant la page
  HTML de l'application.
- Le manifeste PWA (`scope: "/"`) couvre aussi `/decouvrir/` : dans l'application installée, un lien vers
  la landing s'ouvre dans la fenêtre de l'application. Il n'y a pas de service worker, donc aucun conflit de cache.

**Retour arrière** : supprimer `public/decouvrir/` (et éventuellement `robots.txt`, `sitemap.xml`),
reconstruire et redéployer. L'application n'est pas touchée.

## Déploiement Cloudflare

Aucune modification de configuration : la page fait partie de `dist/`.

| Paramètre | Valeur |
| :--- | :--- |
| Installation | `npm ci` (ou `npm install`) |
| Commande de build | `npm run build` |
| Répertoire de sortie | `dist` |
| Node | 22 (`.nvmrc`) |
| Déploiement (Workers, configuration actuelle `wrangler.jsonc`) | `npx wrangler deploy` |
| Variables d'environnement | Aucune pour la landing page |

Test local fidèle au routage Cloudflare : `npm run build` puis `npx wrangler dev`, et ouvrir
http://127.0.0.1:8787/decouvrir/.

## Contenu : règles éditoriales

La page ne présente que des fonctions vérifiées dans le code et dans l'application (audit du 26 octobre 2026).
Points qui conditionnent le texte et qu'il faudra revoir si l'application évolue :

- **Liens familiaux** : ils proviennent du fichier GEDCOM importé. L'application ne permet pas encore de
  relier à la main une personne ajoutée à ses parents, conjoint ou enfants (le formulaire « Ajouter une
  personne » ne crée que la fiche). La page le dit explicitement (carte « Compléter et corriger les fiches », FAQ).
- **Hors ligne** : aucun service worker n'est enregistré ; l'application ne démarre pas sans connexion.
  La page l'indique (section Installation, FAQ). Le README parle à tort de « fonctionnement hors-ligne garanti ».
- **Installation PWA** : vérifiée avec Chromium 156 (`Page.getInstallabilityErrors` vide sur le site en ligne).
- **Stockage** : `localStorage`, non chiffré au repos. L'accueil de l'application affiche
  « Données stockées localement & chiffrement client », formulation à préciser (seuls les sauvegardes et
  les partages sont chiffrés).
- **Firestore** : les règles autorisent aussi les administrateurs du service à lire les arbres ; la page le mentionne.
- **Politique de confidentialité / mentions légales** : aucune page publiée hors de la modale d'accueil.
  À rédiger et faire valider (contenu juridique), puis à lier depuis le pied de page.

## Captures d'écran

Toutes les captures montrent la **famille Vallier, entièrement fictive** (`docs/landing/famille-vallier-fictive.ged`,
12 personnes sur 4 générations). Pour les régénérer :

1. `npm run dev` ;
2. `node docs/landing/captures.mjs /chemin/de/sortie` (Chromium + `playwright-core`) ;
3. recadrer et convertir, par exemple :
   `magick tree.png -crop 1440x830+0+0 +repage -resize 1200x tree-c.png && cwebp -q 78 tree-c.png -o public/decouvrir/images/apercu-arbre.webp`
   (mobiles : `-crop 780x1560+0+0 -resize 480x` ; image de partage : `-crop 1440x756+0+0 -resize 1200x630` en JPEG).

## Tests

- `src/lib/__tests__/landing-page.test.ts` : fichiers référencés existants, ancres internes valides,
  canonique / description / Open Graph, un seul `h1`, CTA vers l'application, absence de traceurs, attributs `alt`.
- Vérifiés manuellement le 26 octobre 2026 (Chromium headless sur `wrangler dev`) : axe-core sans violation
  (WCAG 2 A/AA + bonnes pratiques) à 375, 768 et 1440 px, pas de défilement horizontal, menu mobile au clavier
  (Entrée, Échap avec retour du focus, fermeture au clic sur un lien), aucune erreur console.
