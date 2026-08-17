# astrolab — proxy CORS pour astéroïdes

## Pourquoi ce proxy existe

- Le mirror upstream Swiss Ephemeris (<https://ephe.scryr.io>) sert les fichiers `.se1` par astéroïde (~27 000 disponibles) **mais sans header CORS**.
- Un browser refuse donc de fetcher ces fichiers directement depuis `https://periggouanvic.github.io/astrolab/`.

## Défaut : proxy.cors.sh (aucun déploiement)

Par défaut, `astrolab` utilise **`https://proxy.cors.sh/`** — service public, gratuit, sans clé API pour un usage modéré, marche out of the box. Rien à faire.

Limites : dépendance à un tiers ; si le service change de politique (rate limit, clé API obligatoire), il faudra basculer.

## Alternative : ton propre proxy Deno Deploy (souveraineté)

Si tu veux t'affranchir de la dépendance externe :

1. Aller sur <https://dash.deno.com/new> et se connecter avec GitHub.
2. Choisir **Playground**.
3. Copier-coller le contenu de `deno-cors-proxy.ts` dans l'éditeur.
4. Cliquer **Save & Deploy**. Deno donne une URL type `https://astrolab-ephe-XXXX.deno.dev`.
5. Dans astrolab, cliquer le bouton **⚙** en haut, et coller `https://astrolab-ephe-XXXX.deno.dev/` (avec le slash final).
6. La page recharge, tes astéroïdes utilisent maintenant ton proxy.

## Format d'appel

Les deux proxys (cors.sh et Deno) partagent la même convention : le préfixe reçoit **l'URL upstream complète** en suffixe.

```
https://proxy.cors.sh/https://ephe.scryr.io/ephe/ast0/se00080s.se1
https://<ton-deno>.deno.dev/https://ephe.scryr.io/ephe/ast0/se00080s.se1
```

Le Deno proxy fourni ici valide que la cible correspond bien au pattern autorisé — ce n'est pas un open proxy.

## Autres alternatives

- **Cloudflare Workers** : script similaire, adaptation triviale de `deno-cors-proxy.ts`. Interface `dash.cloudflare.com`.
- **Vercel Edge Function** : `api/[[...path]].ts` avec la même logique + bouton Vercel Deploy.
- **Un serveur perso** avec `nginx` : `proxy_pass` + `add_header Access-Control-Allow-Origin *;`.

## Tester

```bash
curl -sI 'https://proxy.cors.sh/https://ephe.scryr.io/ephe/ast0/se00080s.se1'
# doit renvoyer HTTP/2 200 + access-control-allow-origin: *
# (Sappho, MPC 80, ~60 KB)
```

## Notes

- **Cache** : les browsers cachent 7 jours (`cache-control: max-age=604800`). Les fichiers ephemeris ne changent quasiment jamais.
- **Coût Deno Deploy gratuit** : 1M requêtes/mois. Perig avec 100 astéroïdes = 100 requêtes une fois, puis rien. Aucun risque.
- **Licence** : le proxy relaie sans modifier. Les fichiers restent sous licence Astrodienst / AGPL.
