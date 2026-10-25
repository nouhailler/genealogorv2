# 📝 CHANGELOG.md — Journal des Modifications

Toutes les modifications notables apportées au projet **Genealogor** sont consignées dans ce fichier.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/), et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [2.11.1] — 2026-10-25

### 👁️ Modifié — Interface épurée en mode lecture seule
- Profil Lecteur (lien de partage) : le bouton « ▾ Gérer » est remplacé par le seul titre de l'arbre, le bouton « Partager » est masqué.
- Le bandeau « Contrôle de cohérence », la section « Contrôle de Cohérence Chronologique » des statistiques et l'outil « Contrôle Qualité & Cycles » sont réservés à l'administrateur.
- Menu latéral du lecteur : plus d'accès à la gestion des arbres, aux liens de partage ni à l'identifiant technique du salon.

## [2.11.0] — 2026-10-25

### 🔔 Ajouté — Alertes de modification de l'arbre
- **Journal des modifications** (`change-log.ts`) déduit de la comparaison des versions successives de l'arbre : fiche ajoutée / modifiée (avec les rubriques : naissance, décès, profession…) / supprimée, union modifiée, archive ajoutée / modifiée / supprimée, personne identifiée sur une photo. Import massif regroupé en une alerte de synthèse. Comparaison insensible à l'ordre des clés et aux champs techniques (pas de fausses alertes après une relecture Firestore).
- **Diffusion à tous les utilisateurs** : le journal (100 derniers événements) est inclus dans la copie chiffrée de chaque lien de partage, filtré selon la branche et anonymisé comme l'arbre ; les destinataires le reçoivent en direct.
- **Bandeau d'alertes** (`ChangeAlertBanner.tsx`) épinglé sous la barre de navigation : nombre de modifications non lues, dernière alerte, liste dépliable, « Tout marquer comme lu ». Un clic ouvre directement la fiche ou l'archive concernée.
- Suivi lu / non lu par arbre et par lien ; à la première ouverture d'un lien, l'historique antérieur n'est pas signalé comme nouveau ; pas d'alerte pour ses propres modifications.
- 12 nouveaux tests (`change-log.test.ts`) — 189 tests au total.

## [2.10.0] — 2026-10-25

### 🔗 Corrigé — Les liens de partage affichaient un arbre vide
- **Cause** : l'arbre n'existait que dans le navigateur du créateur ; le destinataire, non connecté, n'avait accès ni à Firestore ni au serveur Node (absent sur Cloudflare) qui devait valider le jeton.
- **Nouveau partage par lien Firestore** (`share-snapshot.ts`) : copie de la branche partagée, anonymisée si demandé, compressée (gzip) et chiffrée (AES-GCM 256), publiée sous `/shares/<jeton>` (jeton de 128 bits).
  - Lien sans mot de passe : clé dans le fragment `#k=` (jamais transmis aux serveurs). Lien avec mot de passe : clé chiffrée par le mot de passe.
  - Republication automatique (après 3 s sans modification, uniquement si le contenu a changé), suppression à la révocation du lien et à la suppression de l'arbre.
  - Destinataire : consultation sans compte, mises à jour en direct, écran de mot de passe, messages clairs pour un lien révoqué ou incomplet ; ses propres arbres ne sont jamais modifiés.
- Fenêtre **Partager** : connexion Google requise pour créer un lien, liens en lecture seule, anciens liens `inv-` signalés comme inopérants, lien « express » `?room=…&role=viewer` (toujours vide) retiré.
- Règles Firestore : collection `shares` (lecture par jeton, écriture réservée au créateur). Ajout de `firebase.json` / `.firebaserc` pour les déployer.
- La clé de partage n'est jamais diffusée par le relais temps réel ni écrite sur le disque du serveur.
- 11 nouveaux tests (`share-snapshot.test.ts`) — 177 tests au total.
- **Nouveau projet Firebase dédié `genealogor-1a03d7`** (base Firestore `(default)` en Europe, `eur3`) : le projet créé par AI Studio (`geometric-gift-7f6jr`) n'était pas administrable depuis le compte du propriétaire, ce qui empêchait d'y déployer les règles. Les données Firestore de l'ancien projet ne sont pas reprises (l'arbre local et le fichier GEDCOM restent la source).

