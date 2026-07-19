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
   expiresAt }` unter `ida_sessions/{state}` in Firestore ab, setzt zusätzlich
   ein HttpOnly-Cookie `ida_state` mit dem `state` und leitet den Browser zur
   ID-Austria-Authorize-URL weiter.
2. `idaCallback` liest das Session-Dokument über den `state` aus der Query,
   ruft `ida.handleCallback({ code, state, expectedState, nonce,
   codeVerifier, error })` — wobei `expectedState` aus dem `ida_state`-Cookie
   stammt, nicht aus der Query —, löscht das Dokument danach und gibt das
   normalisierte Profil zurück (`bpk`, `firstName`, `lastName`, …).
   Fehlt das Session-Dokument (state unbekannt oder bereits verbraucht),
   antwortet der Endpoint mit HTTP 400.

Ab dem Profil ist alles Weitere projektspezifisch: eigenen Nutzer über
`profile.bpk` finden/anlegen, eigene Session-/Login-Mechanik ausstellen.
Das Beispiel gibt das Profil zur Demonstration nur als JSON zurück.

## CSRF-Schutz: state per Cookie an die Browser-Session gebunden

`ida.handleCallback` prüft intern `state !== expectedState` — dieser Vergleich
ist nur dann eine echte Sicherheitsprüfung, wenn `expectedState` aus etwas
stammt, das ein Angreifer nicht selbst setzen kann. Würde `expectedState`
ebenfalls aus der Callback-Query gelesen, wären beide Werte immer identisch
(der Angreifer liefert ja beide), und der Check liefe leer — ein Angreifer
könnte einem Opfer per präpariertem Link einen fremden, aber gültigen `state`
unterschieben (Login-CSRF) und dessen ID-Austria-Session kapern.

Deshalb setzt `idaLogin` den `state` zusätzlich als HttpOnly-Cookie
(`ida_state`, `Secure`, `SameSite=Lax`, 10 Minuten gültig), und `idaCallback`
liest `expectedState` ausschließlich aus diesem Cookie — an genau die
Browser-Session gebunden, die den Login gestartet hat. Der Firestore-Lookup
von `nonce`/`codeVerifier` bleibt weiterhin über den `state` aus der Query,
da nur darüber das passende Session-Dokument auffindbar ist.

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
