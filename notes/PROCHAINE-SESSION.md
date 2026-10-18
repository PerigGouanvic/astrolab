# Prochaine session astrolab — à ouvrir en premier

**Contexte** : session nuit 2026-10-17 → 2026-10-18 close. Trois choses livrées : (1) TWA/APK Android installé sur le Pixel de Perig (package `kepler.astrolab.app`, Digital Asset Links via le repo `periggouanvic.github.io`, keystore sauvegardé en 3 copies), (2) Google Drive branché comme source v1 des fiches planètes (bouton ☁ drive, scope `drive.file`, dossier `astrolab/planets/` sur Drive de Perig, sync des 16 planètes effectuée), (3) `content/planets/*.json` + `content/houses.json` retirés du dépôt public après confirmation « tous les contenus ne sont pas à moi » (fichiers extraits de Banzhaf/Woolfolk).

**Lecture préalable minimale** (toutes sessions à venir) :
- `./CLAUDE.md`
- `./memory/MEMORY.md` (index local, ⚡⚡ Drive source v1 en tête)
- `./memory/project_drive_source_v1.md` (synthèse de ce qui est câblé)
- `./memory/feedback_biais_recence_archeologie.md` + `./memory/feedback_discussions_astro_vs_logiciel.md`
- `./memory/feedback_push_sans_permission.md`

**Dernier commit publié** : `b359f50` « Retirer du dépôt public les fiches planètes et houses non originaux ». Précédents : `e7ec372` (Jour 8 : brancher Google Drive), `9cf2d1d` (clôture 2026-10-17 soir).

**Fichiers restés en untracked volontairement** : `ROADMAP.md` (draft à retravailler — voir Chantier B), `_souffle/`, `dev-server.py`, `dist/`.

---

## Décisions en suspens

### ⚡ Scrub historique git — à trancher avec Perig

Les fiches planètes et `houses.json` ont été retirées de HEAD (commit `b359f50`) et sont désormais gitignorées. **Mais elles restent dans les commits antérieurs** sur GitHub public. Quelqu'un qui parcourt `git log` peut encore les récupérer.

Pour un scrub complet : `git filter-repo --path content/planets --path content/houses.json --invert-paths` + `git push --force`. **Destructif** (réécrit tous les SHA en aval, invalide tout clone existant). À ne faire qu'avec aval explicite de Perig.

### Éditeur JSON inline (sans quoi Drive = aller-retour pénible sur mobile)

Pour ajouter du contenu propre dans ses fiches planètes depuis mobile, Perig doit actuellement : ouvrir Drive, télécharger le JSON, l'éditer dans un autre app, réuploader. Impraticable.

Candidat : UI simple dans la modale planète permettant d'éditer `archetype` / `inSign.<signe>` / `inHouse.<n>` directement, qui serialize vers Drive. Prérequis au vrai usage de Drive comme substrat de co-évolution.

---

## Chantiers en file

### Chantier B — Retouche du ROADMAP.md public (voir brief précédent `2026-10-18-session-v01.md`)

Toujours en attente. Draft `ROADMAP.md` untracked à la racine, posé le 2026-10-17 soir avec deux biais structurels documentés dans les fiches feedback. Procédure complète dans l'archive de la session précédente (archéologie obligatoire → rapport → filtre astro/logiciel → petites itérations → pas de commit sans aval).

### Scrapbook sur Drive

Prochaine extension logique du câblage Drive : migrer le scrapbook (actuellement `localStorage`) vers Drive. Résout structurellement le problème de perte des préférences UI entre changements d'URL, et prépare le modèle salon multi-utilisateurs.

### Modèle salon complet

Google Picker (non-contournable) pour que Perig partage un dossier Drive avec un consulté, lecture multi-utilisateurs. Prérequis fonctionnel pour les consultations co-évolutives au-delà des tests avec Perig seul.

### Autres fils ouverts

- **Convivialité mobile** (toujours en file).
- **Zoom SVG sur région** (`viewBox`) — v1-critique mobile selon CLAUDE.md.
- **Capture mobile directe** (caméra + audio MediaRecorder).
- **Jalons** : UI de création/édition (actuellement uniquement via `content/jalons.json` versionné).

---

## Règles non négociables

- Pas de commit sans aval explicite (sauf `push` qui est OK par convention projet, voir `feedback_push_sans_permission.md`).
- Pas d'installation massive sans demander.
- Si prompt de permission Agora échoue, fournir la commande CLI exacte (`claude-perso` ou `claude-travail` selon la hiérarchie du jsonl).
- Rite de clôture obligatoire si session livre du code (fiche mémoire + archivage brief + commit).
