const { IdaTokenError, IdaConfigError } = require('./errors');

const ISSUERS = {
  test: 'https://idp.ref.id-austria.gv.at',
  production: 'https://idp.id-austria.gv.at',
};

const cache = new Map();

async function loadDiscovery(environment, { fetchImpl = fetch } = {}) {
  const issuer = ISSUERS[environment];
  if (!issuer) {
    throw new IdaConfigError(`unbekannte environment: ${environment}`);
  }
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
