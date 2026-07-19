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
