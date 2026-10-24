# Rapport O+ — session Google Drive OAuth bloquée

## Problème initial

Perig ne peut plus se connecter à Google Drive depuis le **navigateur**. L'écran OAuth affiche :

> Accès bloqué : erreur d'autorisation
> pierre.alain.gouanvic@gmail.com (ou perig.gouanvic@gmail.com selon les essais)
> You can't sign in to this app because it doesn't comply with Google's OAuth 2.0 policy for keeping apps secure.

## Diagnostic différentiel critique

**L'APK Android fonctionne** (même CLIENT_ID, même scope, même code `drive.js`). Le navigateur, non. Ce différentiel exclut un bug de code et pointe vers une décision **côté Google Cloud Console** : Google bloque spécifiquement le flux web navigateur tout en tolérant le flux WebView Android.

## Ce que j'ai fait (et défait)

### Erreur 1 : Migration vers initCodeClient (PKCE manuel)
J'ai supposé que `initTokenClient` était l'ancien flux implicite déprécié. **C'était faux.** La librairie GIS (`accounts.google.com/gsi/client`) utilise déjà le flux Authorization Code + PKCE en interne avec `initTokenClient`. Ma migration vers `initCodeClient` a introduit un bug structurel : je générais mon propre `code_verifier`/`code_challenge`, mais GIS en génère aussi un en interne — mismatch garanti.

→ **Reverté.** Le code est revenu à `initTokenClient` (commit `cae7630`).

### Erreur 2 : Allers-retours sur redirect_uri
J'ai ajouté, retiré, remis `redirect_uri: window.location.origin` dans l'échange de token. Avec `initTokenClient`, ce paramètre n'est même pas dans le code — GIS le gère seul. Bruit inutile.

### Erreur 3 : Fallback SHA-256
`crypto.subtle` est undefined sur `http://perig:8787` (contexte non sécurisé). J'ai ajouté une implémentation SHA-256 pure JS. Utile mais hors sujet pour le problème principal. Ce code a été reverté avec le retour à `initTokenClient` (le fallback était dans la version `initCodeClient`).

## État final du code

- `drive.js` : **revenu à l'original** (commit `7163782`, celui d'avant la session). `initTokenClient`, flux GIS standard.
- `app.js` : import `./drive.js?v=8` (bumpé de v=5 à cause des allers-retours)
- `index.html` : import `app.js?v=86` (bumpé de v=83)
- Branche : `astrolab-2d`, pushée sur GitHub

Le code est **fonctionnellement identique** à ce qui tourne sur l'APK. Le problème n'est pas dans le code.

## Où chercher côté Google Cloud Console

Projet : `astrolab-512004` (visible dans l'URL que Perig a partagée : `https://console.cloud.google.com/auth/overview?referrer=search&authuser=1&project=astrolab-512004`)

CLIENT_ID : `178447645683-l3ls02t7f7ksjphqbv87d7m15d7vri5b.apps.googleusercontent.com`

### Pistes par ordre de probabilité

1. **Publishing status** : doit être "Testing". Si "In production", Google exige une vérification complète.

2. **Scopes** : vérifier que seul `drive.file` est listé. Tout scope supplémentaire (même `userinfo.email` ou `openid`) peut déclencher l'exigence de vérification.

3. **Champs branding obligatoires** (si app type = External) : Google a resserré ses exigences. Même en mode Testing, tous ces champs doivent être remplis :
   - App name
   - User support email
   - Developer contact email  
   - App logo (un placeholder carré suffit)
   - **Privacy policy URL** (obligatoire — un lien mort ou absent bloque)
   - **Terms of service URL** (obligatoire — idem)
   
   Ces URLs peuvent pointer vers une page GitHub Pages minimale, mais elles doivent exister et être accessibles.

4. **Emails Google** : chercher dans la boîte `perig.gouanvic@gmail.com` des emails de `google-cloud-compliance@google.com` ou `no-reply@accounts.google.com` avec des sujets comme "Your app is not compliant" ou "Action required: Update your OAuth consent screen". Google envoie toujours un préavis avant de bloquer. Cet email contiendra la raison exacte.

5. **Test users** : `perig.gouanvic@gmail.com` doit être listé. `pierre.alain.gouanvic@gmail.com` aussi si c'est le compte que Google force dans le flux.

6. **Authorized JavaScript origins** : `https://periggouanvic.github.io` et `http://localhost:8787` (Perig les a déjà configurés).

7. **Type d'app** : si "Internal" est disponible (compte Workspace), le passer en Internal contourne la vérification. Si "External", tout doit être rempli (point 3).

## Contexte projet

- Dépôt : `PerigGouanvic/astrolab` sur GitHub
- Branche : `astrolab-2d`
- L'app est une PWA servie sur `https://periggouanvic.github.io/astrolab/`
- Scope OAuth : `drive.file` uniquement
- Stockage : fiches planètes dans `astrolab/planets/`, images scrapbook dans `astrolab/scrapbook/`
- Une APK Android (TWA) est installée sur le Pixel de Perig — elle fonctionne encore pour Drive
- Perig teste aussi depuis `http://perig:8787` (URL dev locale Tailscale) — OAuth ne fonctionnera jamais depuis cette URL car Google refuse les TLD non publics, mais `http://localhost:8787` est autorisé

## Ce qu'il ne faut PAS faire

- **Ne pas toucher à `drive.js`**. Le code fonctionne (preuve : l'APK). Le problème est dans la config Google Cloud Console.
- **Ne pas migrer vers `initCodeClient`**. GIS le fait déjà en interne avec `initTokenClient`.
- **Ne pas jouer avec `redirect_uri`**. GIS le gère seul.