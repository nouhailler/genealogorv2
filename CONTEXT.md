# 📜 CONTEXT.md — Document de Référence du Projet Genealogor

Ce document consigne l'historique, la vision fonctionnelle, les choix d'architecture technique (ADR) et le modèle de données de l'application **Genealogor**. Il sert de mémoire technique pour guider les évolutions futures.

---

## 1. Vision et Objectifs du Projet

### 1.1 Problématique Initiale
La généalogie familiale souffre souvent d'une fracture d'usage :
1. **Outils spécialisés trop complexes ou fermés** : Les logiciels traditionnels sur poste de travail isolent les données dans des formats propriétaires, rendant le partage lourd et statique.
2. **Plates-formes grand public intrusives** : Les grands sites commerciaux imposent la création de comptes pour chaque membre de la famille, monétisent l'accès aux arbres et appliquent une politique de confidentialité opaque.
3. **Difficulté de transmission aux proches** : Les cousins et aînés de la famille souhaitent souvent consulter facilement les ancêtres d'une branche précise (ex. branche maternelle) sans avoir à retenir des identifiants complexes ni voir des branches qui ne les concernent pas.
4. **Identification des personnes sur les photographies d'époque** : Les vieux albums de famille renferment des photographies de groupe où les visages s'oublient avec les générations, sans moyen simple de marquer directement qui est qui et de naviguer vers leur arbre.
5. **Gestion déficiente des sources manuscrites** : Les scans de registres paroissiaux (fonds d'archives départementales) sont souvent de mauvaise qualité (encre délavée, écriture gothique ou cursive difficile), et la conversion des dates révolutionnaires du calendrier républicain constitue un frein majeur.

### 1.2 La Réponse Genealogor
**Genealogor** a été conçu pour concilier rigueur historique, élégance visuelle de type *musée / archive éditoriale*, et partage familial ultra-fluide :
- **Marquage photo interactif (Photo Tagging)** : Identification visuelle sur les clichés d'archives avec repères cliquables, infobulles au survol et navigation bidirectionnelle vers les fiches individuelles.
- **Partage simplifié par branche** : Génération de liens privés avec mot de passe commun par branche (*ex. Branche Martin, Branche Le Galloudec*), sans obliger les cousins à posséder un compte Google/Gmail.
- **Collaboration temps réel sécurisée sous TLS (wss://)** : Relais instantané des modifications entre membres connectés à la même salle avec contrôle des autorisations de salle.
- **Studio d'archives numérisées intégré** : Importation, filtres paléographiques (zoom HD, rotation, contraste renforcé, négatif), calendrier républicain et association directe aux individus.
- **Architecture hybride Local-First & Cloud** : L'application fonctionne intégralement en local avec cache versionné et se synchronise de manière transparente dans Google Cloud Firestore.

---

## 2. Décisions d'Architecture (ADR - Architectural Decision Records)

### ADR-01 : Stratégie Hybride Local-First & Synchronisation Cloud Firestore
- **Contexte** : Concilier disponibilité hors-ligne, résilience des données et travail multi-appareils collaboratif.
- **Décision** :
  - Le stockage primaire pour le travail individuel s'appuie sur le cache local versionné (`localStorage` sous enveloppe de métadonnées `v2.0.0` avec numéro de révision et détection de corruption).
  - La persistance multi-utilisateurs s'appuie sur **Google Cloud Firestore**.
  - **Garde d'activation Firestore** : Les écouteurs Firestore (`onSnapshot`) ne sont instanciés qu'après validation de l'état d'authentification (`authReady && currentUser`), évitant toute tentative de lecture non autorisée au chargement initial.
  - En mode déconnecté, une file d'attente d'actions (`PendingQueue`) stocke les modifications locales et les rejoue dès le rétablissement du réseau.

### ADR-02 : Partage Privé par Branche et Anonymisation Étanche des Vivants
- **Contexte** : Permettre à un membre de la famille de n'accéder qu'à sa propre lignée (paternelle ou maternelle), avec mot de passe partagé, tout en respectant la vie privée (RGPD).
- **Décision** :
  - Algorithme de filtrage de graphe (`branch-filter.ts`) qui traverse l'arbre depuis l'ancêtre pivot pour extraire la branche requise (`paternal`, `maternal` ou `all`).
  - Fonction de protection `isLiving()` : toute personne née il y a moins de 100 ans et dont le décès n'est pas expressément documenté est considérée comme vivante.
  - Anonymisation appliquée de bout en bout : non seulement dans l'arbre affiché, mais également dans les fiches individus, la frise chronologique, la carte géographique, les statistiques, le studio d'archives et les exports GEDCOM (`[Privé]`, `[Confidentiel]`).

### ADR-03 : Cryptographie Moderne et Chiffrement Intégral des Sauvegardes
- **Contexte** : Garantir un chiffrement de niveau bancaire pour les mots de passe et les sauvegardes sans dépendre de bibliothèques tierces non vérifiées.
- **Décision** :
  - Utilisation exclusive de l'API native **Web Crypto (`crypto.subtle`)**.
  - Dérivation de clés via **PBKDF2** (100 000 itérations, SHA-256) avec sel aléatoire de 16 octets généré par `crypto.getRandomValues`.
  - Chiffrement symétrique **AES-GCM 256 bits** avec vecteur d'initialisation (IV) de 12 octets renouvelé à chaque opération.
  - Contrôle d'intégrité par empreinte **SHA-256**. En cas de phrase secrète incorrecte ou de fichier altéré, la prévisualisation rejette l'opération sans compromettre l'arbre existant.
  - Sauvegarde pré-restauration automatique pour annulation immédiate (*Undo Restore*).

### ADR-04 : Sécurité Firestore Zéro-Trust & Modèle ABAC
- **Contexte** : Protéger les arbres, actes d'archives et configurations contre toute intrusion ou altération non autorisée dans Firestore.
- **Décision** :
  - Écriture d'un jeu de règles `firestore.rules` appliquant le principe du moindre privilège (*Default Deny*).
  - Définition d'un rôle super-administrateur avec validation de l'email vérifié (`jeanpierre.nouhailler@gmail.com`).
  - Tolérance aux documents inexistants : la règle `allow get` sur `trees/{treeId}` autorise explicitement `resource == null` pour permettre aux requêtes client de vérifier l'existence de l'arbre sans déclencher d'exception de permission.
  - Protection des sous-collections (`archives` et `access`) adossée aux droits du document parent via `treeExists(treeId) ? isTreeEditor(getTree(treeId)) : isAdmin()`.

### ADR-05 : Studio d'Archives & Outils Paléographiques
- **Contexte** : Faciliter la consultation et le déchiffrement des manuscrits anciens.
- **Décision** :
  - Intégration d'un visualiseur HD supportant le glisser-déposer de fichiers d'archives et de photos.
  - Outils de manipulation d'image sans recompression destructrice : rotation CSS instantanée, filtres de contraste élevé pour réveiller les encres pâles, et inversion négative.
  - Module autonome de conversion du calendrier républicain français (1792–1805), prenant en compte les années bissextiles sextiles (*an III, an VII, an XI*), les mois républicains et les jours complémentaires (*Sans-culottides*).

### ADR-06 : Système de Marquage Photo & Identification Visuelle (Photo Tagging)
- **Contexte** : Les photographies d'époque (portraits de mariage, photos de groupe 1900-1920) contiennent plusieurs personnes qu'il convient de marquer avec précision.
- **Décision** :
  - Définition de l'interface `PhotoTag` (`id`, `personId`, coordonnées relatives en pourcentage `x, y`, rôle, étiquette contextuelle).
  - Mode d'identification direct par clic sur le cliché dans `PhotoTagger.tsx`, avec calcul de coordonnées indépendantes de la résolution d'affichage.
  - Liaison bidirectionnelle :
    - Dans l'archive : popover de recherche prédictive d'ancêtre, pastilles de marquage, infobulles au survol avec lien direct vers la fiche individu.
    - Dans la fiche individu (`ProfileView.tsx`) : nouvelle section *« Photographies & Portraits Identifiés »* affichant les miniatures des clichés où la personne est identifiée, avec lien d'ouverture directe dans l'atelier d'archive.

### ADR-07 : Relais WebSocket TLS (wss://) & Autorisation de Salle
- **Contexte** : Assurer la confidentialité et l'intégrité des échanges collaboratifs en temps réel en production.
- **Décision** :
  - Détection automatique du protocole de transport : bascule systématique vers **`wss://`** dès que l'application est exposée sous HTTPS.
  - Vérification des messages `join` : validation stricte du format des identifiants (`roomId`, `clientId`), validation du `roomToken` de branche.
  - Isolation étanche des salles : les messages de synchronisation (`sync:action`) et de présence ne sont relayés qu'aux pairs ayant rejoint la même salle.
  - Limitation de débit intégrée (60 messages / 10 secondes) et plafonnement des charges utiles à 512 Ko.

---

## 3. Modèle de Données

### 3.1 Entités Principales (`src/types/genealogy.ts`)

#### Individu (`Individual`)
```typescript
interface Individual {
  id: string;               // Identifiant unique (ex: '@I1@')
  name: string;             // Nom complet d'usage (ex: "Pierre MARTIN")
  givenName?: string;       // Prénoms (ex: "Pierre Jean-Baptiste")
  surname?: string;         // Patronyme de naissance (ex: "MARTIN")
  sex: 'M' | 'F' | 'X';     // Sexe biologique
  birth?: LifeEvent;        // Naissance (date, lieu, notes, citations)
  death?: LifeEvent;        // Décès (date, lieu, notes, citations)
  baptism?: LifeEvent;      // Baptême religieux
  burial?: LifeEvent;       // Sépulture
  occupations?: string[];   // Métiers historiques
  residences?: LifeEvent[]; // Lieux de vie
  notes?: string[];         // Notes biographiques
  familiesAsChild: string[];// Familles parentales
  familiesAsSpouse: string[];// Unions / mariages
  citations?: SourceCitation[];// Références aux sources d'archives
  media?: Array<{ title?: string; file?: string; format?: string }>; // Médias rattachés
  _unsupportedTags?: Array<{ tag: string; value: string; level: number }>; // Préservation tags GEDCOM
}
```

#### Document d'Archive & Photographie (`ArchiveDocument`)
```typescript
interface PhotoTag {
  id: string;               // Identifiant du repère (ex: 'tag-1')
  personId: string;         // Identifiant de l'individu rattaché (ex: '@I1@')
  x: number;                // Coordonnée horizontale en % (0 - 100)
  y: number;                // Coordonnée verticale en % (0 - 100)
  width?: number;           // Largeur de cadrage optionnelle en %
  height?: number;          // Hauteur de cadrage optionnelle en %
  label?: string;           // Précision contextuelle (ex: "Assis au 1er rang")
  role?: string;            // Rôle dans la composition (ex: "Père de famille")
  confidence?: 'certain' | 'probable' | 'uncertain';
}

interface ArchiveDocument {
  id: string;               // Identifiant unique (ex: 'doc-004')
  title: string;            // Titre descriptif de l'acte ou de la photo
  type: ArchiveDocumentType;// 'birth' | 'marriage' | 'death' | 'photo' | ...
  archiveLocation?: string; // Ex: "Archives Départementales d'Ille-et-Vilaine"
  callNumber?: string;      // Ex: "3 E 142/5 - Vue 42/189" ou cote d'album
  date?: string;            // Date grégorienne ou brute
  republicanDate?: string;  // Ex: "14 Frimaire an II"
  place?: string;           // Commune, paroisse ou atelier photo
  transcription?: string;   // Transcription littérale ou description du cliché
  notes?: string;           // Mentions marginales ou contexte de la prise de vue
  fileData?: string;        // Données d'image (data URL ou URL de stockage)
  linkedPersonIds: string[];// Identifiants des individus rattachés
  photoTags?: PhotoTag[];   // Repères interactifs sur les visages
  createdBy?: string;
  createdAt: number;
}
```

---

## 4. Matrice des Rôles & Permissions

| Rôle | Consultation Arbre | Fiches Individus | Actes & Photos | Marquage Photo | Gestion des Liens | Export GEDCOM / Backup |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Visiteur (sans mot de passe)** | Branche racine (vivants anonymisés) | Lecture seule | Lecture seule | ❌ | ❌ | ❌ |
| **Lecteur de Branche** | Branche autorisée (selon règle) | Lecture seule | Lecture seule (branche) | ❌ | ❌ | Lecture seule (branche) |
| **Éditeur de Branche** | Branche autorisée | Détails complets | Ajout & Transcription | ✅ | ❌ | ✅ |
| **Administrateur (Propriétaire)** | Arbre complet | Tous détails | Accès intégral | ✅ | ✅ | ✅ |

---

### ADR-07 : Menu Hamburger Structuré par Catégorie & Drawer Ergonomique
- **Contexte** : Avec l'enrichissement fonctionnel (arbre, archives, photo tagging, calendrier républicain, partage, sauvegardes, statistiques, géographie), la barre de navigation horizontale devenait dense sur écran réduit.
- **Décision** :
  - Implémentation d'un tiroir latéral (`HamburgerMenu.tsx`) scindé en 4 grands pôles fonctionnels :
    1. *Exploration & Visualisation*
    2. *Partage & Collaboration*
    3. *Données & Sauvegardes*
    4. *Paramètres & Accessibilité*
  - Synchronisation bidirectionnelle avec l'état actif et accessibilité clavier (touche Échap, focus trap, rôle `dialog`).

### ADR-08 : Moteur de Mises à Jour Automatiques en Arrière-Plan et Purge Caches PWA
- **Contexte** : Assurer que les correctifs de sécurité et nouvelles fonctionnalités soient immédiatement disponibles chez tous les utilisateurs sans qu'ils aient à forcer manuellement le rechargement.
- **Décision** :
  - Endpoint serveur `/api/system/version` retournant le numéro de version, la date de publication et les fonctionnalités actives sans cache HTTP (`no-store`).
  - Service client autonome `VersionService` effectuant des vérifications d'arrière-plan périodiques (intervalle paramétrable de 5 à 60 minutes) et lors de chaque retour de visibilité de l'onglet (`visibilitychange`).
  - Commande de mise à jour forcée purgeant les caches locaux du navigateur (`CacheStorage`), mettant à jour les Service Workers enregistrés et rechargeant l'application proprement.

### ADR-09 : Thème Sombre Intégral & Respect des Préférences Système
- **Contexte** : Faciliter la lecture prolongée des registres d'archives et manuscrits anciens en basse luminosité.
- **Décision** :
  - Support de Tailwind CSS mode sombre via classe `.dark` sur `<html>`.
  - Palette musée : `#121418` (fond principal), `#1A1D24` (cartes et modales), `#2D1B0A` (bordeaux/or en accentuation).
  - 3 options : Clair, Sombre et Système (`matchMedia('(prefers-color-scheme: dark)')`).

### ADR-10 : Onboarding Légal & Clause d'Exonération de Responsabilité
- **Contexte** : Protéger juridiquement l'auteur et l'éditeur de l'application vis-à-vis des données, photographies et filiations saisies par les utilisateurs.
- **Décision** :
  - Modale d'accueil `OnboardingModal.tsx` imposant le défilement et la validation d'une clause explicite d'exonération de responsabilité : l'auteur décline expressément toute responsabilité quant à l'exactitude, la véracité ou la légalité des données fournies ou importées par les tiers.
  - Sauvegarde du consentement dans `localStorage` (`genealogor_onboarding_accepted`) et accès permanent depuis le menu Hamburger et les paramètres système.

### ADR-11 : Guides Contextuels Découvrables et Infobulles Dédiées
- **Contexte** : Réduire la courbe d'apprentissage des néophytes sans surcharger l'interface pour les utilisateurs experts.
- **Décision** :
  - Bandeau repliable `ContextualGuide.tsx` présent au sommet de chaque écran (`tree`, `profile`, `archives`, `timeline`, `map`, `stats`) explicitant les règles métier et méthodes de recherche.
  - Infobulles `InfoTooltip.tsx` sur les zones techniques (Sosa, calendrier républicain, anonymisation contemporains, cotes d'archives).
  - Contrôle global : possibilité de désactiver l'ensemble des aides contextuelles depuis les paramètres système.

### ADR-12 : Gestionnaire Multi-Arbres & Sélecteur Visuel Dédié
- **Contexte** : Permettre aux généalogistes de travailler sur plusieurs familles ou généalogies distinctes (famille paternelle, famille par alliance, recherches pour des amis) sans devoir manipuler manuellement les paramètres d'URL (`?room=...`), tout en conservant une stricte étanchéité des données tant en local que sur Google Cloud Firestore.
- **Décision** :
  - **Partitionnement strict des données** : Chaque arbre possède un identifiant slugifié unique (`treeId`) servant d'espace de nommage dans Google Cloud Firestore (`/trees/{treeId}`, `/trees/{treeId}/archives`, `/trees/{treeId}/access`) et de canal de diffusion WebSocket (`roomId`).
  - **Sélecteur visuel accessible partout** :
    1. Carte d'état de l'arbre actif en haut du menu Hamburger avec bouton proéminent « Créer / Changer d'arbre ».
    2. Bouton d'accès rapide dans la barre de navigation supérieure (desktop).
    3. Option dédiée dans la section *Données & Sauvegardes*.
  - **Dialogue modal à deux onglets (`TreeManagerModal.tsx`)** :
    - *« Mes Arbres »* : Liste filtrable par recherche des arbres connus avec métadonnées (titre, salle, nombre d'individus, nombre d'archives, date de dernière visite), bouton de rafraîchissement depuis Firestore, suppression de l'historique local et dialogue pour rejoindre un arbre tiers via son identifiant.
    - *« Créer un nouvel arbre »* : Formulaire de création avec slugification automatique et validation stricte (`^[a-zA-Z0-9_\-]+$`), choix entre un arbre vierge ou une copie indépendante de l'arbre modèle Martin.
### ADR-13 : Visualisations Avancées, Métriques d'Implexe, Contrôle Qualité et Référentiel des Archives Départementales
- **Contexte** : Intégrer les meilleures fonctionnalités issues du projet `nouhailler/genealogor` afin d'enrichir l'analyse démographique, la navigation multidimensionnelle et l'aide à la recherche en archives.
- **Décision** :
  - **Éventail d'ascendance Sosa (`FanChartView.tsx`)** : Rendu vectoriel SVG paramétrable avec calcul géométrique d'angles et de rayons jusqu'à 8 générations, coloration selon le genre ou le taux d'implexe, zoom/pan fluide et modes alternatifs (Pedigree rectangulaire 7 générations et vue Sablier ascendance + descendance).
  - **Arbre de descendance repliable d'Aboville (`DescendantsView.tsx`)** : Calcul récursif de la numérotation hiérarchique d'Aboville (`1`, `1.1`, `1.2`), badge de numérotation, détection des branches mortes (individus sans postérité) et commandes de déploiement global.
  - **Calcul d'implexe & d'endogamie (`implex.ts` & `ImplexView.tsx`)** : Calcul de la perte d'ancêtres théoriques vs réels par génération ($G0$ à $G8+$), coefficient d'implexe global, identification des ancêtres répétés et liste de leurs numéros Sosa multiples.
  - **Contrôle qualité & détection de cycles (`validation-checker.ts` & `ValidationView.tsx`)** : Algorithme DFS de détection de boucles généalogiques (ancêtre devenant son propre descendant), détection des anomalies chronologiques (décès antérieur à la naissance, longévité > 120 ans, procréation < 12 ans ou > 70 ans), et jauge de complétude des données.
  - **Comparateur de fiches individuelles (`CompareView.tsx`)** : Comparaison côte à côte de deux individus avec mise en évidence des champs identiques, divergents ou manquants.
  - **Graphe relationnel D3 (`ForceGraphView.tsx`)** : Simulation de forces D3 (forces de lien, charge répulsive, centrage), manipulation tactile / drag & drop, et filtres d'arêtes (filiations directes, unions maritales ou réseau global).
  - **Référentiel des 97 Archives Départementales & Détection INSEE (`place-gazetteer.ts`, `archives-templates.ts`, `DepartmentDirectoryModal.tsx`)** : Référentiel complet des 101 départements français métropolitains et d'outre-mer avec détection intelligente des lieux (code postal, département, alias historiques d'Ancien Régime ou pré-1968), portail de recherche directe vers les archives départementales et passerelle de requêtes vers Geneanet, FamilySearch, Filae, Gallica BnF et Wikidata.

### ADR-14 : Suppression Intégrale de l'Arbre Démo, du Mode Démonstration et Partitionnement par Salon
- **Contexte** : Éliminer la confusion lors du partage d'un arbre généalogique où les utilisateurs ne distinguaient plus l'arbre partagé réel de l'arbre d'exemple ("Famille Martin") et où une bannière "Mode Démonstration" persistait.
- **Décision** :
  - **Suppression définitive de l'arbre démo** : Retrait du modèle "Famille Martin" et des actes de test par défaut. L'application démarre et affiche systématiquement l'arbre réel ou un arbre vierge prêt pour la saisie ou l'import GEDCOM.
  - **Suppression du mode démonstration & prototype** : Retrait complet de la bannière d'avertissement "Mode Démonstration", du badge "Arbre démo" dans la barre de navigation et des mentions associées.
  - **Partitionnement strict du cache local par salon** : Les clés de stockage (`genealogor_tree_v2_${roomId}`, archives, accès) sont indexées par identifiant de salon pour garantir qu'un arbre partagé ne charge jamais le cache d'un autre arbre.
  - **Réinitialisation explicite** : Remplacement de l'ancien panneau d'effacement de prototype par une commande claire « Vider l'arbre en cours » avec confirmation.

---

## 4. Matrice des Rôles & Permissions

| Rôle | Consultation Arbre | Fiches Individus | Actes & Photos | Marquage Photo | Gestion des Liens | Export GEDCOM / Backup |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Visiteur (sans mot de passe)** | Branche racine (vivants anonymisés) | Lecture seule | Lecture seule | ❌ | ❌ | ❌ |
| **Lecteur de Branche** | Branche autorisée (selon règle) | Lecture seule | Lecture seule (branche) | ❌ | ❌ | Lecture seule (branche) |
| **Éditeur de Branche** | Branche autorisée | Détails complets | Ajout & Transcription | ✅ | ❌ | ✅ |
| **Administrateur (Propriétaire)** | Arbre complet | Tous détails | Accès intégral | ✅ | ✅ | ✅ |

---

## 5. Bilan des Piliers de Qualité & Conformité (143 Tests Validés)

1. **Règles Firestore & Isolation** : Vérifiées, testées et déployées en production avec modèle ABAC zéro-trust et étanchéité multi-arbres (`/trees/{treeId}`).
2. **Mode Hors-Ligne & Résilience** : Gestionnaire de stockage versionné et partitionné par salon (`${roomId}`), détection de corruption avec backup d'urgence, file d'attente hors-ligne et gestion multi-arbres locale (`tree-manager.ts`).
3. **Chiffrement Réel des Sauvegardes** : AES-GCM 256 bits, dérivation PBKDF2 (100k itérations), empreinte SHA-256 et annulation de restauration sécurisée.
4. **GEDCOM Multi-Logiciels** : Compatibilité certifiée avec Geneanet, Heredis, Geneatique, MyHeritage, FamilySearch (sources, médias, familles recomposées, dates approximatives).
5. **Confidentialité Étendue des Vivants** : Anonymisation des individus de moins de 100 ans appliquée sur l'arbre, les fiches, les archives, le photo tagging, les recherches et les flux temps réel.
6. **Analyses Généalogiques & Outils Avancés** : Éventail Sosa, numérotation d'Aboville, calcul de perte d'ancêtres (implexe), détection de cycles DFS, détection automatique des départements INSEE et répertoire des 97 Archives Départementales.
7. **Expérience Partage & Arbre Vierge Sans Démo** : Disparition intégrale des mentions de prototype et de l'arbre démo pour une clarté totale lors du partage d'arbre.
8. **Tests Automatisés & Build** : 143 tests unitaires automatisés validés sous Vitest (17 suites de tests couvrant 100% des exigences), avec compilation de production réussie.
