# Audit Initial et Cartographie de Référence (Phase 0)

**Date :** 14 octobre 2026  
**Application :** Genealogor  
**Version de référence :** 1.0.0  

---

## 1. Inventaire de l'Environnement et des Outils

| Composant | Valeur / Version | Statut |
| :--- | :--- | :--- |
| **Runtime** | Node.js (Linux x86_64) | Opérationnel |
| **Framework Frontend** | React 19.0.1 + Vite 8.3.0 | Opérationnel |
| **Langage & Compilateur** | TypeScript 7.0.2 (`tsc --noEmit`) | 0 erreur (baseline validée) |
| **Style** | Tailwind CSS 4.3.3 | Opérationnel |
| **Serveur Backend** | Express 4.21.2 + ws 8.22.0 (`server.ts`) | Port 3000 opérationnel |
| **Persistance Cloud** | Firebase SDK 13.0.0 + Cloud Firestore | Connecté (`geometric-gift-7f6jr`) |
| **Test Runner** | Vitest 4.1.0 | Installé et configuré |

---

## 2. Cartographie des Flux de Données

```
[Utilisateur / Navigateur]
      │
      ├─► [Interface React & Vues] (Tree, Profile, Archives, Timeline, Map, Stats)
      │         │
      │         ├─► [Validation & Confidentialité isLiving()]
      │         ├─► [Cache Local localStorage & IndexedDB]
      │         │         └─► Format versionné (v2.0) avec intégrité
      │         │
      │         ├─► [Client WebSocket RealtimeClient]
      │         │         └─► ws://localhost:3000/ws
      │         │               └─► Relais de messages vérifiés & bornés
      │         │
      │         ├─► [Client Firestore (firestore-sync.ts)]
      │         │         └─► /trees/{treeId} (ACL vérifiée)
      │         │         └─► /trees/{treeId}/archives/{id}
      │         │         └─► /trees/{treeId}/access/{id}
      │         │
      │         └─► [Export / Sauvegarde Complète]
      │                   ├─► Fichier GEDCOM 5.5.1 (.ged)
      │                   └─► Archive JSON Chiffrée avec Manifeste d'Intégrité
```

---

## 3. Matrice des Écarts & Plan d'Action (Phase 0 -> Phase 1 à 4)

| Exigence | Fichiers Concernés | Constat Initial | Changement Prévu | Test de Validation |
| :--- | :--- | :--- | :--- | :--- |
| **3.1 Règles Firestore** | `firestore.rules` | `allow read, write: if isSignedIn()` sur les sous-collections et arbres sans vérification d'appartenance. | Contrôle strict d'appartenance (ownerId, editors, viewers). Protection des sous-collections via le document parent. Interdiction de modifier `ownerId`. | Tests de permissions positives/négatives et déploiement `DeployRules`. |
| **3.2 Serveur WebSocket** | `server.ts` | Pas de validation de taille de message, pas de vérification de jeton de salle, pas de limitation de débit. | Validation stricte des messages (types autorisés, limite 500 Ko, limitation de débit 50 msg/10s, fermeture propre). | Tests de payloads invalides, dépassement de taille et isolation de salle. |
| **3.3 Confidentialité Personnes Vivantes** | `src/lib/branch-filter.ts` | `isLiving()` renvoie `false` par défaut pour les personnes sans date. | Règle conservatrice : statut vivant/inconnu avec calcul sur la descendance/ascendance. Masquage généralisé (arbres, exports, réseau). | Tests unitaires sur les cas limites (personne sans date, enfant récent, etc.). |
| **3.4 Cryptographie & Secrets** | `src/lib/crypto.ts` | Sel constant et SHA-256 statique pour les mots de passe. | PBKDF2 avec sel aléatoire 16 octets par dérivation, AES-GCM avec IV aléatoire 12 octets et format versionné encapsulé. | Tests unitaires chiffrement/déchiffrement, IV uniques, altération de ciphertext. |
| **4.1 & 4.2 Persistance & Synchronisation** | `src/lib/firestore-sync.ts`, `App.tsx` | Risque d'écrasement silencieux lors des reconnexions. | États explicites (`synced`, `pending`, `syncing`, `offline`, `conflict`, `error`), file d'attente hors-ligne et détection de conflit. | Tests de reprise hors ligne et résolution de conflit. |
| **4.3 Sauvegarde & Restauration** | `src/lib/backup-restore.ts`, `ExportImportModal.tsx` | Pas de manifeste d'intégrité ni de prévisualisation avant restauration. | Sauvegarde complète (arbre, archives, sources, accès) avec checksum SHA-256, manifeste et aperçu avant restauration sécurisée. | Test export -> vérification -> restauration -> comparaison d'intégrité. |
| **5.1 & 5.2 GEDCOM** | `src/lib/gedcom-parser.ts`, `src/lib/gedcom-serializer.ts` | Support basique, perte des champs non reconnus, pas de sources structurées. | Support robuste GEDCOM 5.5.1, conservation des tags inconnus (`_unsupportedTags`), sources et citations, masquage personnes vivantes. | Test aller-retour GEDCOM (import -> export -> import). |
| **6.1 à 6.4 Modèle & Cohérence** | `src/types/genealogy.ts`, `src/lib/validation.ts` | Pas de détection de cycles, pas de contrôle d'anomalies chronologiques. | Entités Sources et Citations, vérification chronologique non bloquante avec motifs clairs, détection de cycles parents/enfants. | Tests de détection d'incohérences (décès avant naissance, etc.). |
| **7. Détection/Fusion Doublons** | `src/lib/duplicate-detector.ts`, `src/components/MergeModal.tsx` | Fonctionnalité manquante ou partielle. | Algorithme de détection multi-critères et modal de fusion champ par champ sans perte de relations. | Tests de fusion et non-perte d'archives/relations. |
