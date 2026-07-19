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
