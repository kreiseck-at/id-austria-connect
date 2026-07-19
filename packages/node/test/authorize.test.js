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
