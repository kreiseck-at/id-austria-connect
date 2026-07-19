# ID-Austria-Anbindung (Node-Kern) — Implementierungsplan

> **Für Implementierer:** Der Plan wird Task für Task abgearbeitet. Schritte nutzen
> Checkbox-Syntax (`- [ ]`) zum Nachhalten. Jeder Task endet mit einem eigenständig
> testbaren Ergebnis und einem Commit.

**Ziel:** Ein framework-agnostisches Node-Paket `@kreiseck/id-austria`, das Login mit
ID Austria (OpenID Connect, Authorization Code Flow + PKCE) kapselt: Authorize-URL
bauen, Code gegen `id_token` tauschen, Signatur/Claims prüfen, normalisiertes Profil
zurückgeben.

**Architektur:** Dünner Client / dicker Server. Dieses Paket ist der Server-Kern —
zustandslos, ohne Firebase-/Express-Abhängigkeit. Es erzeugt `state`/`nonce`/
`codeVerifier` und verlangt sie beim Callback zurück; der Zwischenspeicher gehört dem
Konsumenten.

**Tech Stack:** Node 22 (CommonJS), `jose` (JWT/JWKS), `node:crypto`, natives `fetch`,
Jest für Tests.

## Global Constraints

- **Keine KI-/Tool-Spuren** in Code, Kommentaren, Commits, README (handschriftlich
  ununterscheidbar). Kommentare und Commits auf **Deutsch**, Stil `feat:` / `docs:` /
  `test:`. Keine `Co-Authored-By`-Trailer.
- **Keine erfundenen Links.** Reale Endpoints nur aus dem Discovery-Dokument. Beispiel-/
  Platzhalterwerte klar als solche (`https://example.at/...`).
- **`client_secret` niemals im Client** — nur Server-Kern.
- **Nur Authorization Code Flow** (`response_type=code`), **PKCE `S256` immer an**,
  Token-Auth `client_secret_post`.
- **Personen-Schlüssel = bPK** (`urn:pvpgvat:oidc.bpk`), nie `sub`.
- Issuer je Umgebung: test `https://idp.ref.id-austria.gv.at`,
  production `https://idp.id-austria.gv.at`. Übrige Endpoints via Discovery.
- Arbeitsverzeichnis für alle Kommandos: `packages/node/` im Repo
  `~/kreiseck/id-austria-connect`.

## Dateistruktur

```
packages/node/
├─ package.json
├─ src/
│  ├─ index.js        createIdAustria(config) — verdrahtet alles
│  ├─ errors.js       typisierte Fehlerklassen
│  ├─ crypto.js       randomToken(), createPkce()
│  ├─ discovery.js    ISSUERS, loadDiscovery() mit Prozess-Cache
│  ├─ authorize.js    buildAuthorizeUrl()
│  ├─ profile.js      normalizeProfile(claims)
│  └─ callback.js     exchangeAndVerify() — Token-Tausch + id_token-Prüfung
└─ test/
   ├─ crypto.test.js
   ├─ discovery.test.js
   ├─ authorize.test.js
   ├─ profile.test.js
   ├─ callback.test.js
   └─ index.test.js
```

---

### Task 1: Paket-Gerüst, Konfig-Validierung, Fehlerklassen

**Files:**
- Create: `packages/node/package.json`
- Create: `packages/node/src/errors.js`
- Create: `packages/node/src/index.js`
- Test: `packages/node/test/index.test.js`

**Interfaces:**
- Produces: `createIdAustria(config)` → Objekt (in späteren Tasks erweitert). Wirft
  `IdaConfigError` bei fehlenden Pflichtfeldern.
- Produces (errors.js): `IdaError`, `IdaConfigError`, `IdaStateMismatchError`,
  `IdaUserCancelledError`, `IdaTokenError` — alle mit `name` = Klassenname und `code`.

- [ ] **Step 1: package.json anlegen**

```json
{
  "name": "@kreiseck/id-austria",
  "version": "0.1.0",
  "description": "ID Austria (OpenID Connect) Login fuer Node — Drittanbieter-Client",
  "license": "MIT",
  "main": "src/index.js",
  "engines": { "node": ">=20" },
  "scripts": { "test": "jest" },
  "dependencies": { "jose": "^5.9.6" },
  "devDependencies": { "jest": "^29.7.0" }
}
```

