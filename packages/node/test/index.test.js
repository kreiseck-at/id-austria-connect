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
