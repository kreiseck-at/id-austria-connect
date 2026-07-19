const jose = require('jose');
const { loadDiscovery, ISSUERS } = require('./discovery');
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

  // Issuer gegen die fest hinterlegte Umgebungs-URL pruefen, NICHT gegen doc.issuer:
  // ein manipuliertes oder unvollstaendiges Discovery-Dokument (z. B. ohne issuer-Feld)
  // darf die iss-Pruefung nicht aushebeln koennen.
  let payload;
  try {
    ({ payload } = await jose.jwtVerify(tokenResponse.id_token, getKeySet, {
      issuer: ISSUERS[config.environment],
      audience: config.clientId,
    }));
  } catch (err) {
    throw new IdaTokenError(`id_token-Pruefung fehlgeschlagen: ${err.message}`, { cause: err });
  }

  if (payload.nonce !== nonce) {
    throw new IdaTokenError('nonce stimmt nicht ueberein');
  }

  return normalizeProfile(payload);
}

module.exports = { exchangeAndVerify };
