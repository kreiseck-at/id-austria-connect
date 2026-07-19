function normalizeProfile(claims) {
  return {
    // bPK ist der stabile Personen-Schluessel; sub ist bei ID Austria nur ein
    // transientes, pro Session wechselndes Token und wird bewusst NICHT als Identitaet verwendet.
    bpk: claims['urn:pvpgvat:oidc.bpk'],
    firstName: claims.given_name,
    lastName: claims.family_name,
    birthdate: claims.birthdate,
    qaaLevel: claims['urn:pvpgvat:oidc.eid_citizen_qaa_eidas_level'],
    raw: claims,
  };
}

module.exports = { normalizeProfile };
