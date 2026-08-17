# astrolab — proxy CORS pour astéroïdes

Pourquoi ce proxy existe :

- Le mirror upstream Swiss Ephemeris (<https://ephe.scryr.io>) sert les fichiers `.se1` par astéroïde (~27 000 disponibles) **mais sans header CORS**.
- Un browser refuse donc de fetcher ces fichiers directement depuis `https://periggouanvic.github.io/astrolab/`.
- Ce proxy relaie uniquement les chemins `/ephe/astN/seNNNNNs.se1` en ajoutant `access-control-allow-origin: *`. Aucun autre chemin n'est autorisé (whitelist regex).

## Déploiement (Deno Deploy — recommandé, gratuit)

1. Aller sur <https://dash.deno.com/new> et se connecter avec GitHub.
2. Choisir **Playground** (le plus simple) ou **Deploy from GitHub**.
3. Copier-coller le contenu de `deno-cors-proxy.ts` dans l'éditeur.
4. Cliquer **Save & Deploy**. Deno donne une URL type `https://astrolab-ephe-XXXX.deno.dev`.
5. Ouvrir `../app.js` et remplacer la constante `PROXY_BASE` par cette URL (sans slash final).
6. Commit + push. GitHub Pages sert la nouvelle version.

## Alternatives

- **Cloudflare Workers** : script similaire, ~10 lignes en Workers-flavored JS. Interface `dash.cloudflare.com`.
- **Vercel Edge Function** : `api/ephe/[...path].ts` avec la même logique.
- **Un serveur perso** avec `nginx` : `proxy_pass https://ephe.scryr.io;` + `add_header Access-Control-Allow-Origin *;`.

## Tester le proxy

```bash
curl -sI https://<ton-url>.deno.dev/ephe/ast0/se00080s.se1
# doit renvoyer HTTP/2 200 + access-control-allow-origin: *
# (Sappho, MPC 80, ~60 KB)
```

## Notes

- **Cache** : Deno Deploy cache-t le proxy via son edge CDN, et le `cache-control: max-age=604800` incite les browsers à conserver 7 jours. Les fichiers ne changent quasiment jamais.
- **Coût** : Deno Deploy gratuit couvre 1M requêtes/mois. Un utilisateur qui ajoute 100 astéroïdes = 100 requêtes une fois, puis rien (cache). Aucun risque de dépasser.
- **Licence** : ce proxy ne modifie pas les fichiers, il relaie. Les fichiers restent sous licence Astrodienst/AGPL.