## [2.9.1] — 2026-10-25

### ☁️ Préparation au déploiement Cloudflare
- Suppression de `bun.lock` : Cloudflare utilisait Bun au lieu de npm (`package-lock.json`, `.npmrc`).
- Ajout de `.nvmrc` (Node 22), du champ `engines` et de `wrangler.jsonc` (ressources statiques `dist/`, routage monopage).
- Suppression de `public/_redirects` (`/* /index.html 200`), inutile sur Pages et source de boucle sur Workers.
- Hébergement statique détecté : sans serveur relais, plus de reconnexion WebSocket toutes les 4 s ni de file d'attente hors-ligne qui ne se vide jamais.
- La file d'attente hors-ligne ne garde plus qu'un seul instantané complet de l'arbre (`tree:update`) au lieu d'un par modification.
- README : section « Déploiement Cloudflare » et URL du dépôt corrigée.

## [2.9.0] — 2026-10-25

### 🌳 Ajouté — Véritable gestion des arbres pour l'administrateur
- **Premier lancement en 2 étapes** : après les mentions légales, l'assistant `FirstTimeTreeWizard` (jusqu'ici jamais affiché) guide l'administrateur : **1. création de l'arbre**, **2. import du fichier .GED** (ou arbre vierge). Plus de création implicite de l'arbre `mon-arbre`.
- **Gestionnaire d'arbres** : « Créer puis importer .GED » est l'option par défaut et ouvre directement l'étape d'import ; le bouton « Import .GED » de chaque arbre utilise la même étape ; un identifiant déjà utilisé est refusé.
- **Écran d'arbre vide** : affiche le nom de l'arbre ciblé par l'import et propose « Créer un nouvel arbre ou changer d'arbre ».