- [ ] **Step 2: Fehlerklassen schreiben (`src/errors.js`)**

```js
class IdaError extends Error {
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}
class IdaConfigError extends IdaError {
  constructor(message) { super(message, 'config'); }
}
class IdaStateMismatchError extends IdaError {
  constructor(message = 'state stimmt nicht ueberein') { super(message, 'state_mismatch'); }
}
class IdaUserCancelledError extends IdaError {
  constructor(message = 'Anmeldung vom Nutzer abgebrochen') { super(message, 'user_cancelled'); }
}
class IdaTokenError extends IdaError {
  constructor(message) { super(message, 'token'); }
}

module.exports = {
  IdaError, IdaConfigError, IdaStateMismatchError,
  IdaUserCancelledError, IdaTokenError,
};
```

- [ ] **Step 3: Failing test schreiben (`test/index.test.js`)**

```js
const { createIdAustria } = require('../src/index');
const { IdaConfigError } = require('../src/errors');

const baseConfig = {
  environment: 'test',
  clientId: 'https://app.example.at',
  clientSecret: 'geheim',
  redirectUri: 'https://app.example.at/idaCallback',
};

describe('createIdAustria — Konfiguration', () => {
  test('akzeptiert vollstaendige Konfig', () => {
    const ida = createIdAustria(baseConfig);
    expect(typeof ida.buildAuthorizeUrl).toBe('function');
    expect(typeof ida.handleCallback).toBe('function');
  });

  test('wirft IdaConfigError bei fehlendem clientId', () => {
    expect(() => createIdAustria({ ...baseConfig, clientId: undefined }))
      .toThrow(IdaConfigError);
  });

  test('wirft IdaConfigError bei ungueltiger environment', () => {
    expect(() => createIdAustria({ ...baseConfig, environment: 'foo' }))
      .toThrow(IdaConfigError);
  });
});
```

- [ ] **Step 4: Test laufen lassen, muss fehlschlagen**

Run: `cd packages/node && npm install && npx jest test/index.test.js`
Expected: FAIL (`createIdAustria` noch nicht definiert)

- [ ] **Step 5: Minimal-Implementierung (`src/index.js`)**

```js
const { IdaConfigError } = require('./errors');

const VALID_ENVIRONMENTS = ['test', 'production'];

function createIdAustria(config = {}) {
  const { environment, clientId, clientSecret, redirectUri } = config;
  if (!VALID_ENVIRONMENTS.includes(environment)) {
    throw new IdaConfigError("environment muss 'test' oder 'production' sein");
  }
  for (const [key, value] of Object.entries({ clientId, clientSecret, redirectUri })) {
    if (!value || typeof value !== 'string') {
      throw new IdaConfigError(`Pflichtfeld fehlt oder ungueltig: ${key}`);
    }
  }
  const scopes = config.scopes || ['openid', 'profile'];

  return {
    buildAuthorizeUrl: async () => { throw new Error('noch nicht implementiert'); },
    handleCallback: async () => { throw new Error('noch nicht implementiert'); },
    _config: { environment, clientId, clientSecret, redirectUri, scopes },
  };
}

module.exports = { createIdAustria };
```

- [ ] **Step 6: Test laufen lassen, muss grün sein**

Run: `npx jest test/index.test.js`
Expected: PASS (3 Tests)

- [ ] **Step 7: Commit**

```bash
git add packages/node/package.json packages/node/package-lock.json packages/node/src/errors.js packages/node/src/index.js packages/node/test/index.test.js
git commit -m 'feat: Paket-Geruest fuer ID-Austria-Kern (Konfig-Validierung, Fehlerklassen)'
```

---

### Task 2: Krypto-Helfer (PKCE, state, nonce)

**Files:**
- Create: `packages/node/src/crypto.js`
- Test: `packages/node/test/crypto.test.js`

**Interfaces:**
- Produces: `randomToken(bytes = 32)` → base64url-String.
- Produces: `createPkce()` → `{ codeVerifier, codeChallenge }`, `codeChallenge` =
  base64url(SHA-256(codeVerifier)).

- [ ] **Step 1: Failing test (`test/crypto.test.js`)**

