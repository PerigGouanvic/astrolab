# CLAUDE.md — astrolab

Ce fichier oriente les sessions Claude ouvertes **depuis ce dossier**. Le `README.md` voisin décrit l'intention publique ; ici on collecte les décisions déjà prises, les arbitrages en attente et les pointeurs de contexte.

> **Écosystème** — Ce projet fait partie de `~/projects/` — voir **[`../INDEX.md`](../INDEX.md)** pour la vue d'ensemble et les recoupements avec d'autres projets. **Mettre à jour l'index** en cas de changement significatif (statut, reformulation de l'intention, nouveau recoupement identifié).

## Intention (rappel)
Logiciel d'astrologie épuré avec deux enrichissements distincts, visualisations soustractives, et journal utilisateur.

## Décisions prises
- **Mi-points** et **astéroïdes** sont **deux enrichissements distincts** (pas des mi-points d'astéroïdes). Corriger toute reformulation qui les confond.
- Visualisations **soustractives** : montrer les planètes dans les maisons **sans les signes** ; ou les aspects **seuls**, sans autre considération.
- Journal utilisateur : indexer des événements vécus à des positions/moments donnés.
- **Pas de LLM pour l'analyse** dans un premier temps — la valeur vient de la soustraction et du journal.
- **Séquençage du build (2026-08-06)** — construire en trois strates dans cet ordre :
  1. **Socle très épuré** : le cercle, les signes, les maisons, les planètes. Rien d'autre. Priorité à l'esthétique sobre.
  2. **Densification** : ajout de la **gamme des enrichissements** — **par exemple** mi-points, astéroïdes étendus, et **autres spécifications du même genre** (fixed stars, parts arabes, harmoniques, déclinaisons, TNOs, etc. — liste ouverte à préciser avec Perig). À ce stade la logique **soustractive devient le moteur** (sans elle la carte est illisible), pas une feature parmi d'autres.
  3. **Couches personnelles** : accrétion par planète/maison, journal, scrapbook, synastrie intégrée.
  Utiliser une lib de calcul existante (type Swiss Ephemeris) — ne pas réinventer le socle astronomique.

## Questions ouvertes
- Spécifications détaillées à venir (Perig a annoncé « plus tard »).
- Corpus d'astéroïdes : lequel, quelle taille (centaines ou milliers), quelle source.
- Fonctionnalités « vraiment nouvelles » : à énumérer.
- Format d'entrée du journal (structure d'un événement, champs, tags).

## Anti-scope
- Pas de LLM analytique tant que la soustraction et le journal n'ont pas été éprouvés.

## Contexte transversal
Stub issu de la salve de brassage du **2026-07-31**. Nom stabilisé **astrolab** le 2026-08-17 (avant : `_astro/`). Repo public créé le même jour : `PerigGouanvic/astrolab`.

**Mémoire auto de ce projet** — déplacée dans l'arborescence : lire `./memory/MEMORY.md`. Le chemin canonique post-renommage serait `~/.claude/projects/-home-perig-projects-astrolab/memory/` (ancien : `-home-perig-projects-_astro/`).

Pour hériter des préférences utilisateur transversales (langue, cadences, workflow mobile, etc.), lire aussi la mémoire racine des projets :

- `~/.claude/projects/-home-perig-projects/memory/MEMORY.md`

## Origine
- Conversation de brassage (2026-07-31) : `~/.claude/projects/-home-perig-projects/19945d01-8aca-465f-932d-0654f37bd1fc.jsonl`
- Session de suivi / création de ce CLAUDE.md (2026-08-01) : `~/.claude/projects/-home-perig-projects/2292c589-7cb6-4318-995b-7b762647d0ac.jsonl`