### 🗑️ Corrigé — Suppression d'un arbre réellement complète
- Les données locales étaient effacées sous d'anciennes clés (`genealogor_tree_<id>`) : la suppression vise désormais les clés réelles `genealogor_tree_v2_<id>`, `genealogor_archives_v2_<id>`, `genealogor_access_v2_<id>` et leurs sauvegardes de corruption.
- Firestore : suppression des sous-collections `archives` et `access` avant le document de l'arbre.
- Serveur : nouvel endpoint `DELETE /api/rooms/:roomId` (jeton de salle administrateur obligatoire) qui purge le salon et `data/rooms/<id>.json`, et prévient les membres connectés (`room:deleted`).
- Confirmation renforcée (saisie de l'identifiant), suppression définitive réservée aux arbres créés par l'utilisateur ; retour à l'assistant de création quand plus aucun arbre n'existe.
- L'import GEDCOM conserve le nom de l'arbre au lieu de « GEDCOM File ».
- 4 nouveaux tests (`tree-deletion-and-first-use.test.ts`) — 165 tests au total.

### 🧭 Corrigé — Anomalies d'affichage de l'arbre
- **Sosa incohérent entre Arbre et Fiche** : la vue Arbre renumérotait depuis la personne sélectionnée (toujours « Sosa 1 »). Les numéros sont désormais calculés depuis le de cujus de l'arbre, comme dans la Fiche. L'en-tête distingue « Racine de l'arbre (de cujus) » et « Personne pivot de l'affichage », et l'administrateur peut « Définir comme racine (Sosa 1) ».
- **Cartes coupées sur les bords** : le conteneur défilant était centré par `justify-center`, ce qui rendait la partie gauche d'un arbre large inaccessible. Centrage par marges auto et recentrage automatique du défilement sur la personne pivot.
- **Alerte « âge parental »** : la règle est juste (cas réel du fichier : Jean Dufour ° 1799 père de Jean Dufour ° 1802). Le message nomme désormais le parent et ses dates, et la bannière comme la liste des statistiques ouvrent directement la fiche à corriger.

## [2.8.0] — 2026-10-24

### 🧹 Supprimé & Clarifié — Suppression Complète de l'Arbre Démo & Mode Démonstration
- **Suppression intégrale de l'arbre démo et du mode démonstration** :
  - Suppression de la bannière persistante « Mode Démonstration » et de l'indicateur d'arbre démo dans la barre supérieure.
  - Suppression du modèle codé en dur « Famille Martin » dans la liste des arbres connus et des sélecteurs.
  - L'ouverture d'un arbre partagé ou la création d'un arbre affiche directement l'arbre réel ou un arbre vierge propre prêt pour la saisie ou l'import GEDCOM, sans confusion.
- **Cloisonnement strict du cache local par salon (`roomId`)** :
  - Les données de l'arbre (`genealogor_tree_v2_{roomId}`), des archives et des accès sont désormais indexées par identifiant de salon.
  - Rejoindre un arbre partagé tiers (ex: `?room=famille-dupont`) ne charge plus jamais les données de l'arbre précédent en cache local.
- **Réinitialisation propre de l'arbre actif** :
  - L'action « Effacer le prototype » est remplacée par « Réinitialiser l'arbre » dans le menu Sauvegardes & GEDCOM, permettant de vider l'arbre courant avec confirmation explicite.

## [2.7.0] — 2026-10-23

### 🌟 Ajouté — Intégration des Meilleures Fonctionnalités du Dépôt GitHub (nouhailler/genealogor)
- **🌀 Éventail d'Ascendance Sosa (Fan Chart) & Pedigree 7 Générations (`FanChartView.tsx`)** :
  - Visualisation en éventail géométrique SVG haute précision avec codes couleurs pour les lignées paternelle (bleu), maternelle (rose) et ancêtres implexés (or).
  - Bascule instantanée entre Éventail circulaire, tableau Pedigree rectangulaire (7 générations) et vue Sablier (ascendance et descendance réunies autour du pivot).
  - Sélecteur de profondeur de 4 à 7 générations avec zoom et recentrage.
- **🌿 Descendance Repliable d'Aboville (`DescendantsView.tsx` & `descendance.ts`)** :
  - Arbre de descendance hiérarchique dépliable/repliable avec numérotation standard d'Aboville (`1`, `1.1`, `1.2`, `1.1.1`...).
  - Détection automatique et mise en évidence des branches éteintes (individus sans postérité).
  - Calcul de l'espérance de vie par cohorte de décennies (`computeCohortLifeExpectancy`).
- **🧬 Calculateur d'Implexe & Taux d'Endogamie (`ImplexView.tsx` & `implex.ts`)** :
  - Calcul du taux global d'endogamie et de la perte d'ancêtres théoriques.
  - Statistiques de complétude et taux d'endogamie détaillés par génération (G0 à G8+).
  - Répertoire complet des ancêtres implexés apparaissant sur de multiples branches avec leurs numéros Sosa respectifs.
- **🛡️ Contrôle Qualité, Détection des Cycles & Complétude (`ValidationView.tsx` & `validation-checker.ts`)** :
  - Algorithme de détection des cycles généalogiques interdits (parcours DFS avec pile de détection de boucles d'ascendance).
  - Détection des incohérences chronologiques : décès antérieur à la naissance, longévité > 120 ans, âge parental impossible (< 12 ans ou après décès de la mère).
  - Indicateurs de complétude par champ (dates de naissance/décès, lieux, filiations, professions) et score global de qualité.
- **⚖️ Comparateur Différentiel de Fiches Individuelles (`CompareView.tsx`)** :
  - Outil de comparaison côte à côte de deux individus de l'arbre pour détecter les homonymies, doublons potentiels et recoupements de dates.
  - Mise en évidence visuelle instantanée des critères parfaitement concordants.
- **🕸️ Graphe Relationnel D3 & Physique Interactive (`ForceGraphView.tsx`)** :
  - Simulation de forces relationnelles propulsée par `d3` (forceLink, forceManyBody, forceCenter, forceCollide).
  - Filtre interactif des liens : filiations directes (parents-enfants), mariages (conjoints) ou tous liens.
  - Support du zoom panoramique, glisser-déposer des nœuds (drag & drop) et navigation directe vers les fiches.
- **🏛️ Répertoire des 97 Archives Départementales & Détection INSEE (`place-gazetteer.ts`, `archives-templates.ts`, `DepartmentDirectoryModal.tsx`)** :
  - Moteur de reconnaissance toponymique des 101 départements français avec extraction par code postal (5 chiffres), nom de département actuel, nom pré-réforme/historique (ex: *Loire-Inférieure, Basses-Pyrénées*) ou code entre parenthèses.
  - Modale interactive « Annuaire des 97 Archives Départementales » avec filtrage par région et recherche en direct.
  - Intégration dans les fiches individuelles (`ProfileView.tsx`) de liens directs pré-remplis vers les salles de lecture des AD et les grands portails de recherche (Geneanet, FamilySearch, Filae, Gallica BnF, Wikidata).
- **🧪 144 Tests Automatisés (17 Suites de Tests) sous Vitest** :
  - 20 nouveaux tests unitaires validant le gazetteer toponymique, les templates d'archives, l'implexe, la descendance d'Aboville et la détection de cycles.
  - Taux de réussite de 100 %.

---

## [2.6.0] — 2026-10-22

### 🌟 Ajouté
- **🌳 Sélecteur Visuel Multi-Arbres & Dialogue « Créer / Changer d'arbre »** :
  - **Accès direct depuis le Menu Hamburger** : Carte d'état de l'arbre actif en tête de tiroir latéral avec bouton proéminent « Créer / Changer d'arbre » et entrée de navigation dédiée.
  - **Raccourci Navbar Desktop** : Bouton d'accès rapide dans la barre supérieure affichant le titre de l'arbre actif et ouvrant directement le gestionnaire.
  - **Dialogue modal complet (`TreeManagerModal.tsx`)** :
    - *Onglet « Mes Arbres »* : Liste filtrable par mot-clé des arbres connus (locaux et Firestore), avec badge visuel « Actif », nombre d'individus et d'archives, bouton de rafraîchissement depuis le Cloud Firestore, suppression d'historique local et zone pour « Rejoindre par identifiant ».
    - *Onglet « Créer un nouvel arbre »* : Formulaire de création avec slugification automatique conforme (`^[a-zA-Z0-9_\-]+$`), aperçu en temps réel de l'identifiant technique, et choix entre un arbre vierge ou une copie personnalisée de l'arbre témoin Martin.
  - **Module métier `tree-manager.ts`** :
    - Gestion de l'historique des arbres consultés dans `localStorage` (`genealogor_known_trees_v1`).
    - Slugification robuste des identifiants (suppression des accents français, apostrophes, ponctuation et limitation à 64 caractères).
    - Validation stricte des identifiants techniques et persistance de la salle courante.
  - **Synchronisation Firestore multi-arbres (`firestore-sync.ts`)** :
    - Fonction `listUserTreesFromFirestore` interrogeant les arbres créés par l'utilisateur connecté ou tous les arbres pour le super-administrateur.
    - Synchronisation dynamique de l'URL sans rechargement de page (`history.pushState` avec paramètre `?room=...`).
  - **Suite de tests automatisés (`multi-tree-manager.test.ts`)** :
    - 10 nouveaux tests unitaires validant la slugification, la validation d'identifiant, le tri de récence, la protection de l'arbre modèle et la persistance locale.
    - Total de la suite de tests porté à **124 tests unitaires** (12 suites, 100% de réussite).

---

## [2.5.0] — 2026-10-20

### 🌟 Ajouté
- **🍔 Menu Hamburger ergonomique par Catégories** :
  - Nouveau tiroir latéral interactif accessible depuis la barre supérieure (`HamburgerMenu.tsx`).
  - Catégorisation claire en 4 pôles : *Exploration & Visualisation* (Arbre, Fiches, Archives, Frise, Carte, Statistiques), *Partage & Collaboration* (Partage par branche, Relais WebSocket, Cloud Firestore), *Données & Sauvegardes* (GEDCOM 5.5.1, Sauvegarde chiffrée AES-GCM, Restauration), *Paramètres & Accessibilité*.
- **⚙️ Paramètres Système & Mises à Jour Automatiques en Arrière-Plan** :
  - Modale dédiée `SystemSettingsModal.tsx` affichant la date de release officielle (*20 octobre 2026*) et l'horodatage précis de la dernière vérification.
  - Bouton **« Vérifier les mises à jour »** avec contournement du cache navigateur (`/api/system/version`).
  - Bouton **« Forcer la mise à jour »** purgeant les caches locaux du Service Worker (`caches.delete`) et réenregistrant les workers sans toucher aux données locales.
  - Service d'arrière-plan autonome `VersionService` vérifiant périodiquement les nouvelles versions selon un intervalle paramétrable et à chaque reprise d'activité d'onglet.
- **🌙 Thème Sombre Intégral (Dark Mode)** :
  - Implémentation complète du Dark Mode avec support natif Tailwind CSS (`dark:` classes).
  - Palette soignée : `#121418` pour les fonds, `#1A1D24` pour les cartes et modales, et bordures adoucies en `dark:border-stone-800`.
  - Bascule instantanée à 3 états : Clair, Sombre et Automatique (détection de `prefers-color-scheme`).
- **⚖️ Onboarding avec Clause d'Exonération de Responsabilité Légale** :
  - Dialogue de premier accueil `OnboardingModal.tsx` imposant la lecture et l'acceptation d'une clause de non-responsabilité juridique formelle stipulant expressément que l'auteur et l'éditeur ne sauraient être tenus responsables des données saisies ou importées par les utilisateurs.
- **💡 Onboarding Contextuel & Infobulles par Écran** :
  - Composant `ContextualGuide.tsx` fournissant un bandeau explicatif pliable sur chaque écran (`tree`, `profile`, `archives`, `timeline`, `map`, `stats`) avec conseils méthodologiques.
  - Composant `InfoTooltip.tsx` déployé sur tous les contrôles clés (numérotation Sosa, recherche, profondeur de générations, modes d'arbre, formats de dates, champs biographiques).
- **📲 Bouton « Installer l'application » (PWA)** :
  - Bouton interactif `PwaInstallButton.tsx` détectant l'événement `beforeinstallprompt` pour installer Genealogor directement sur l'écran d'accueil mobile ou desktop en un clic.
- **🎨 Logo Héraldique & Documentation Visuelle** :
  - Logo SVG vectoriel doré et héraldique (`/logo.svg`).
  - Intégration de la capture d'écran de l'application dans la documentation (`docs/app_screenshot.png`).

### 🛡️ Sécurité & Résilience Firestore (P1)
- **Contrôle Strict des Statuts d'Écriture Firestore (`server.ts` & `firestore-sync-action.ts`)** :
  - Vérification systématique du code HTTP `res.ok` sur chaque document de règle d'accès synchronisé.
  - Interruption immédiate et signalement explicite d'erreur en cas d'échec partiel (sans annoncer de synchronisation complète abusive).
  - Suppression physique et marquage effectif des règles révoquées dans Firestore (`revoked: true`).
  - Validation par 114 tests unitaires sous Vitest.

---

## [1.3.0] — 2026-10-15

### 🛡️ Sécurité, Audit & Chiffrement Renforcé
- **Audit & Validation des 6 Piliers de Contrôle Qualité** :
  - **1. Règles Firestore & Isolation multi-familles** : Validation des règles ABAC zéro-trust garantissant l'étanchéité absolue entre familles (tests unitaires dans `firestore-rules-isolation.test.ts`).
  - **2. Résilience Hors-Ligne & Local-First** : Persistance versionnée avec gestionnaire `v2.0.0`, protection contre les corruptions de données avec sauvegarde d'urgence, et replay des modifications via file d'attente `PendingQueue`.
  - **3. Chiffrement Réel des Sauvegardes Exportées** : Implémentation du chiffrement symétrique **AES-GCM 256 bits** avec dérivation **PBKDF2** (100k itérations, SHA-256) pour les fichiers `.genealogor.json`, détection et rejet propre des mauvaises phrases secrètes sans altération de l'état, et sauvegarde de secours pré-restauration pour annulation en un clic.
  - **4. Compatibilité Multi-Logiciels GEDCOM 5.5.1** : Prise en charge éprouvée des exports de **Geneanet, Heredis, Geneatique, MyHeritage, FamilySearch**, incluant les sources d'archives (`TITL`, `AUTH`), les médias (`OBJE`, `FILE`), les familles recomposées à conjoints multiples, les dates approximatives (`VERS`, `BET`, `AVANT`, `APRES`) et la préservation intégrale des balises propriétaires.
  - **5. Confidentialité Étanche des Contemporains** : Protection systématique des personnes nées il y a moins de 100 ans étendue à toutes les vues (Arbre, Fiches, Frise, Carte, Stats), mais aussi à l'atelier d'archives, aux exports GEDCOM et aux flux temps réel (`[Privé]`, `[Confidentiel]`).
  - **6. Suite de Tests Automatisés & Build** : 38 tests unitaires automatisés sous Vitest validés avec 100 % de succès et compilation de production propre.

- **Sécurité TLS WebSocket en Production (`wss://`) & Autorisation de Salle** :
  - Détection automatique et bascule vers **`wss://`** dès que l'application est consultée sous HTTPS.
  - Transmission du jeton d'autorisation de branche (`roomToken`) lors du message `join`.
  - Contrôle d'accès et limitation de débit (rate limit) à 60 messages / 10s côté serveur Express.

---

## [1.2.0] — 2026-10-15

### 🌟 Ajouté
- **Système Interactif de Marquage de Personnes sur Photos (Photo Tagging)** :
  - **Repérage direct sur les photographies et scans** : Clic sur n'importe quelle zone d'un cliché (visage, personne assise/debout) pour placer une étiquette interactive avec coordonnées relatives proportionnelles en pourcentage.
  - **Liaison directe avec l'arbre familial** : Boîte de recherche instantanée pour rattacher le tag à n'importe quel individu de l'arbre généalogique avec indication de son sexe, patronyme et dates de vie.
  - **Infobulles riches & interactives au survol** : Affichage d'une carte d'identité flottante présentant le nom complet, les dates de vie, le rôle ou la précision contextuelle, et un bouton d'accès direct vers sa fiche.
  - **Navigation instantanée vers la fiche ancêtre** : Un clic sur un repère photo ouvre immédiatement la fiche généalogique complète de la personne concernée.
  - **Galerie des photographies identifiées dans la fiche individu (`ProfileView`)** :
    - Nouvelle section dédiée présentant toutes les photographies d'époque où la personne a été marquée, avec vignette haute résolution, badge de positionnement visuel (`✓`) et rôle contextuel.
    - Clic sur une photo depuis la fiche individuelle pour l'ouvrir immédiatement dans l'atelier archives (`ArchivesView`) centrée sur la photo avec les repères activés.
  - **Typologie 'photo' & filtrage d'archives** : Intégration de la typologie *« Photographie / Portrait »* dans le catalogue et ajout d'un filtre rapide *« Photos »*.
  - **Cliché de démonstration enrichi** : Ajout d'un portrait de famille d'époque (1912) avec repères interactifs préconfigurés sur Louis Martin, Henri Martin et Jeanne Martin.
  - **Synchronisation automatique** : Les identifiants des personnes tagguées sont automatiquement répercutés dans `linkedPersonIds` et synchronisés en temps réel via Firestore et le relais local.

---

## [1.1.0] — 2026-10-14

### 🌟 Ajouté
- **Studio d'Archives Numérisées Haute Définition** :
  - Support de l'importation de documents d'archives numérisés (actes de baptême/naissance, mariage, décès/sépulture, recensements, fiches matricules, actes notariés).
  - Visionneuse d'actes haute définition avec zoom fluide, translation panoramique et rotation à 90°, 180° et 270°.
  - Outils d'aide à la paléographie : filtres de contraste renforcé et inversion négative pour la lecture des encres délavées.
  - Convertisseur bidirectionnel du calendrier républicain français (1792–1805) avec prise en compte des années sextiles et des Sans-culottides.
  - Module d'association manuelle des actes aux fiches individuelles et conjugales de l'arbre.
- **Partage Sécurisé par Branche & Liens Privés** :
  - Génération de liens d'invitation uniques avec délimitation du périmètre (*Branche Paternelle*, *Branche Maternelle*, ou *Arbre Complet*).
  - Protection par mot de passe partagé de branche permettant aux proches d'accéder sans obligation de compte Google ou adresse Gmail.
  - Définition de rôles granulaires : *Lecteur*, *Éditeur / Contributeur*, *Administrateur*.
  - Écran de déverrouillage par mot de passe (`PassphraseScreen`) élégant et ergonomique.
- **Collaboration Temps Réel & Présence** :
  - Serveur de relais WebSocket (`server.ts`) avec support des salles virtuelles isolées par famille.
  - Détection en direct des pairs connectés et indicateur de présence dans la barre de navigation.
  - File d'attente hors-ligne (`PendingQueue`) rejouant automatiquement les modifications lors de la reconexion.
- **Sauvegarde Complète & Fusion Intelligente** :
  - Exportation / Importation d'une archive intégrale chiffrée (arbre + actes numérisés + règles d'accès) avec empreinte de contrôle SHA-256.
  - Assistant de fusion pour résoudre les doublons d'individus avec comparaison attribut par attribut.
- **Documentation et Visuels** :
  - Capture d'écran représentative du studio et de l'arbre généré dans `docs/preview.jpg`.
  - Création du `README.md` enrichi avec badges, icônes et présentation fonctionnelle.
  - Rédaction du document de référence `CONTEXT.md` regroupant les décisions d'architecture (ADR).

### ⚡ Modifié
- **Règles de Sécurité Firestore (`firestore.rules`)** :
  - Renforcement du modèle ABAC zéro-trust sur la collection `/trees/{treeId}` et ses sous-collections.
  - Attribution des privilèges administrateur pour l'adresse vérifiée `jeanpierre.nouhailler@gmail.com`.
  - Tolérance aux vérifications sur documents inexistants (`resource == null`) pour éviter les faux positifs d'autorisation.
- **Cycle de Vie et Abonnements Réactifs (`App.tsx` & `firestore-sync.ts`)** :
  - Conditionnement strict de l'instanciation des écouteurs Firestore (`onSnapshot`) à l'état `authReady && currentUser`.
  - Initialisation automatique et transparente de l'arbre distant lors de la première connexion de l'administrateur.
  - Sécurisation des signatures des fonctions de persistance (`saveArchiveToFirestore`, `deleteArchiveFromFirestore`, `saveAccessToFirestore`) avec vérification de l'utilisateur authentifié.

### 🐛 Corrigé
- **Résolution des erreurs de permission Firestore** :
  - Élimination des exceptions `Missing or insufficient permissions` au démarrage lorsque l'utilisateur n'est pas encore connecté.
- **Corrections de typage TypeScript** :
  - Correction de l'accès invalide à la propriété `place` dans `MergeModal.tsx` (`personB.birth.place`).
  - Cast explicite du sel cryptographique vers `BufferSource` dans `crypto.ts` pour conformité stricte avec les définitions Web Crypto API.
  - Validation du compilateur TypeScript (`tsc --noEmit`) avec 0 erreur.

---

## [1.0.0] — 2026-10-13

### 🚀 Initialisation
- Reprise du projet Genealogor et migration vers une stack moderne React 19 + TypeScript + Vite + Tailwind CSS.
- Arbre généalogique interactif avec ascendance, descendance et numérotation Sosa-Stradonitz.
- Fiches biographiques avec événements de vie et visualisations annexes (frise historique, carte de migration, statistiques).
- Parseur et sérialiseur GEDCOM 5.5.1 conformes aux standards de l'industrie généalogique.
- Configuration initiale de Firebase Firestore et Express en mode serveur unifié.
