const { createIdAustria } = require('../src/index');
const { IdaConfigError, IdaUserCancelledError } = require('../src/errors');

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

test('handleCallback reicht an den Kern durch: error=access_denied -> IdaUserCancelledError, ohne Netzwerk', async () => {
  const fetchImpl = jest.fn();
  const ida = createIdAustria(baseConfig);
  await expect(ida.handleCallback({
    error: 'access_denied', state: 's-1', expectedState: 's-1',
  }, { fetchImpl })).rejects.toThrow(IdaUserCancelledError);
  expect(fetchImpl).not.toHaveBeenCalled();
});