```js
const crypto = require('node:crypto');
const { randomToken, createPkce } = require('../src/crypto');

describe('randomToken', () => {
  test('liefert base64url ohne Padding', () => {
    const t = randomToken(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t).not.toContain('=');
  });
  test('ist bei jedem Aufruf verschieden', () => {
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe('createPkce', () => {
  test('challenge ist base64url(SHA-256(verifier))', () => {
    const { codeVerifier, codeChallenge } = createPkce();
    const expected = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    expect(codeChallenge).toBe(expected);
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx jest test/crypto.test.js`
Expected: FAIL (`../src/crypto` nicht gefunden)

- [ ] **Step 3: Implementierung (`src/crypto.js`)**

```js
const crypto = require('node:crypto');

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function createPkce() {
  const codeVerifier = randomToken(32);
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

module.exports = { randomToken, createPkce };
```

- [ ] **Step 4: Test grün**

Run: `npx jest test/crypto.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/node/src/crypto.js packages/node/test/crypto.test.js
git commit -m 'feat: Krypto-Helfer fuer PKCE, state und nonce'
```

---

### Task 3: Discovery laden + cachen

**Files:**
- Create: `packages/node/src/discovery.js`
- Test: `packages/node/test/discovery.test.js`

**Interfaces:**
- Produces: `ISSUERS = { test, production }` (Issuer-URLs).
- Produces: `loadDiscovery(environment, { fetchImpl } = {})` → Promise des
  Discovery-Objekts (`authorization_endpoint`, `token_endpoint`, `jwks_uri`, `issuer`).
  Cacht je Issuer im Prozess. `fetchImpl` ist injizierbar (Default: globales `fetch`).
  Wirft `IdaTokenError` bei HTTP-Fehler.

- [ ] **Step 1: Failing test (`test/discovery.test.js`)**

```js
const { ISSUERS, loadDiscovery, _clearCache } = require('../src/discovery');
const { IdaTokenError } = require('../src/errors');

const DOC = {
  issuer: 'https://idp.ref.id-austria.gv.at',
  authorization_endpoint: 'https://idp.ref.id-austria.gv.at/auth/idp/profile/oidc/authorize',
  token_endpoint: 'https://idp.ref.id-austria.gv.at/auth/idp/profile/oidc/token',
  jwks_uri: 'https://idp.ref.id-austria.gv.at/auth/idp/profile/oidc/keyset',
};

beforeEach(() => _clearCache());

test('Issuer-URLs sind gesetzt', () => {
  expect(ISSUERS.test).toBe('https://idp.ref.id-austria.gv.at');
  expect(ISSUERS.production).toBe('https://idp.id-austria.gv.at');
});

test('laedt Discovery vom well-known Pfad', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => DOC });
  const doc = await loadDiscovery('test', { fetchImpl });
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://idp.ref.id-austria.gv.at/.well-known/openid-configuration');
  expect(doc.token_endpoint).toBe(DOC.token_endpoint);
});

test('cacht je Issuer (zweiter Aufruf ohne fetch)', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => DOC });
  await loadDiscovery('test', { fetchImpl });
  await loadDiscovery('test', { fetchImpl });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('wirft IdaTokenError bei HTTP-Fehler', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 503 });
  await expect(loadDiscovery('test', { fetchImpl })).rejects.toThrow(IdaTokenError);
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx jest test/discovery.test.js`
Expected: FAIL

- [ ] **Step 3: Implementierung (`src/discovery.js`)**

```js
const { IdaTokenError } = require('./errors');

const ISSUERS = {
  test: 'https://idp.ref.id-austria.gv.at',
  production: 'https://idp.id-austria.gv.at',
};

const cache = new Map();

async function loadDiscovery(environment, { fetchImpl = fetch } = {}) {
  const issuer = ISSUERS[environment];
  if (cache.has(issuer)) return cache.get(issuer);

  const url = `${issuer}/.well-known/openid-configuration`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new IdaTokenError(`Discovery fehlgeschlagen (HTTP ${res.status})`);
  }
  const doc = await res.json();
  cache.set(issuer, doc);
  return doc;
}

function _clearCache() { cache.clear(); }

module.exports = { ISSUERS, loadDiscovery, _clearCache };
```

