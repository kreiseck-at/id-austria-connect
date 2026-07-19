<img src="https://raw.githubusercontent.com/kreiseck-at/id-austria-connect/main/assets/kreiseck_logo.png" alt="Kreiseck" width="280">

# id-austria-connect

Wiederverwendbare Anbindung an **ID Austria** (OpenID Connect) für eigene
Projekte — Login mit ID Austria einmal sauber kapseln und in mehreren
Anwendungen mit minimalem projektspezifischem Aufwand einsetzen.

Von **[Kreiseck](https://github.com/kreiseck-at)** · Lizenz: Apache-2.0.

Architektur: dünner Client, dicker Server. `@kreiseck/id-austria`
(`packages/node`) ist der framework-agnostische Server-Kern — hält das
`client_secret`, baut die Authorize-URL, tauscht den Code gegen das
`id_token`, prüft dessen Signatur und liefert ein normalisiertes Profil.
Details und Hintergrund: [`docs/design.md`](docs/design.md).

## Installation

```bash
npm install @kreiseck/id-austria
```

## Nutzung

```js
const { createIdAustria } = require('@kreiseck/id-austria');

const ida = createIdAustria({
  environment: 'test',                     // 'test' | 'production'
  clientId:     process.env.IDA_CLIENT_ID, // aus SP-Registrierung (eine URL)
  clientSecret: process.env.IDA_SECRET,    // aus SP-Registrierung
  redirectUri:  process.env.IDA_REDIRECT,  // exakt wie bei der SP-Registrierung
  scopes:       ['openid', 'profile'],     // Default; erweiterbar
});

// 1) Login starten
const { url, state, nonce, codeVerifier } = await ida.buildAuthorizeUrl();
// url → dorthin weiterleiten
// state/nonce/codeVerifier → kurzlebig speichern (Konsument entscheidet wo)

// 2) Rückkehr verarbeiten
const profile = await ida.handleCallback({
  code, state, expectedState: state, nonce, codeVerifier,
});
// profile → { bpk, firstName, lastName, birthdate, qaaLevel, raw }
```

Das Paket ist zustandslos: `state`/`nonce`/`codeVerifier` müssen zwischen
Schritt 1 und 2 vom aufrufenden Projekt zwischengespeichert werden (z. B.
Firestore, signiertes Cookie). Ein vollständiges Referenzbeispiel mit
Firestore-`state` liegt unter [`examples/firebase-functions`](examples/firebase-functions).

## SP-Registrierung

Der Einsatz setzt eine eigene Registrierung als Service Provider bei ID
Austria voraus: `client_id`, `client_secret`, `redirect_uri` sowie die
Akkreditierung der benötigten Attribute (u. a. bPK). Für die
Referenzumgebung (`environment: 'test'`) reicht eine Test-SP-Registrierung;
für den produktiven Einsatz ist die reguläre Akkreditierung als
privatwirtschaftlicher Service Provider nötig.

**Schritt-für-Schritt-Anleitung (USP, Feld-für-Feld, mit Zuordnung zur
Paket-Konfiguration):** [`packages/node/REGISTRIERUNG.md`](packages/node/REGISTRIERUNG.md).

## Weiterführende Doku

- [`packages/node/REGISTRIERUNG.md`](packages/node/REGISTRIERUNG.md) — SP im USP
  anlegen & akkreditieren, Feld → Config-Zuordnung, Projekt-Checkliste.
- [`docs/design.md`](docs/design.md) — Design, Architektur, verifizierte
  Endpoints, Sicherheitsprüfungen, offene Punkte.
- [`examples/firebase-functions`](examples/firebase-functions) — lauffähiges
  Referenzbeispiel mit zwei HTTPS-Functions.

## Lizenz

Apache-2.0 © Kreiseck — siehe [`LICENSE`](LICENSE) und [`NOTICE`](NOTICE).
