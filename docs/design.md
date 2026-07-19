# id-austria-connect — Design

Wiederverwendbare Anbindung an **ID Austria** (OpenID Connect) für eigene Projekte.
Ziel: Login mit ID Austria einmal sauber kapseln und in mehreren Anwendungen
(kasseneck, Kreiseck, weitere) mit minimalem projektspezifischem Aufwand einsetzen.

## Ausgangslage

ID Austria ist Standard-OpenID-Connect, aber bewusst eng konfiguriert. Aus dem
offiziellen Discovery-Dokument der Referenzumgebung
(`https://idp.ref.id-austria.gv.at/.well-known/openid-configuration`):

- `response_types_supported`: `["code"]` — nur Authorization Code Flow
- `grant_types_supported`: `["authorization_code"]`
- `scopes_supported`: `["openid", "profile"]`
- `code_challenge_methods_supported`: `["S256"]` — PKCE mit SHA-256
- `token_endpoint_auth_methods_supported`: `["client_secret_post"]` — Secret im Body
- `id_token_signing_alg_values_supported`: `RS256` u. a.
- **kein** `userinfo_endpoint` — alle Personenmerkmale stehen im `id_token`

Der `sub`-Claim ist laut Doku *transient* und für Personen-Erkennung ungeeignet;
dafür ist die **bPK** (`urn:pvpgvat:oidc.bpk`) vorgesehen. Im Privatsektor wird die
bPK aus der Stammzahl (Firmenbuchnummer) des Betreibers abgeleitet, ist also pro
Betreiber verschieden — kein betreiberübergreifender Personen-Identifier.

### Verifizierte Endpoints

| | Produktion | Referenz (Test) |
|---|---|---|
| Issuer | `https://idp.id-austria.gv.at` | `https://idp.ref.id-austria.gv.at` |
| Authorize | `…/auth/idp/profile/oidc/authorize` | `…/auth/idp/profile/oidc/authorize` |
| Token | `…/auth/idp/profile/oidc/token` | `…/auth/idp/profile/oidc/token` |
| JWKS | `…/auth/idp/profile/oidc/keyset` | `…/auth/idp/profile/oidc/keyset` |
| Discovery | `…/.well-known/openid-configuration` | `…/.well-known/openid-configuration` |

Die Endpoints werden über das Discovery-Dokument geladen, nicht hartkodiert; die
Issuer-URL je Umgebung ist die einzige feste Angabe.

## Architektur: dünner Client, dicker Server

`client_secret` ist Pflicht und darf niemals ins Frontend. Deshalb zwei Schichten:

- **Server (dieses Paket, Kern):** hält das Secret, baut die Authorize-URL, tauscht
  den Code gegen das `id_token`, prüft dessen Signatur und liefert ein
  normalisiertes Profil. Framework-agnostisch — keine Abhängigkeit zu Express,
  Firebase o. Ä.
- **Client (Adapter, später):** öffnet die Authorize-URL im Browser, fängt den
  Redirect/Deeplink ab, schickt den Code an den Server. Kein Secret, kaum Logik.

## Repo-Struktur (Mono-Repo)

```
id-austria-connect/
├─ README.md                  Landingpage + Doku
├─ docs/design.md             dieses Dokument
├─ packages/
│  └─ node/                   @kreiseck/id-austria  (zuerst; einziger Fokus)
│     ├─ src/
│     │  ├─ index.js          createIdAustria(config)
│     │  ├─ discovery.js      Discovery laden + cachen (je Issuer)
│     │  ├─ authorize.js      buildAuthorizeUrl()
│     │  ├─ callback.js       handleCallback()
│     │  ├─ profile.js        Claims → normalisiertes Profil
│     │  └─ errors.js         typisierte Fehlerklassen
│     └─ test/
└─ examples/
   └─ firebase-functions/     Referenz: 2 Endpoints + Firestore-state
```

Flutter- und Web-Adapter sind bewusst **nicht** Teil dieser Ausbaustufe (YAGNI),
bis der Node-Kern gegen die Referenzumgebung nachweislich läuft.

## Node-Kern: öffentliche API

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
// state/nonce/codeVerifier → kurzlebig speichern (Konsument, s. u.)

