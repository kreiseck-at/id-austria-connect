const { normalizeProfile } = require('../src/profile');

test('mappt PVP-Claims auf klare Felder', () => {
  const claims = {
    sub: 'transient-123',
    'urn:pvpgvat:oidc.bpk': 'WT:abcdef==',
    given_name: 'Maria',
    family_name: 'Muster',
    birthdate: '1985-04-12',
    'urn:pvpgvat:oidc.eid_citizen_qaa_eidas_level': 'high',
  };
  const p = normalizeProfile(claims);
  expect(p.bpk).toBe('WT:abcdef==');
  expect(p.firstName).toBe('Maria');
  expect(p.lastName).toBe('Muster');
  expect(p.birthdate).toBe('1985-04-12');
  expect(p.qaaLevel).toBe('high');
  expect(p.raw).toBe(claims);
});

test('fehlende optionale Felder sind undefined, bpk bleibt erhalten', () => {
  const p = normalizeProfile({ 'urn:pvpgvat:oidc.bpk': 'x' });
  expect(p.bpk).toBe('x');
  expect(p.firstName).toBeUndefined();
});
