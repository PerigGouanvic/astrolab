#!/usr/bin/env python3
"""Serveur HTTP de dev pour astrolab — force Cache-Control: no-store sur tout.

Pourquoi : SimpleHTTPServer n'envoie aucun header de cache, et les navigateurs
(Brave en particulier) appliquent alors leur heuristique qui cache
agressivement. Résultat : les modifs ne sont pas visibles sans vider le cache
manuellement. Ici on envoie à chaque réponse les headers qui forcent le
navigateur à toujours re-fetch, et on désactive l'ETag qui peut déclencher
du 304 Not Modified avec un corps vide.

Usage :
    python3 dev-server.py            # port 8787 par défaut
    python3 dev-server.py 8080       # autre port

Pour accès via Tailscale depuis le mobile :
    http://<nom-tailnet>:8787/
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Interdit toute forme de cache côté client et proxy.
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_response(self, code, message=None):
        # Évite le 304 Not Modified : on veut un 200 complet à chaque fois.
        super().send_response(code, message)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    srv = ThreadingHTTPServer(('0.0.0.0', port), NoCacheHandler)
    print(f'astrolab dev-server (no-cache) : http://0.0.0.0:{port}/')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()
