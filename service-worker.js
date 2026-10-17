// Service worker minimal : pass-through, aucun cache.
// Suffit pour que le navigateur considère astrolab comme PWA installable
// (critère : manifest valide + SW enregistré). Les mises à jour arrivent
// instantanément à chaque chargement, sans invalidation de cache à gérer.
// Si un jour on veut du vrai offline, remplacer par stale-while-revalidate
// sur les assets statiques et network-first sur index.html.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pas d'event.respondWith() → le navigateur gère la requête normalement.
});
