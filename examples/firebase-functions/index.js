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

exports.idaLogin = functions.https.onRequest(async (req, res) => {
  const { url, state, nonce, codeVerifier } = await ida.buildAuthorizeUrl();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);
  await db.collection('ida_sessions').doc(state).set({ nonce, codeVerifier, expiresAt });
  res.redirect(url);
});

exports.idaCallback = functions.https.onRequest(async (req, res) => {
  const { code, state, error } = req.query;
  const snap = await db.collection('ida_sessions').doc(String(state)).get();
  if (!snap.exists) { res.status(400).send('Session unbekannt oder abgelaufen'); return; }
  const { nonce, codeVerifier } = snap.data();

  try {
    const profile = await ida.handleCallback({
      code, state, expectedState: state, nonce, codeVerifier, error,
    });
    await snap.ref.delete();
    // Ab hier projektspezifisch: Nutzer ueber profile.bpk finden/anlegen,
    // eigene Session ausstellen. Hier nur zur Demonstration:
    res.json({ bpk: profile.bpk, firstName: profile.firstName, lastName: profile.lastName });
  } catch (err) {
    res.status(400).json({ error: err.code || 'unbekannt', message: err.message });
  }
});
