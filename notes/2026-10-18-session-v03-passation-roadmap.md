# Prochaine session astrolab — à ouvrir en premier

**Priorité tranchée par Perig le 2026-10-18 midi : ROADMAP.md public, avec archéologie obligatoire.**

**Statut à la clôture** : bug Drive (sections planète vides en nav privée / APK) résolu commit `19a2231`. Badge version fixé pour ne plus mentir (dérivé de `import.meta.url`). v=75 live sur GitHub Pages, confirmé par Perig (« Youpi »).

## Pourquoi archéologie obligatoire

Perig a dit explicitement : **« il y a des trésors dans les premières sessions »**. Le ROADMAP ne doit pas se faire au fil de la mémoire récente — biais de récence documenté dans `./memory/feedback_biais_recence_archeologie.md`. Les premières conversations contiennent des visions, intuitions, cadrages, décisions qui n'ont pas migré vers la mémoire structurée et seraient perdus si on part du présent.

**Procédure** :
1. Explorer les transcripts JSONL référencés dans `./CLAUDE.md` section Origine (brassage 2026-07-31 et création CLAUDE.md 2026-08-01) + les sessions suivantes jusqu'à la session fondatrice branche 2D 2026-10-05
2. Produire un **rapport archéologique** structuré : visions originelles, décisions prises, décisions abandonnées, promesses au destinataire, intuitions non-encore-livrées
3. Puis seulement, retravailler le `ROADMAP.md` draft (toujours untracked à la racine) en appliquant le filtre astro/logiciel (`./memory/feedback_discussions_astro_vs_logiciel.md`)
4. Petites itérations, pas de commit sans aval

## Lecture préalable obligatoire

1. `./CLAUDE.md`
2. `./memory/MEMORY.md`
3. **`./memory/feedback_biais_recence_archeologie.md`** — règle contre le biais
4. **`./memory/feedback_discussions_astro_vs_logiciel.md`** — filtre éditorial
5. `./memory/feedback_push_sans_permission.md` — règles git
6. `./ROADMAP.md` (untracked) — draft actuel à retravailler

## Chantiers alternatifs si le ROADMAP est trop lourd pour une session

- **Scrapbook sur Drive** (migration localStorage → Drive, prépare le modèle salon)
- **Convivialité mobile + zoom SVG viewBox** (v1-critique si Perig envisage de montrer à un consulté)
- **Clarifier le canal d'édition parallèle** — les 195 lignes apparues entre deux tool-calls dans la session précédente (voir `./memory/project_editeur_cartes_planete.md` section « Observation importante »)

## État des fichiers à la clôture

- Dernier commit : `19a2231` « Fix sections planète vides en nav privée / APK + badge version menteur ». Poussé.
- Untracked (volontaire, pas à commiter sans aval) : `ROADMAP.md`, `_souffle/`, `dev-server.py`, `dist/`, `notes/2026-10-18-session-v03.md`.
- `./memory/project_editeur_cartes_planete.md` mis à jour avec le fix et l'enseignement.

## Règles non négociables (rappel)

- Pas de commit sans aval explicite (push OK par convention projet).
- Si prompt de permission Agora échoue, fournir la commande CLI exacte.
- Rite de clôture obligatoire si session livre du code (fiche mémoire + archivage brief + commit).
- **Habitus de recherche web pour nom propre / tableau clinique / référence ancienne** — pas « ai-je un doute » mais « est-ce que je parle du monde ou je génère depuis le prior » (voir CLAUDE.md racine section « Écosystème des canaux »).
