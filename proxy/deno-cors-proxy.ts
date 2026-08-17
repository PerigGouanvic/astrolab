// astrolab — Proxy CORS pour Swiss Ephemeris asteroid files
//
// Déploie sur Deno Deploy : https://dash.deno.com/new
// - Auth GitHub, Playground, copier-coller ce fichier, Save & Deploy.
// - URL obtenue type https://astrolab-ephe.deno.dev
// - Dans astrolab, cliquer ⚙ et mettre : https://<ton-url>.deno.dev/
//   (avec slash final)
//
// Format d'appel : https://<proxy>/https://ephe.scryr.io/ephe/astN/seNNNNNs.se1
// (le path après le domaine du proxy = URL upstream complète)
//
// Sécurité : whitelist regex — n'accepte QUE les fichiers .se1 sur
// ephe.scryr.io/ephe/astN/. Pas un open proxy.

const ALLOWED = /^https:\/\/ephe\.scryr\.io\/ephe\/ast\d+\/se\d{5}s?\.se1$/i;
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

  // Le path (sans le slash initial) est l'URL upstream complète.
  const target = url.pathname.slice(1) + url.search;
  if (!ALLOWED.test(target)) {
    return new Response(
      "Bad target — only https://ephe.scryr.io/ephe/astN/seNNNNNs.se1 allowed",
      { status: 400, headers: CORS_HEADERS },
    );
  }

  try {
    const upstream = await fetch(target, { method: req.method });
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