- [ ] **Step 4: Test grün**

Run: `npx jest test/discovery.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/node/src/discovery.js packages/node/test/discovery.test.js
git commit -m 'feat: Discovery-Dokument laden und je Issuer cachen'
```

---

### Task 4: Authorize-URL bauen

**Files:**
- Create: `packages/node/src/authorize.js`
- Test: `packages/node/test/authorize.test.js`

**Interfaces:**
- Consumes: `loadDiscovery` (Task 3), `createPkce`/`randomToken` (Task 2).
- Produces: `buildAuthorizeUrl(config, deps)` → `{ url, state, nonce, codeVerifier }`.
  `config` = `{ environment, clientId, redirectUri, scopes }`. `deps` = optional
  `{ fetchImpl }` (an loadDiscovery durchgereicht). Die URL enthält `response_type=code`,
  `code_challenge_method=S256`, `state`, `nonce`, `code_challenge`.

- [ ] **Step 1: Failing test (`test/authorize.test.js`)**

```js
const { buildAuthorizeUrl } = require('../src/authorize');
const { _clearCache } = require('../src/discovery');

const DOC = {
  authorization_endpoint: 'https://idp.ref.id-austria.gv.at/auth/idp/profile/oidc/authorize',
  token_endpoint: 'https://idp.ref.id-austria.gv.at/auth/idp/profile/oidc/token',
  jwks_uri: 'https://idp.ref.id-austria.gv.at/auth/idp/profile/oidc/keyset',
};
const config = {
  environment: 'test',
  clientId: 'https://app.example.at',
  redirectUri: 'https://app.example.at/idaCallback',
  scopes: ['openid', 'profile'],
};

beforeEach(() => _clearCache());

test('baut vollstaendige Authorize-URL', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => DOC });
  const { url, state, nonce, codeVerifier } = await buildAuthorizeUrl(config, { fetchImpl });

  const u = new URL(url);
  expect(u.origin + u.pathname).toBe(DOC.authorization_endpoint);
  expect(u.searchParams.get('response_type')).toBe('code');
  expect(u.searchParams.get('client_id')).toBe(config.clientId);
  expect(u.searchParams.get('redirect_uri')).toBe(config.redirectUri);
  expect(u.searchParams.get('scope')).toBe('openid profile');
  expect(u.searchParams.get('code_challenge_method')).toBe('S256');
  expect(u.searchParams.get('state')).toBe(state);
  expect(u.searchParams.get('nonce')).toBe(nonce);
  expect(u.searchParams.get('code_challenge')).toBeTruthy();
  expect(codeVerifier).toBeTruthy();
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx jest test/authorize.test.js`
Expected: FAIL

- [ ] **Step 3: Implementierung (`src/authorize.js`)**

```js
const { loadDiscovery } = require('./discovery');
const { createPkce, randomToken } = require('./crypto');

async function buildAuthorizeUrl(config, deps = {}) {
  const doc = await loadDiscovery(config.environment, deps);
  const state = randomToken(24);
  const nonce = randomToken(24);
  const { codeVerifier, codeChallenge } = createPkce();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    url: `${doc.authorization_endpoint}?${params.toString()}`,
    state, nonce, codeVerifier,
  };
}

module.exports = { buildAuthorizeUrl };
```

- [ ] **Step 4: Test grün**

Run: `npx jest test/authorize.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/node/src/authorize.js packages/node/test/authorize.test.js
git commit -m 'feat: Authorize-URL mit state, nonce und PKCE bauen'
```

---

### Task 5: Profil-Normalisierung

**Files:**
- Create: `packages/node/src/profile.js`
- Test: `packages/node/test/profile.test.js`

**Interfaces:**
- Produces: `normalizeProfile(claims)` → `{ bpk, firstName, lastName, birthdate,
  qaaLevel, raw }`. Mappt `urn:pvpgvat:oidc.bpk → bpk`, `given_name → firstName`,
  `family_name → lastName`, `birthdate → birthdate`,
  `urn:pvpgvat:oidc.eid_citizen_qaa_eidas_level → qaaLevel`. `raw` = Original-Claims.

- [ ] **Step 1: Failing test (`test/profile.test.js`)**

