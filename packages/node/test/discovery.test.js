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
