# <img src="public/logo.svg" alt="Genealogor Logo" width="48" height="48" style="vertical-align: middle; margin-right: 12px; display: inline-block;" /> Genealogor — Arbre Familial, Archives Numérisées & Marquage Photo

<div align="center">

**Plateforme moderne de généalogie collaborative, studio d'archives paléographiques, partage sécurisé par branche et mises à jour système automatiques.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%26%20Auth-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Tests](https://img.shields.io/badge/Tests-143%20passés%20(Vitest)-brightgreen?logo=vitest&logoColor=white)](https://vitest.dev/)
[![PWA](https://img.shields.io/badge/PWA-Installable-purple?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Dark Mode](https://img.shields.io/badge/Theme-Sombre%20%26%20Clair-1F2937?logo=affinitydesigner&logoColor=white)](#-thème-sombre-intégral-dark-mode)

[✨ Fonctionnalités](#-fonctionnalités-phares) • [🍔 Menu Hamburger](#-menu-hamburger-organisé-par-catégorie) • [⚙️ Paramètres & Mises à Jour](#️-paramètres-système--mises-à-jour-automatiques) • [🌙 Thème Sombre](#-thème-sombre-intégral-dark-mode) • [📲 Installation PWA](#-bouton-installer-lapplication-pwa) • [🏷️ Marquage Photo](#-marquage-photo-interactif-photo-tagging) • [⚖️ Mentions Légales](#-onboarding--mentions-légales-exonération-de-responsabilité) • [🧪 Tests & Audit](#-tests-automatisés--couverture)

</div>

---

## 🌟 Présentation

**Genealogor** est une suite logicielle généalogique complète pour les historiens familiaux, chercheurs d'archives et familles désireuses de préserver et transmettre leur patrimoine.

Alliant l'esthétique soignée d'une publication d'archive au confort des applications Web modernes, Genealogor propose :
- 🌿 Une navigation intuitive dans l'arbre généalogique avec calcul automatique de la numérotation **Sosa-Stradonitz**.
- 🏷️ Un **studio d'archives paléographique** avec identification faciale des ancêtres sur les clichés d'époque (**Photo Tagging**).
- 🍔 Un **menu Hamburger structuré par catégorie** pour accéder rapidement à toutes les fonctionnalités.
- ⚙️ Un panneau de **paramètres système complet** avec date de release, contrôle des versions, et **moteur de mises à jour automatiques en arrière-plan**.
- 🌙 Un **thème Sombre intégral** et apaisant pour les longues soirées de recherche en archives.
- ⚖️ Un **onboarding interactif avec clause de non-responsabilité juridique** protégeant l'auteur quant aux données généalogiques importées.
- 💡 Des **guides d'aide contextuels rétractables** sur chaque écran et des **infobulles explicatives** sur tous les champs de saisie.
- 📲 Un bouton **« Installer l'application » (PWA)** permettant aux novices d'installer Genealogor sur leur écran d'accueil mobile ou bureau en un seul clic.
- 🔐 Un **partage privé par branche** protégé par mot de passe (sans création de compte obligatoire pour les membres de la famille).

---

## ✨ Fonctionnalités Phares

### 🍔 Menu Hamburger Organisé par Catégorie

Accessible depuis le coin supérieur gauche de la barre de navigation, le tiroir latéral regroupe méthodiquement les fonctionnalités de l'application :

- **🌳 Sélecteur visuel de l'arbre en cours** : Affiche le nom de la famille active, l'identifiant du salon (`roomId`), le nombre d'individus et un bouton d'accès rapide **« Créer / Changer d'Arbre »**.
- **1. 🌿 Exploration & Visualisation** :
   - Gestionnaire Multi-Arbres (bascule et création d'arbres)
   - Vue Arbre Généalogique & Ascendance Sosa
   - Fiche Biographique Individuelle & Chronologie de vie
   - Studio d'Archives & Déchiffrage Paléographique
   - Frise Historique & Repères chronologiques de France
   - Carte des Migrations & Lieux de vie
   - Statistiques Démographiques & Détection de Doublons
- **2. 🤝 Partage & Collaboration** :
   - Partager une branche via lien privé avec mot de passe
   - Salle collaborative temps réel avec compteur de pairs connectés
   - Synchronisation Cloud Firebase Firestore
- **3. 💾 Données & Sauvegardes** :
   - Importer / Exporter au standard GEDCOM 5.5.1
   - Sauvegarde intégrale chiffrée en AES-GCM 256 bits avec dérivation PBKDF2
   - Restauration sécurisée avec sauvegarde préalable d'annulation
- **4. ⚙️ Paramètres Système & Accessibilité** :
   - Paramètres système, version et mises à jour
   - Guide d'accueil, mentions légales et clause de non-responsabilité
   - Bascule du Thème (Clair, Sombre, Automatique selon le système)
   - Installer l'application sur le téléphone ou l'ordinateur (PWA)

---

### 🌳 Gestionnaire Multi-Arbres & Sélecteur Visuel (« Créer / Changer d'Arbre »)

Genealogor permet d'héberger et de naviguer entre **plusieurs arbres généalogiques distincts et hermétiques** sans avoir à manipuler manuellement l'URL :

- **Boîte de dialogue visuelle dédiée (`TreeManagerModal.tsx`)** :
  - **Onglet « Mes Arbres »** : Liste tous les arbres connus localement et distants dans Google Cloud Firestore, avec recherche instantanée, décompte d'individus, badge d'arbre actif et bouton d'ouverture immédiate.
  - **Rejoindre par identifiant** : Saisie directe d'un identifiant de salon partagé par un proche (`famille-dupont-1850`).
  - **Onglet « Créer un nouvel arbre »** :
    - Saisie du nom de famille ou titre (ex : *Famille Bernard*, *Lignée de Keravel*).
    - Génération automatique du slug d'URL et de Firestore conforme aux règles de sécurité (`^[a-zA-Z0-9_\-]+$`).
    - Choix de l'étape suivante : **« 1 : Créer puis 2 : Importer .GED »** (par défaut, ouvre directement l'étape d'import) ou **Partir d'un arbre vierge**.
    - Un identifiant déjà utilisé par un de vos arbres est refusé.
  - **Bouton « Import .GED » par arbre** : ouvre l'étape d'import pour cet arbre (avec avertissement si l'arbre contient déjà des individus, qui seront remplacés).
- **Première utilisation : assistant en 2 étapes (`FirstTimeTreeWizard.tsx`)** :
  - Après l'acceptation des mentions légales, l'administrateur **crée d'abord son arbre** (nom + identifiant), **puis importe son fichier .GED** (ou part d'un arbre vierge).
  - L'import conserve le nom donné à l'arbre (et non le titre générique du fichier GEDCOM).
- **Suppression d'un arbre** (si l'on s'est trompé ou si l'import s'est mal passé) :
  - Bouton **« Supprimer cet arbre »** (arbre actif) ou icône corbeille dans la liste, réservé aux arbres que vous avez créés ; confirmation en retapant l'identifiant de l'arbre.
  - Efface les données locales de l'arbre (individus, archives, accès), le document Firestore et ses sous-collections `archives` / `access`, ainsi que la copie serveur (`DELETE /api/rooms/:roomId`, jeton de salle administrateur exigé). Les membres connectés en sont avertis.
  - Pour un arbre partagé par un proche, l'icône ✕ le retire seulement de votre liste.
  - Si plus aucun arbre n'existe, l'assistant de création réapparaît.
- **Cloisonnement total garanti** :
  - Chaque arbre dispose de sa propre racine Firestore `/trees/{treeId}`, de sa sous-collection d'archives `/trees/{treeId}/archives`, de ses règles d'accès `/trees/{treeId}/access` et de son salon WebSocket indépendant.

---

### ⚙️ Paramètres Système & Mises à Jour Automatiques

Genealogor intègre un système d'exploitation interne pour garantir que les utilisateurs disposent toujours de la version la plus stable et sécurisée :

<div align="center">

| Paramètre | Description |
| :--- | :--- |
| **📅 Date de sortie** | Indique la date de publication officielle de la version déployée (ex : *20 octobre 2026*). |
| **🕒 Dernière vérification** | Affiche la date et l'heure exactes de la dernière recherche de version. |
| **🔍 Bouton « Vérifier les mises à jour »** | Déclenche une requête immédiate avec contournement de cache (`no-store`) vers `/api/system/version`. |
| **⚡ Bouton « Forcer la mise à jour »** | Purge instantanément le cache applicatif (`CacheStorage`), actualise les Service Workers et recharge l'application proprement sans altérer les données généalogiques locales. |
| **🔄 Mises à jour automatiques en arrière-plan** | Service Worker d'arrière-plan (`VersionService`) qui inspecte périodiquement (toutes les 15 à 60 min, paramétrable) la disponibilité d'une nouvelle version et l'installe discrètement dès que l'onglet redevient actif. |

</div>

---

### 🌙 Thème Sombre Intégral (Dark Mode)

Pour faciliter la lecture des vieux manuscrits et réduire la fatigue oculaire lors des recherches nocturnes :
- **3 modes disponibles** : Clair (*ambiance papier vergé et parchemin musée #FBF9F5*), Sombre (*anthracite profond #121418 et noir d'encre #15181E*) ou Automatique (*synchronisé sur le réglage système `prefers-color-scheme`*).
- **Transitions douces** appliquées sur l'arbre, les fiches individuelles, la galerie d'actes, les modales et les tiroirs latéraux.
- **Bouton d'accès rapide** dans la barre de navigation et dans le menu Hamburger.

---

### ⚖️ Onboarding & Mentions Légales (Exonération de Responsabilité)

Conformément aux exigences juridiques et déontologiques relatives aux données personnelles et historiques :
- **Modale d'accueil et d'engagement** affichée automatiquement lors de la toute première visite.
- **Clause de non-responsabilité formelle** :
  > *« Clause d'exonération de responsabilité : L'auteur, développeur et éditeur de cette application déclinent expressément toute responsabilité quant à l'exactitude, la véracité, l'exhaustivité, l'authenticité ou l'usage des données généalogiques, filiations, dates, transcriptions d'actes ou photographies fournies, saisies ou importées par les utilisateurs dans l'application. Chaque utilisateur est seul responsable des informations qu'il renseigne et de leur conformité avec la réglementation relative au respect de la vie privée (RGPD). »*
- Nécessite la consultation et la validation de la clause avant acceptation (conservée en stockage local pour ne pas importuner l'utilisateur ultérieurement).
- Consultable à tout moment depuis le menu Hamburger ou les paramètres système.

---

### 💡 Onboarding Contextuel & Infobulles Explicatives

Pour accompagner les généalogistes débutants sans encombrer les chercheurs aguerris :
- **Bannière d'onboarding contextuelle par écran** :
  - Chaque vue (`tree`, `profile`, `archives`, `timeline`, `map`, `stats`) affiche un bandeau résumant l'objectif de l'écran et fournissant des conseils méthodologiques ciblés.
  - Le bandeau peut être **replié en un clic** ou **masqué définitivement** selon les préférences de l'utilisateur.
- **Infobulles interactives (`InfoTooltip`)** :
  - Des pastilles d'aide discrètes ponctuent les commandes clés (Numérotation Sosa, Recherche, Ascendance vs Descendance, Profondeur de générations, Formats de date grégorien/républicain, Anonymisation des vivants, Cotes d'archives).
  - Au survol ou au clic sur mobile, l'infobulle détaille la fonction du champ.

---

### 📲 Bouton « Installer l'application » (PWA)

Pour les utilisateurs novices ou nomades explorant les fonds d'archives départementales sur tablette ou smartphone :
- **Installation native en un clic** : Dès que le navigateur supporte l'événement `beforeinstallprompt`, un bouton bien visible **« Installer l'application »** apparaît dans la barre de navigation, le menu Hamburger et le menu des paramètres.
- **Expérience plein écran (Standalone)** : L'application s'ouvre comme une application native sans barre d'adresse de navigateur.
- **Fonctionnement hors-ligne garanti** grâce au manifest web (`manifest.json`) et au stockage Local-First.

---

### 🏷️ Marquage Photo Interactif (Photo Tagging)

<div align="center">
  <img src="docs/photo_tagging.jpg" alt="Atelier de marquage de photographies anciennes" width="85%" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);" />
  <p><em>Marquage interactif des visages d'ancêtres sur un cliché d'époque avec fiches d'identité reliées.</em></p>
</div>

- **Repérage spatial sur les portraits** : Cliquez sur un visage pour placer un repère visuel.
- **Liaison instantanée avec l'arbre** : Recherche prédictive pour relier le visage à une fiche individuelle existante.
- **Section dédiée sur la fiche individu** : La fiche biographique récapitule tous les clichés d'archives où la personne est identifiée.
- **Filtres paléographiques** : Contraste élevé, négatif, niveaux de gris et convertisseur républicain (An II – An XIV).

---

### 🛡️ Matrice de Sécurité (6 Piliers de Contrôle)

| Pilier de Contrôle | Mécanisme implémenté | Statut de validation |
| :--- | :--- | :--- |
| **1. Règles Firestore & Isolation** | ABAC strict dans `firestore.rules`. Un utilisateur ne peut ni lire, ni modifier, ni lister l'arbre ou les archives d'une autre famille. Seul l'administrateur ou le propriétaire peut gérer les accès. | ✅ Couvert par tests unitaires dédiés |
| **2. Mode Hors-Ligne & Résilience** | Architecture Local-First avec conteneurs versionnés (`v2.0.0`), file d'attente `PendingChange` et reprise automatique sans écrasement concurrentiel. | ✅ Couvert par tests de corruption et replay |
| **3. Chiffrement des Sauvegardes** | Sauvegardes complètes au format `.genealogor.json` protégées en **AES-GCM 256 bits** avec dérivation **PBKDF2** (100k itérations), contrôle d'intégrité **SHA-256** et sauvegarde de secours pré-restauration. | ✅ Validé avec tests de mauvaises phrases et intégrité |
| **4. Compatibilité GEDCOM Multi-Logiciels** | Standard GEDCOM 5.5.1 testé avec les exports de **Geneanet, Heredis, Geneatique, MyHeritage, FamilySearch**. Prise en charge des familles recomposées, conjoints multiples, dates approximatives (`VERS`, `BET`, `AVANT`, `APRES`), sources et médias `OBJE`. | ✅ Validé en aller-retour (round-trip) sans perte |
| **5. Confidentialité des Personnes Vivantes** | Protection active des contemporains (< 100 ans ou sans date de décès). Anonymisation étanche (`[Privé]`, `[Confidentiel]`, suppression des notes et des lieux précis) appliquée sur toutes les vues, les recherches, les exports, les archives et le temps réel. | ✅ Validé de bout en bout |
| **6. Tests Automatisés & Build** | Suite complète de 124 tests unitaires et d'intégration couvrant 12 modules critiques (P0/P1 sécurité, multi-arbres et tree-manager, cryptographie PBKDF2/RS256, isolation Firestore, persistance durable, contrôle d'erreurs d'écritures Firestore, assainissement strict des secrets, GEDCOM, masquage contemporains). | ✅ 124/124 tests validés, build réussi |

---

## 🧪 Tests Automatisés & Couverture

Pour exécuter la suite complète de 124 tests unitaires sous Vitest :

```bash
npm test
```

### Détail des 17 Suites de Tests (144 tests au total)
1. `src/lib/__tests__/place-gazetteer.test.ts` (8 tests) : Nomenclature des 101 départements français INSEE, détection automatique par code postal à 5 chiffres, noms littéraux, noms historiques républicains/anciens, codes avec parenthèses, extraction de communes et normalisation sans accent.
2. `src/lib/__tests__/archives-templates.test.ts` (3 tests) : Répertoire des 97 archives départementales françaises, génération d'URLs pré-remplies pour Geneanet, FamilySearch, Filae, Gallica BnF, Wikidata et liens directs vers les salles de lecture des AD.
3. `src/lib/__tests__/implex.test.ts` (2 tests) : Calcul d'implexe généalogique, taux global et par génération d'endogamie, ancêtres récurrents sur plusieurs branches Sosa.
4. `src/lib/__tests__/descendance.test.ts` (3 tests) : Numérotation hiérarchique d'Aboville, détection des branches éteintes (individus sans postérité) et calcul d'espérance de vie par cohorte de décennies.
5. `src/lib/__tests__/validation-rules.test.ts` (4 tests) : Détection de cycles généalogiques (DFS avec pile), incohérences chronologiques (décès avant naissance, âge parental impossible) et métriques de complétude.
6. `src/lib/__tests__/multi-tree-manager.test.ts` (10 tests) : Gestionnaire multi-arbres (slugification des titres d'arbres, validation stricte des identifiants alphanumériques `^[a-zA-Z0-9_\-]+$`, persistance locale et tri des arbres récents, intégrité de l'arbre d'exemple).
7. `src/lib/__tests__/p0-p1-priority-audit.test.ts` (30 tests) : Audit prioritaire P0 & P1 (secret HMAC obligatoire en production et interdiction des valeurs par défaut, vérification cryptographique des mots de passe PBKDF2 avec sel, suppression absolue de tout mot de passe en clair dans la persistance JSON et l'API, permissions de stockage 0o700/0o600 et routine de nettoyage temporaire, résilience sur disque éphémère/lecture seule avec réhydratation autoritaire Firestore, validation formelle des jetons Firebase ID Token RS256/aud/iss/exp/révocation, rechargement autoritaire Firestore des règles d'accès, contrôle strict des statuts HTTP pour chaque écriture de règle, détection et arrêt immédiat sur échec partiel sans faux positif, suppression des règles obsolètes, et distinction explicite de la persistance locale vs Firestore).
8. `src/lib/__tests__/p0-websocket-security.test.ts` (12 tests) : Sécurité WebSocket, validation souveraine des rôles côté serveur, contrôle strict de branche sur la ressource réelle (`person:edit`, `archive:add`, `archive:delete`) sans confiance aux attributs client.
9. `src/lib/__tests__/privacy.test.ts` (11 tests) : Confidentialité contemporains (règle des 100 ans, personnes vivantes sans date, anonymisation étanche des fiches individuelles, recherches, exports, archives et flux temps réel).
10. `src/lib/__tests__/security-penetration.test.ts` (11 tests) : Tests de robustesse et d'intrusion (tentatives de dépassement de périmètre, falsification de jetons et payloads malveillants).
11. `src/lib/__tests__/backup-restore.test.ts` (10 tests) : Sauvegarde chiffrée AES-GCM 256 bits, dérivation PBKDF2 (100k itérations), contrôle d'intégrité SHA-256, limites de dimensionnement et sauvegarde de secours pré-restauration.
12. `src/lib/__tests__/firestore-rules-isolation.test.ts` (10 tests) : Isolation multi-arbres Firestore, règles ABAC/RBAC, interdiction stricte des lectures et écritures non autorisées.
13. `src/lib/__tests__/gedcom.test.ts` (8 tests) : Standard GEDCOM 5.5.1 multi-logiciels (Geneanet, Heredis, Gramps), round-trip sans perte, préservation des citations hiérarchiques (`SOUR`, `PAGE`, `NOTE`) et médias (`OBJE`).
14. `src/lib/__tests__/crypto.test.ts` (6 tests) : Primitives cryptographiques Web Crypto, AES-GCM 256, sel aléatoire unique, hachage PBKDF2 et dérivation de clés.
15. `src/lib/__tests__/offline-and-realtime.test.ts` (6 tests) : Architecture Local-First, file d'attente hors-ligne, détection de corruption, reprise sans écrasement et marquage photo interactif.
16. `src/lib/__tests__/prototype-wipe.test.ts` (5 tests) : Protection contre l'effacement de prototype, validation des objets et étanchéité de la mémoire.
17. `src/lib/__tests__/validation-and-merge.test.ts` (5 tests) : Validation chronologique (anomalies de dates, parents trop jeunes), détection de cycles interdits, fusion de doublons sans orphelins.

---

## 🚀 Démarrage Rapide

```bash
# 1. Cloner le projet
git clone https://github.com/nouhailler/genealogorv2.git
cd genealogorv2

# 2. Installer les dépendances
npm install

# 3. Lancer en développement (Serveur unifié Express + Vite + WebSocket)
npm run dev
```

L'application est disponible sur **`http://localhost:3000`**.

---

## ☁️ Déploiement Cloudflare

Cloudflare héberge **l'interface React** (fichiers statiques de `dist/`). Le serveur Express/WebSocket (`server.ts`) n'y est pas exécuté.

### Paramètres de build (Workers ou Pages, connexion au dépôt GitHub)

| Paramètre | Valeur |
| :--- | :--- |
| Gestionnaire de paquets | **npm** (seul `package-lock.json` est versionné, pas de `bun.lock`) |
| Commande de build | `npm run build` |
| Répertoire de sortie | `dist` |
| Version de Node | 22 (fichier `.nvmrc`) |
| Commande de déploiement (Workers) | `npx wrangler deploy` (configuration `wrangler.jsonc`) |

Le routage monopage (retour à `index.html` pour toute URL, ex. `/?room=famille-coste`) est assuré par `not_found_handling: "single-page-application"` sur Workers, et automatiquement par Pages.

### Ce qui fonctionne sur Cloudflare

- Toute l'application en **mode local** (arbres, import/export GEDCOM, archives, sauvegardes chiffrées), données dans le navigateur.
- La **synchronisation Google Cloud Firestore** après connexion Google. Ajoutez le domaine Cloudflare (`*.workers.dev`, `*.pages.dev` ou votre domaine) dans *Firebase Console → Authentication → Settings → Authorized domains*, sinon la connexion Google est refusée.

### Partage d'un arbre par lien (fonctionne sur Cloudflare)

1. Le créateur **se connecte avec Google**, ouvre **Partager** et crée un lien (branche, mot de passe facultatif, masquage des vivants).
2. Une copie en lecture seule de la branche, **compressée et chiffrée (AES-GCM 256)**, est publiée dans Firestore sous `/shares/<jeton>`. Elle est republiée automatiquement à chaque modification de l'arbre et supprimée quand le lien est révoqué ou l'arbre supprimé.
3. Le destinataire ouvre le lien sans compte :
   - **sans mot de passe** : `https://…/?share=<jeton>#k=<clé>` — la clé est dans le fragment `#`, jamais envoyé à un serveur ;
   - **avec mot de passe** : `https://…/?share=<jeton>` — la clé est déchiffrée avec le mot de passe saisi.

#### Alertes de modification

Chaque ajout, modification ou suppression de fiche, modification d'union, ajout ou modification d'archive et chaque personne identifiée sur une photo est consigné dans un journal (100 derniers événements, `change-log.ts`). Ce journal accompagne la copie partagée : les personnes qui consultent un lien voient un **bandeau d'alertes** épinglé sous la barre de navigation, mis à jour en direct, avec le nombre de modifications non lues. Un clic sur une alerte ouvre directement la fiche ou l'archive concernée ; « Tout marquer comme lu » vide le bandeau. Un import GEDCOM ou une restauration produit une seule alerte de synthèse. Les alertes respectent la branche partagée et l'anonymisation des vivants ; le créateur ne reçoit pas d'alerte pour ses propres modifications.

Les images des archives ne sont pas incluses dans la copie partagée (limite de 1 Mo par document Firestore ; un arbre de ~500 personnes occupe environ 60 Ko).

#### Déployer les règles Firestore (obligatoire une fois)

Les règles de `firestore.rules` autorisent la lecture d'un partage par son jeton et réservent l'écriture à son créateur.

- **Console** : Firebase Console → projet `genealogor-1a03d7` → Firestore Database → onglet **Règles** → coller le contenu de `firestore.rules` → **Publier**.
- **Ligne de commande** (`firebase.json` et `.firebaserc` sont fournis) :

```bash
npx firebase-tools login
```

```bash
npx firebase-tools deploy --only firestore:rules
```

### Ce qui nécessite le serveur Node (`npm start`) sur un autre hébergeur

- Le **relais temps réel WebSocket** (présence des membres, modifications en direct).
- Les anciens liens `?room=…&token=inv-…`, vérifiés côté serveur (`/api/auth/room-token`), et la purge serveur à la suppression d'un arbre.

Sans serveur, l'application le détecte (les appels `/api/*` ne renvoient pas de JSON) et passe en mode local + Firestore, sans tentatives de reconnexion en boucle. Pour utiliser un relais hébergé ailleurs, définissez `VITE_WS_URL` (ex. `wss://relais.example.com/ws`) dans les variables de build.

---

<div align="center">
  <sub>Fait avec passion pour la mémoire et la transmission de l'histoire familiale.</sub>
</div>