```js
const { normalizeProfile } = require('../src/profile');

test('mappt PVP-Claims auf klare Felder', () => {
  const claims = {
    sub: 'transient-123',
    'urn:pvpgvat:oidc.bpk': 'WT:abcdef==',
    given_name: 'Maria',
    family_name: 'Muster',
    birthdate: '1985-04-12',
    'urn:pvpgvat:oidc.eid_citizen_qaa_eidas_level': 'high',
  };
  const p = normalizeProfile(claims);
  expect(p.bpk).toBe('WT:abcdef==');
  expect(p.firstName).toBe('Maria');
  expect(p.lastName).toBe('Muster');
  expect(p.birthdate).toBe('1985-04-12');
  expect(p.qaaLevel).toBe('high');
  expect(p.raw).toBe(claims);
});

test('fehlende optionale Felder sind undefined, bpk bleibt erhalten', () => {
  const p = normalizeProfile({ 'urn:pvpgvat:oidc.bpk': 'x' });
  expect(p.bpk).toBe('x');
  expect(p.firstName).toBeUndefined();
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx jest test/profile.test.js`
Expected: FAIL

- [ ] **Step 3: Implementierung (`src/profile.js`)**

```js
function normalizeProfile(claims) {
  return {
    bpk: claims['urn:pvpgvat:oidc.bpk'],
    firstName: claims.given_name,
    lastName: claims.family_name,
    birthdate: claims.birthdate,
    qaaLevel: claims['urn:pvpgvat:oidc.eid_citizen_qaa_eidas_level'],
    raw: claims,
  };
}

module.exports = { normalizeProfile };
```

- [ ] **Step 4: Test grün**

Run: `npx jest test/profile.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/node/src/profile.js packages/node/test/profile.test.js
git commit -m 'feat: Profil-Normalisierung der PVP-Claims (bPK als Schluessel)'
```

---

### Task 6: Callback — Token-Tausch + id_token-Prüfung

**Files:**
- Create: `packages/node/src/callback.js`
- Test: `packages/node/test/callback.test.js`

**Interfaces:**
- Consumes: `loadDiscovery` (Task 3), `normalizeProfile` (Task 5), Fehlerklassen.
- Produces: `exchangeAndVerify(config, input, deps)`.
  - `config` = `{ environment, clientId, clientSecret, redirectUri }`.
  - `input` = `{ code, state, nonce, codeVerifier, expectedState, error }`.
  - `deps` = optional `{ fetchImpl, getKeySet }`. `getKeySet` liefert eine jose-
    kompatible Key-Resolver-Funktion (Default: `createRemoteJWKSet(new URL(jwks_uri))`).
  - Rückgabe: normalisiertes Profil.
  - Fehler: `IdaUserCancelledError` bei `input.error === 'access_denied'`;
    `IdaStateMismatchError` bei `state !== expectedState`; `IdaTokenError` bei
    Token-/Signatur-/`nonce`-/`aud`-Fehler.

- [ ] **Step 1: Failing test (`test/callback.test.js`)**

```js
const jose = require('jose');
const { exchangeAndVerify } = require('../src/callback');
const {
  IdaStateMismatchError, IdaUserCancelledError, IdaTokenError,
} = require('../src/errors');
const { _clearCache } = require('../src/discovery');

const ISSUER = 'https://idp.ref.id-austria.gv.at';
const DOC = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/auth/idp/profile/oidc/authorize`,
  token_endpoint: `${ISSUER}/auth/idp/profile/oidc/token`,
  jwks_uri: `${ISSUER}/auth/idp/profile/oidc/keyset`,
};
const config = {
  environment: 'test',
  clientId: 'https://app.example.at',
  clientSecret: 'geheim',
  redirectUri: 'https://app.example.at/idaCallback',
};

let keyPair;
beforeAll(async () => { keyPair = await jose.generateKeyPair('RS256'); });
beforeEach(() => _clearCache());

