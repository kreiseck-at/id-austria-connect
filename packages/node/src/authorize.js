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
