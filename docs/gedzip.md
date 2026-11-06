# Export et import GEDCOM 7 avec médias (GEDZIP)

Genealogor exporte l'arbre, les photos et actes numérisés, et les personnes identifiées sur les photos au format
[FamilySearch GEDCOM 7.0](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html), dans une archive
**GEDZIP** (`.gdz`). Menu : **Fichiers & Sauvegardes → Exporter en GEDZIP (.gdz)** / **Importer un fichier .gdz**.

- Pour échanger avec d'autres logiciels compatibles GEDCOM 7 : utilisez le `.gdz`.
- Pour une copie intégrale de Genealogor (règles de partage, liens photo, journal des modifications) : utilisez la
  sauvegarde complète `.genealogor.json`.

## Contenu de l'archive

```
gedcom.ged                         données GEDCOM 7.0 (UTF-8)
media/001-mariage-1935.jpg         un fichier par document d'archive
media/002-acte-de-naissance.pdf
```

- ZIP standard, noms de fichiers en UTF-8, fichiers stockés sans compression (photos et PDF sont déjà compressés,
  comme le recommande la norme). À l'import, les archives compressées (deflate) sont aussi acceptées.
- Un document sans fichier sur l'appareil (ajouté depuis un autre appareil) n'est pas exporté : GEDCOM 7 exige un
  `FILE` par enregistrement multimédia. Le message de fin d'export le signale.
- L'option « Masquer les personnes vivantes » s'applique aussi aux documents, selon la règle de l'application : une
  photo ou un acte récent où figure une personne vivante est exclu ; dans un document mixte, seuls les repères des
  défunts sont conservés.

## Correspondance avec la norme

| Genealogor | GEDCOM 7 |
| --- | --- |
| Document d'archive avec fichier | `0 @On@ OBJE` → `1 FILE media/…` → `2 FORM <type MIME>` → `3 MEDI` (`PHOTO`, `MANUSCRIPT`, `BOOK`, `OTHER`) ; `2 TITL <titre>` |
| Transcription | `1 NOTE` (lignes suivantes en `CONT`) |
| Personne liée au document | `1 OBJE @On@` dans sa fiche `INDI` |
| Famille liée au document | `1 OBJE @On@` dans l'enregistrement `FAM` |
| Personne identifiée sur une photo | `1 OBJE @On@` dans sa fiche, avec `2 CROP` (`TOP`, `LEFT`, `HEIGHT`, `WIDTH` en pixels) et `2 TITL <précision>` |

La zone `CROP` est centrée sur le repère. Sans taille de repère, c'est un carré de 10 % du plus petit côté de l'image,
réduit si besoin pour rester dans l'image (la norme interdit de la dépasser) sans décaler le centre.

À l'import d'un GEDZIP produit par un autre logiciel, une zone `CROP` devient un repère placé en son centre, avec sa
taille ; son `TITL` devient la précision. Un lien sans zone devient une personne liée au document. Un `FILE` qui est
une adresse web, ou absent de l'archive, est signalé.

## Balises d'extension

Déclarées dans `HEAD.SCHMA`. Les autres logiciels peuvent les ignorer ; Genealogor les relit pour restituer les
documents sans perte.

### Dans l'enregistrement multimédia (`0 @On@ OBJE`, niveau 1)

#### _GN_ID
Identifiant Genealogor du document (conservé à l'import). Également utilisé au niveau 2 d'un lien de repère pour
l'identifiant du repère.

#### _GN_TYPE
Type de document : `birth`, `baptism`, `marriage`, `death`, `burial`, `census`, `notarial`, `military`, `livret`,
`photo`, `other`.

#### _GN_DATE
Date de l'acte ou de la prise de vue, texte libre tel que saisi.

#### _GN_PLAC
Commune, paroisse ou lieu de la photo.

#### _GN_REPO
Dépôt d'archives (ex. « AD Corrèze »).

#### _GN_CALN
Cote (ex. « 3 E 142/12, vue 45/210 »).

#### _GN_REPU
Date dans le calendrier républicain.

#### _GN_NOTE
Remarques ou mentions marginales (lignes suivantes en `CONT`).

### Dans un lien de repère (`1 OBJE @On@` d'une fiche, niveau 2)

#### _GN_POS
Position exacte du repère en pourcentage de l'image : `x y` ou `x y largeur hauteur` (ex. `40.5 50.25`). Prioritaire
sur `CROP` à l'import, pour éviter les arrondis en pixels.

#### _GN_CONF
Degré de certitude de l'identification : `certain`, `probable`, `uncertain`.

#### _GN_ROLE
Rôle ou lien de parenté indiqué sur le repère.

#### _GN_ORDER
Rang du repère sur la photo (1, 2, 3…), pour conserver la numérotation affichée.

## Limites

- Les dates des fiches sont exportées telles que saisies : une date hors grammaire GEDCOM (ex. texte libre en
  français) n'est pas convertie.
- Un média intégré hérité d'un import GEDCOM 5.5.1 (`1 OBJE` sans pointeur, interdit en 7.0) est conservé sous forme
  de note « Média d'origine : … ».
- Archive limitée à 4 Gio (pas de ZIP64) ; l'application limite déjà une sauvegarde à 500 Mo.
- Code : `src/lib/gedzip.ts`, `src/lib/zip.ts` ; tests : `src/lib/__tests__/gedzip.test.ts`.