async function signIdToken(overrides = {}) {
  return new jose.SignJWT({
    'urn:pvpgvat:oidc.bpk': 'WT:abc==',
    given_name: 'Maria', family_name: 'Muster',
    nonce: 'n-1',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(ISSUER)
    .setAudience(config.clientId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(keyPair.privateKey);
}

function deps(idToken) {
  return {
    fetchImpl: jest.fn().mockResolvedValue({ ok: true, json: async () => DOC })
      // erster Aufruf: Discovery; Token-Endpoint wird separat gemockt:
      ,
    getKeySet: () => async () => keyPair.publicKey,
  };
}

function depsWithToken(idToken, docOnly = DOC) {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => docOnly })      // Discovery
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: idToken }) }); // Token
  return { fetchImpl, getKeySet: () => async () => keyPair.publicKey };
}

const goodInput = {
  code: 'auth-code', state: 's-1', expectedState: 's-1',
  nonce: 'n-1', codeVerifier: 'v-1',
};

test('gueltiger Ablauf liefert normalisiertes Profil', async () => {
  const idToken = await signIdToken();
  const profile = await exchangeAndVerify(config, goodInput, depsWithToken(idToken));
  expect(profile.bpk).toBe('WT:abc==');
  expect(profile.firstName).toBe('Maria');
});

test('Abbruch durch Nutzer -> IdaUserCancelledError', async () => {
  await expect(exchangeAndVerify(config, { ...goodInput, error: 'access_denied' }, {}))
    .rejects.toThrow(IdaUserCancelledError);
});

test('state-Mismatch -> IdaStateMismatchError', async () => {
  await expect(exchangeAndVerify(config, { ...goodInput, state: 'x' }, {}))
    .rejects.toThrow(IdaStateMismatchError);
});

test('falsche nonce -> IdaTokenError', async () => {
  const idToken = await signIdToken({ nonce: 'anders' });
  await expect(exchangeAndVerify(config, goodInput, depsWithToken(idToken)))
    .rejects.toThrow(IdaTokenError);
});

