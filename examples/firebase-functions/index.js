// Referenzbeispiel — nicht Teil des veroeffentlichten Pakets.
// Zwei Endpoints: Login starten und Rueckkehr verarbeiten. state liegt in Firestore.
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { createIdAustria } = require('@kreiseck/id-austria');

admin.initializeApp();
const db = admin.firestore();

const ida = createIdAustria({
  environment: 'test',
  clientId: process.env.IDA_CLIENT_ID,       // aus SP-Registrierung
  clientSecret: process.env.IDA_SECRET,      // aus SP-Registrierung
  redirectUri: process.env.IDA_REDIRECT,     // z. B. https://example.at/idaCallback
});

// Liest einen einzelnen Cookie-Wert aus dem Request, ohne zusaetzliche Dependency.
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

exports.idaLogin = functions.https.onRequest(async (req, res) => {
  const { url, state, nonce, codeVerifier } = await ida.buildAuthorizeUrl();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);
  await db.collection('ida_sessions').doc(state).set({ nonce, codeVerifier, expiresAt });
  // state zusaetzlich per HttpOnly-Cookie an die Browser-Session binden: idaCallback
  // prueft den query-state spaeter gegen genau diesen Cookie-Wert (siehe dort).
  res.set('Set-Cookie', `ida_state=${state}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`);
  res.redirect(url);
});

exports.idaCallback = functions.https.onRequest(async (req, res) => {
  const { code, state, error } = req.query;
  const snap = await db.collection('ida_sessions').doc(String(state)).get();
  if (!snap.exists) { res.status(400).send('Session unbekannt oder abgelaufen'); return; }
  const { nonce, codeVerifier } = snap.data();

  // expectedState kommt bewusst aus dem HttpOnly-Cookie (an die Browser-Session
  // gebunden) und NICHT aus dem query-state: waeren beide identisch aus der Query,
  // liefe der Kern-Check in handleCallback (state !== expectedState) leer, und ein
  // Angreifer koennte einem Opfer per Login-CSRF einen fremden, gueltigen state
  // unterschieben. Der Firestore-Lookup selbst bleibt ueber den query-state, da nur
  // darueber die zugehoerigen nonce/codeVerifier auffindbar sind.
  const expectedState = readCookie(req, 'ida_state');

  try {
    const profile = await ida.handleCallback({
      code, state, expectedState, nonce, codeVerifier, error,
    });
    await snap.ref.delete();
    // Ab hier projektspezifisch: Nutzer ueber profile.bpk finden/anlegen,
    // eigene Session ausstellen. Hier nur zur Demonstration:
    res.json({ bpk: profile.bpk, firstName: profile.firstName, lastName: profile.lastName });
  } catch (err) {
    res.status(400).json({ error: err.code || 'unbekannt', message: err.message });
  }
});