// 2) Rückkehr verarbeiten
const profile = await ida.handleCallback({ code, state, nonce, codeVerifier });
// profile → { bpk, firstName, lastName, birthdate, qaaLevel, raw }
```

### Entscheidungen

- **Zustandslos.** Das Paket erzeugt `state`/`nonce`/`codeVerifier` und verlangt sie
  beim Callback zurück. Wo sie zwischengespeichert werden, entscheidet der Konsument
  (Firestore, signiertes Cookie, …). Kein Speicher im Paket → kein Framework-Zwang.
- **Discovery statt Hartkodierung.** Endpoints und Signatur-Keys kommen aus dem
  Discovery-/JWKS-Dokument, pro Prozess gecacht. Nur die Issuer-URL je Umgebung ist
  fix hinterlegt.
- **Normalisiertes Profil.** Die PVP-Claim-Namen werden auf klare Felder gemappt:
  `urn:pvpgvat:oidc.bpk → bpk`, `given_name → firstName`, `family_name → lastName`,
  `birthdate → birthdate`. Die rohen Claims bleiben unter `profile.raw` erreichbar.
- **Personen-Schlüssel ist die bPK**, nie `sub`. Das ist im Profil dokumentiert.
- **PKCE immer an** (`S256`), zusätzlich zu `client_secret_post`.

### Sicherheitsprüfungen im `handleCallback`

- `state` muss mit dem gespeicherten Wert übereinstimmen (sonst `IdaStateMismatchError`)
- `id_token`-Signatur gegen JWKS des Issuers prüfen
- `iss`, `aud` (= `clientId`), `exp`/`iat` prüfen
- `nonce` im Token muss dem gespeicherten entsprechen
- Token-Request mit `client_secret_post` + `code_verifier`

### Fehlerklassen (`errors.js`)

- `IdaConfigError` — fehlende/ungültige Konfiguration
- `IdaStateMismatchError` — state passt nicht (CSRF-Schutz)
- `IdaUserCancelledError` — Nutzer hat bei ID Austria abgebrochen
- `IdaTokenError` — Token-Tausch oder Signatur-/Claim-Prüfung fehlgeschlagen

## Was pro Projekt individuell bleibt

1. Eigene SP-Registrierung: `client_id`, `client_secret`, `redirect_uri`, Akkreditierung
   der beziehbaren Attribute.
2. Konfigurationswerte + Secret-Ablage im jeweiligen Backend.
3. `state`-Zwischenspeicher (im Firebase-Beispiel: Firestore mit TTL).
4. Fachlogik nach dem Login: Nutzer über bPK finden/anlegen, eigene Session ausstellen.

## Firebase-Beispiel (examples/firebase-functions)

Zeigt die dünne Verklebung ohne echte Secrets:

- `idaLogin`: ruft `buildAuthorizeUrl`, legt `{state, nonce, codeVerifier}` unter
  `ida_sessions/{state}` (Firestore, TTL ~10 Min) ab, leitet weiter.
- `idaCallback`: lädt das Session-Doc über `state`, ruft `handleCallback`, löscht das
  Doc, gibt das Profil bzw. eine eigene Session zurück.

Alle Beispielwerte sind klar als Platzhalter erkennbar (`https://example.at/...`);
keine erfundenen echten URLs. Reale Endpoints stammen ausschließlich aus dem
Discovery-Dokument.

## Tests

Node-Kern unit-getestet ohne Netzwerk: Discovery/JWKS werden im Test gemockt, die
Authorize-URL-Bildung (state/nonce/PKCE) und die Claim-Normalisierung deterministisch
geprüft. Ein optionaler Integrationslauf gegen die Referenzumgebung ist manuell,
sobald eine Test-SP-Registrierung vorliegt.

## Abgrenzung / offene Punkte

- **Nicht im Code lösbar:** SP-Registrierung und Akkreditierung als privatwirtschaftlicher
  Service Provider. Test-SP zuerst, damit gegen die Referenzumgebung entwickelt werden
  kann, bevor die Produktiv-Akkreditierung steht.
- Flutter-/Web-Adapter: eigene Ausbaustufe nach dem Node-Kern.