test('falsche audience -> IdaTokenError', async () => {
  const idToken = await new jose.SignJWT({ 'urn:pvpgvat:oidc.bpk': 'x', nonce: 'n-1' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(ISSUER).setAudience('https://fremd.example').setIssuedAt()
    .setExpirationTime('5m').sign(keyPair.privateKey);
  await expect(exchangeAndVerify(config, goodInput, depsWithToken(idToken)))
    .rejects.toThrow(IdaTokenError);
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx jest test/callback.test.js`
Expected: FAIL (`../src/callback` nicht gefunden)

- [ ] **Step 3: Implementierung (`src/callback.js`)**

```js
const jose = require('jose');
const { loadDiscovery } = require('./discovery');
const { normalizeProfile } = require('./profile');
const {
  IdaStateMismatchError, IdaUserCancelledError, IdaTokenError,
} = require('./errors');

async function exchangeAndVerify(config, input, deps = {}) {
  const { code, state, expectedState, nonce, codeVerifier, error } = input;

  if (error) {
    if (error === 'access_denied') throw new IdaUserCancelledError();
    throw new IdaTokenError(`Fehler von ID Austria: ${error}`);
  }
  if (!state || state !== expectedState) {
    throw new IdaStateMismatchError();
  }

  const doc = await loadDiscovery(config.environment, deps);

  // Token-Tausch (client_secret_post + PKCE)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: codeVerifier,
  });
  const fetchImpl = deps.fetchImpl || fetch;
  const res = await fetchImpl(doc.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new IdaTokenError(`Token-Tausch fehlgeschlagen (HTTP ${res.status})`);
  }
  const tokenResponse = await res.json();
  if (!tokenResponse.id_token) {
    throw new IdaTokenError('Antwort enthaelt kein id_token');
  }

  // id_token verifizieren
  const getKeySet = deps.getKeySet
    ? deps.getKeySet(doc)
    : jose.createRemoteJWKSet(new URL(doc.jwks_uri));

  let payload;
  try {
    ({ payload } = await jose.jwtVerify(tokenResponse.id_token, getKeySet, {
      issuer: doc.issuer,
      audience: config.clientId,
    }));
  } catch (err) {
    throw new IdaTokenError(`id_token-Pruefung fehlgeschlagen: ${err.message}`);
  }

  if (payload.nonce !== nonce) {
    throw new IdaTokenError('nonce stimmt nicht ueberein');
  }

  return normalizeProfile(payload);
}

module.exports = { exchangeAndVerify };
```

Hinweis: `jose.jwtVerify` akzeptiert als zweites Argument sowohl eine
`createRemoteJWKSet`-Resolverfunktion als auch einen direkten `KeyLike` (im Test die
öffentliche Testschlüssel-Instanz) — beide Wege funktionieren.

- [ ] **Step 4: Test grün**

Run: `npx jest test/callback.test.js`
Expected: PASS (5 Tests)

- [ ] **Step 5: Commit**

```bash
git add packages/node/src/callback.js packages/node/test/callback.test.js
git commit -m 'feat: Token-Tausch und id_token-Pruefung (Signatur, iss/aud, nonce)'
```

---

### Task 7: Verdrahtung in `createIdAustria`

**Files:**
- Modify: `packages/node/src/index.js`
- Modify: `packages/node/test/index.test.js`

**Interfaces:**
- Consumes: `buildAuthorizeUrl` (Task 4), `exchangeAndVerify` (Task 6).
- Produces: fertige Instanz — `ida.buildAuthorizeUrl()` und
  `ida.handleCallback({ code, state, expectedState, nonce, codeVerifier, error })`
  reichen an die Kernfunktionen mit der gebundenen Konfig durch. `deps` (fetch/keyset)
  ist optional als zweites Argument injizierbar (für Tests).

- [ ] **Step 1: Failing test ergänzen (`test/index.test.js`)**

```js
// zusaetzlich zu den bestehenden Konfig-Tests:
const { _clearCache } = require('../src/discovery');

const DOC = {
  authorization_endpoint: 'https://idp.ref.id-austria.gv.at/auth/idp/profile/oidc/authorize',
  token_endpoint: 'https://idp.ref.id-austria.gv.at/auth/idp/profile/oidc/token',
  jwks_uri: 'https://idp.ref.id-austria.gv.at/auth/idp/profile/oidc/keyset',
};

test('buildAuthorizeUrl reicht an den Kern durch', async () => {
  _clearCache();
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => DOC });
  const ida = createIdAustria(baseConfig);
  const { url, state, codeVerifier } = await ida.buildAuthorizeUrl({ fetchImpl });
  expect(url).toContain('response_type=code');
  expect(state).toBeTruthy();
  expect(codeVerifier).toBeTruthy();
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx jest test/index.test.js`
Expected: FAIL (`buildAuthorizeUrl` wirft noch „noch nicht implementiert")

- [ ] **Step 3: index.js verdrahten**

Ersetze die Platzhalter-Rückgabe in `createIdAustria`:

```js
const { IdaConfigError } = require('./errors');
const { buildAuthorizeUrl } = require('./authorize');
const { exchangeAndVerify } = require('./callback');

const VALID_ENVIRONMENTS = ['test', 'production'];

function createIdAustria(config = {}) {
  const { environment, clientId, clientSecret, redirectUri } = config;
  if (!VALID_ENVIRONMENTS.includes(environment)) {
    throw new IdaConfigError("environment muss 'test' oder 'production' sein");
  }
  for (const [key, value] of Object.entries({ clientId, clientSecret, redirectUri })) {
    if (!value || typeof value !== 'string') {
      throw new IdaConfigError(`Pflichtfeld fehlt oder ungueltig: ${key}`);
    }
  }
  const bound = {
    environment, clientId, clientSecret, redirectUri,
    scopes: config.scopes || ['openid', 'profile'],
  };

  return {
    buildAuthorizeUrl: (deps = {}) => buildAuthorizeUrl(bound, deps),
    handleCallback: (input, deps = {}) => exchangeAndVerify(bound, input, deps),
  };
}

module.exports = { createIdAustria };
```

- [ ] **Step 4: Alle Tests grün**

Run: `npx jest`
Expected: PASS (alle Suites)

- [ ] **Step 5: Commit**

```bash
git add packages/node/src/index.js packages/node/test/index.test.js
git commit -m 'feat: createIdAustria verdrahtet Authorize- und Callback-Kern'
```

---

### Task 8: README + Firebase-Beispiel

**Files:**
- Create: `README.md` (Repo-Wurzel)
- Create: `examples/firebase-functions/index.js`
- Create: `examples/firebase-functions/README.md`

**Interfaces:**
- Consumes: das fertige Paket `@kreiseck/id-austria`.
- Produces: lauffähiges Referenzbeispiel (zwei HTTPS-Functions + Firestore-`state`),
  ohne echte Secrets, mit klaren Platzhaltern.

- [ ] **Step 1: README schreiben (Repo-Wurzel)**

Inhalt: Kurzbeschreibung, Installations-/Nutzungsschnipsel (identisch zur API im
Design-Doc), Hinweis auf die nötige SP-Registrierung, Verweis auf `docs/design.md`.
Nur reale Endpoints (aus Discovery), projektspezifische Werte als `https://example.at/...`.

- [ ] **Step 2: Firebase-Beispiel schreiben (`examples/firebase-functions/index.js`)**

```js
// Referenzbeispiel — nicht Teil des veroeffentlichten Pakets.
// Zwei Endpoints: Login starten und Rueckkehr verarbeiten. state liegt in Firestore.
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { createIdAustria } = require('@kreiseck/id-austria');

admin.initializeApp();
const db = admin.firestore();

const ida = createIdAustria({
  environment: 'test',
  clientId: process.env.IDA_CLIENT_ID,       // aus SP-Registrierung
  clientSecret: process.env.IDA_SECRET,      // aus SP-Registrierung
  redirectUri: process.env.IDA_REDIRECT,     // z. B. https://example.at/idaCallback
});

exports.idaLogin = functions.https.onRequest(async (req, res) => {
  const { url, state, nonce, codeVerifier } = await ida.buildAuthorizeUrl();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);
  await db.collection('ida_sessions').doc(state).set({ nonce, codeVerifier, expiresAt });
  res.redirect(url);
});

exports.idaCallback = functions.https.onRequest(async (req, res) => {
  const { code, state, error } = req.query;
  const snap = await db.collection('ida_sessions').doc(String(state)).get();
  if (!snap.exists) { res.status(400).send('Session unbekannt oder abgelaufen'); return; }
  const { nonce, codeVerifier } = snap.data();

  try {
    const profile = await ida.handleCallback({
      code, state, expectedState: state, nonce, codeVerifier, error,
    });
    await snap.ref.delete();
    // Ab hier projektspezifisch: Nutzer ueber profile.bpk finden/anlegen,
    // eigene Session ausstellen. Hier nur zur Demonstration:
    res.json({ bpk: profile.bpk, firstName: profile.firstName, lastName: profile.lastName });
  } catch (err) {
    res.status(400).json({ error: err.code || 'unbekannt', message: err.message });
  }
});
```

- [ ] **Step 3: Beispiel-README schreiben**

Erklärt: SP-Registrierung nötig, `IDA_*`-Variablen setzen, `redirectUri` muss exakt
`idaCallback` sein, Firestore-TTL-Policy auf `ida_sessions.expiresAt` empfohlen. Reale
Endpoints nur aus Discovery, alle Beispielwerte als Platzhalter.

- [ ] **Step 4: Commit**

```bash
git add README.md examples/firebase-functions/
git commit -m 'docs: README und Firebase-Referenzbeispiel (Firestore-state)'
```

---

## Self-Review

- **Spec-Abdeckung:** dünner Client/dicker Server (Architektur + Task 8), Mono-Repo
  (Dateistruktur), verifizierte Endpoints (Task 3), PKCE+`client_secret_post` (Task 4/6),
  bPK-Normalisierung (Task 5), zustandsloser Kern / state beim Konsumenten (Task 6/8),
  typisierte Fehler (Task 1/6), Firebase-Beispiel mit Platzhaltern (Task 8),
  Discovery statt Hartkodierung (Task 3). Keine offene Spec-Anforderung ohne Task.
- **Platzhalter-Scan:** keine TBD/TODO; jeder Code-Schritt zeigt vollständigen Code.
- **Typ-Konsistenz:** `buildAuthorizeUrl`/`exchangeAndVerify`/`handleCallback`,
  `loadDiscovery(environment, deps)`, `normalizeProfile(claims)` durchgängig identisch
  benannt; `handleCallback` erwartet `expectedState` konsistent in Task 6, 7 und 8.
- **Flutter-/Web-Adapter:** bewusst nicht Teil dieses Plans (YAGNI), erst nach dem Kern.
