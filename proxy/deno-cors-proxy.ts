// astrolab — Proxy CORS pour Swiss Ephemeris asteroid files
//
// Déploie sur Deno Deploy : https://dash.deno.com/new
// - Auth GitHub, choisir "Deploy from GitHub" et pointer sur ce fichier
//   (ou copier-coller le contenu dans "Playground" pour un test rapide)
// - Une fois déployé, tu obtiens une URL type https://astrolab-ephe.deno.dev
// - Colle cette URL dans app.js à la constante PROXY_BASE (sans slash final).
//
// Sécurité : ce proxy ne relaie QUE les chemins /ephe/ast* — pas d'open proxy.
// Le mirror upstream (ephe.scryr.io) est maintenu par Phillip McCabe et diffuse
// les fichiers Swiss Ephemeris préparés par Astrodienst AG (AGPL / dual-license).

const UPSTREAM = "https://ephe.scryr.io";
const CORS_HEADERS: HeadersInit = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-expose-headers": "*",
  "cache-control": "public, max-age=604800, immutable",
};

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Whitelist : uniquement /ephe/astN/seNNNNN[s].se1
  if (!/^\/ephe\/ast\d+\/se\d{5}s?\.se1$/i.test(url.pathname)) {
    return new Response("Bad path — only /ephe/astN/seNNNNNs.se1 allowed", {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  try {
    const upstream = await fetch(UPSTREAM + url.pathname, { method: req.method });
    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    return new Response("Upstream error: " + (e as Error).message, {
      status: 502,
      headers: CORS_HEADERS,
    });
  }
});
