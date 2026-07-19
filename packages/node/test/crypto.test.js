const crypto = require('node:crypto');
const { randomToken, createPkce } = require('../src/crypto');

describe('randomToken', () => {
  test('liefert base64url ohne Padding', () => {
    const t = randomToken(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t).not.toContain('=');
  });
  test('ist bei jedem Aufruf verschieden', () => {
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe('createPkce', () => {
  test('challenge ist base64url(SHA-256(verifier))', () => {
    const { codeVerifier, codeChallenge } = createPkce();
    const expected = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    expect(codeChallenge).toBe(expected);
  });

  test('codeVerifier ist nicht leer und base64url', () => {
    const { codeVerifier } = createPkce();
    expect(codeVerifier.length).toBeGreaterThan(0);
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
