function normalizeProfile(claims) {
  return {
    bpk: claims['urn:pvpgvat:oidc.bpk'],
    firstName: claims.given_name,
    lastName: claims.family_name,
    birthdate: claims.birthdate,
    qaaLevel: claims['urn:pvpgvat:oidc.eid_citizen_qaa_eidas_level'],
    raw: claims,
  };
}

module.exports = { normalizeProfile };
