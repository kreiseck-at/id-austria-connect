<img src="https://raw.githubusercontent.com/kreiseck-at/id-austria-connect/main/assets/kreiseck_logo.png" alt="Kreiseck" width="280">

# @kreiseck/id-austria

**Login mit ID Austria (OpenID Connect) für Node.** Framework-agnostischer
Server-Kern: hält das `client_secret`, baut die Authorize-URL, tauscht den Code
gegen das `id_token`, prüft dessen Signatur und liefert ein normalisiertes Profil.
Drittanbieter-Client, nicht mit dem Bund affiliiert.

Von **[Kreiseck](https://github.com/kreiseck-at)** · Lizenz: Apache-2.0.

## Installation

```bash
npm install @kreiseck/id-austria
```

Benötigt Node ≥ 20.

## Schnellstart

```js
const { createIdAustria } = require('@kreiseck/id-austria');

const ida = createIdAustria({
  environment: 'test',                     // 'test' | 'production'
  clientId:     process.env.IDA_CLIENT_ID, // OIDC Client ID (aus SP-Registrierung)
  clientSecret: process.env.IDA_SECRET,    // Client Secret (nur serverseitig!)
  redirectUri:  process.env.IDA_REDIRECT,  // exakt wie im USP registriert
});

// 1) Login starten
const { url, state, nonce, codeVerifier } = await ida.buildAuthorizeUrl();
// url → dorthin weiterleiten; state/nonce/codeVerifier kurzlebig speichern

// 2) Rückkehr verarbeiten (expectedState = der gespeicherte state)
const profile = await ida.handleCallback({
  code, state, expectedState, nonce, codeVerifier,
});
// profile → { bpk, firstName, lastName, birthdate, qaaLevel, raw }
```

Das Paket ist **zustandslos**: `state`/`nonce`/`codeVerifier` werden erzeugt und
beim Callback zurückverlangt — wo sie zwischengespeichert werden (Firestore,
signiertes Cookie, …), entscheidet das aufrufende Projekt.

## Sicherheit

- Nur Authorization Code Flow, **PKCE `S256`**, Token-Auth `client_secret_post`.
- `id_token`-Signatur gegen das JWKS des Issuers geprüft; `iss` gegen den
  gepinnten Umgebungs-Issuer, `aud` gegen die Client ID, `nonce` nach der
  Signaturprüfung.
- **bPK** (`urn:pvpgvat:oidc.bpk`) ist der Personen-Schlüssel — nie `sub`.
- `client_secret` gehört ausschließlich auf den Server, niemals ins Frontend.

## Umgebungen

| `environment` | Issuer |
|---|---|
| `test` | `https://idp.ref.id-austria.gv.at` |
| `production` | `https://idp.id-austria.gv.at` |

Endpoints werden über das Discovery-Dokument des Issuers geladen.

## Service-Provider-Registrierung

Der Einsatz setzt eine eigene Registrierung und Akkreditierung als Service
Provider bei ID Austria voraus (eigene Client ID / Secret / Redirect-URI je
Anwendung). Schritt-für-Schritt-Anleitung inkl. Zuordnung zur Paket-Konfiguration:
[`REGISTRIERUNG.md`](./REGISTRIERUNG.md).

## Lizenz

Apache-2.0 © Kreiseck
