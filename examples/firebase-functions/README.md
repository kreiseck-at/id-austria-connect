# Firebase-Functions-Beispiel

Referenzimplementierung für `@kreiseck/id-austria` auf Firebase Cloud
Functions: zwei HTTPS-Functions, `state`/`nonce`/`codeVerifier` liegen
kurzlebig in Firestore. Dient der Demonstration — nicht Teil des
veröffentlichten Pakets und ohne echte Secrets.

## Voraussetzung: SP-Registrierung

Bevor dieses Beispiel läuft, braucht das Projekt eine eigene Registrierung
als Service Provider bei ID Austria (Test-SP für die Referenzumgebung
genügt zum Entwickeln). Daraus stammen `client_id`, `client_secret` und die
exakte `redirect_uri`; sie sind hier bewusst als Platzhalter/Umgebungs­variablen
gehalten, keine echten Werte.

## Umgebungsvariablen

| Variable | Bedeutung |
|---|---|
| `IDA_CLIENT_ID` | `client_id` aus der SP-Registrierung |
| `IDA_SECRET` | `client_secret` aus der SP-Registrierung |
| `IDA_REDIRECT` | Redirect-URI, muss **exakt** der bei ID Austria registrierten entsprechen |

**Wichtig:** `IDA_REDIRECT` muss auf die deployte `idaCallback`-Function
zeigen (z. B. `https://<region>-<projekt>.cloudfunctions.net/idaCallback`
oder eine eigene Domain wie `https://example.at/idaCallback`). Weicht die
Redirect-URI beim Aufruf von der registrierten ab, weist ID Austria den
Request zurück.

Setzen z. B. über Firebase-Functions-Config/Secrets oder `.env` je nach
Deploy-Setup — dieses Beispiel liest sie einfach aus `process.env`.

## Ablauf

1. `idaLogin` ruft `ida.buildAuthorizeUrl()`, legt `{ nonce, codeVerifier,
   expiresAt }` unter `ida_sessions/{state}` in Firestore ab und leitet den
   Browser zur ID-Austria-Authorize-URL weiter.
2. `idaCallback` liest das Session-Dokument über den zurückgegebenen
   `state`, ruft `ida.handleCallback({ code, state, expectedState: state,
   nonce, codeVerifier, error })`, löscht das Dokument danach und gibt das
   normalisierte Profil zurück (`bpk`, `firstName`, `lastName`, …).
   Fehlt das Session-Dokument (state unbekannt oder bereits verbraucht),
   antwortet der Endpoint mit HTTP 400.

Ab dem Profil ist alles Weitere projektspezifisch: eigenen Nutzer über
`profile.bpk` finden/anlegen, eigene Session-/Login-Mechanik ausstellen.
Das Beispiel gibt das Profil zur Demonstration nur als JSON zurück.

## Firestore: TTL auf `ida_sessions`

`ida_sessions/{state}` ist als kurzlebiger Zwischenspeicher gedacht
(Login-Vorgang dauert normalerweise Sekunden bis wenige Minuten). Für nicht
abgeschlossene Logins bleiben sonst verwaiste Dokumente liegen. Empfohlen:
in der Firebase-Console (oder per `gcloud firestore fields ttls update`)
eine **TTL-Policy** auf das Feld `ida_sessions.expiresAt` einrichten, das
`idaLogin` bereits mit `Date.now() + 10 * 60 * 1000` (10 Minuten) setzt.
Firestore löscht abgelaufene Dokumente dann automatisch im Hintergrund.

## Abhängigkeiten

`firebase-functions`, `firebase-admin` und `@kreiseck/id-austria` als
Dependencies im jeweiligen Functions-Projekt.

## Reale Endpoints

Alle in diesem Beispiel verwendeten URLs (`IDA_REDIRECT` etc.) sind
Platzhalter (`https://example.at/...`). Die tatsächlichen ID-Austria-
Endpoints lädt `@kreiseck/id-austria` selbst über das Discovery-Dokument
der jeweiligen Umgebung — siehe [`../../docs/design.md`](../../docs/design.md).
