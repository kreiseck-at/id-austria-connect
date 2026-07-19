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
