# ID Austria — Service Provider registrieren & akkreditieren

Diese Anleitung beschreibt Schritt für Schritt, wie man im Unternehmensserviceportal
(USP) einen Service Provider (SP) für ID Austria anlegt und akkreditiert, und wie die
dort eingetragenen Werte auf die Konfiguration dieses Pakets (`@kreiseck/id-austria`)
abgebildet werden.

**Der Code ist der einfache Teil — dieser Registrierungs-/Akkreditierungsprozess ist der
eigentliche Aufwand und pro Projekt individuell.** Jede Anwendung braucht einen eigenen
SP mit eigener Client ID, eigenem Client Secret, eigenen Redirect-URIs und eigener
Akkreditierung.

> Immer zuerst gegen die **Referenz-/Testumgebung (REF)** bauen. Test-SPs können im
> Echtsystem nicht akkreditiert werden. In REF werden Akkreditierungsanträge **stündlich
> automatisch genehmigt**, im Echtsystem prüft eine Behörde manuell.

---

## Zwei getrennte Umgebungen

| | Echtsystem (Produktion) | Referenz/Test (REF) |
|---|---|---|
| USP-Service | „IDA Serviceprovider" | „IDA Serviceprovider (REF)" |
| Paket-`environment` | `production` | `test` |
| Issuer | `https://idp.id-austria.gv.at` | `https://idp.ref.id-austria.gv.at` |
| Akkreditierung | manuelle Behördenprüfung | stündlich automatisch genehmigt |

Für ein neues Projekt: **erst REF komplett durchspielen** (Paket end-to-end testen),
dann denselben SP im Echtsystem anlegen und akkreditieren lassen.

---

## Schritt 0 — Einmalige Voraussetzung (nur beim allerersten Mal)

Im USP unter `https://mein.usp.gv.at` die Services **„IDA Serviceprovider"** und
**„IDA Serviceprovider (REF)"** aktivieren. Die Aktivierung ist einmalig pro
Organisation — ist sie schon erfolgt, entfällt dieser Schritt.

Danach unter `https://mein.usp.gv.at/services` → „Alle Services" die IDA-Kachel (bzw.
REF) öffnen. Man landet in der SP-Registrierung, z. B.:
`https://eid.services.usp.gv.at/at.gv.brz.sp-reg-ref/restricted/sp`

Die **Stammdaten** der Organisation müssen dort einmalig gepflegt werden.

---

## Schritt 1 — Neuen Service Provider anlegen

Button **„Neuen Service Provider anlegen"**. Zwei Pflichtfelder:

- **Name\*** — Name des Service Providers (der Anwendung, die den Login bereitstellt).
- **Unique ID\*** — die eindeutige ID des SP im ID-Austria-System.
  - **Bei OIDC (dieses Paket): die OIDC Client ID.** Diesen Wert legst du hier fest und
    trägst ihn später **exakt** als `clientId` in die Paket-Konfiguration ein.
  - (Nur zur Einordnung: Bei SAML2 ist es die EntityID; bei indirekter Anbindung über
    den MOA-E-ID-Proxy die EntityID des SP — dann muss es eine URL mit mindestens einem
    Fragezeichen sein. Für die direkte OIDC-Anbindung, die dieses Paket nutzt, ist es die
    Client ID.)

→ **Weiter.** Der SP ist damit angelegt. Man kann jetzt Versionen anlegen/verwalten oder
den SP löschen.

---

## Schritt 2 — Neue Version anlegen (Akkreditierungsantrag)

Button **„Neue Version anlegen"**. Hinweis des Systems: Die Dauer des
Akkreditierungsverfahrens hängt von der Qualität der Angaben ab — ausreichend Vorlaufzeit
einplanen. Ist die Organisation Auftragsverarbeiter, ist das Auftragsverarbeiterverhältnis
nachzuweisen. Fragen zur Akkreditierung: `BMI-III-A-5-SP@bmi.gv.at`.

Felder der Version (\* = Pflicht):

### Beschreibung
- **Versionsname\*** — frei wählbar, z. B. „Version 0.1".
- **Versionsbeschreibung** (optional) — Details zur Version. **Keine personenbezogenen
  Daten** (Namen, E-Mail-Adressen o. Ä.) eintragen.

### Zweck & rechtliche Angaben
- **Verwendungszweck\*** — Wer bietet welche Leistung für welche Zielgruppe an und welche
  Rolle spielt die ID Austria dabei? Kurz, aber umfassend, ohne (branchenspezifische)
  Abkürzungen, auch für Laien verständlich.
- **Gründe, die einer Freischaltung entgegenstehen\*** — Alle Gründe anführen, die der
  Nutzung entgegenstehen (z. B. laufende/vergangene Verfahren bei der Datenschutzbehörde).
  Gibt es keine, das hier klar so angeben.

### Anzeige beim Login (für den Nutzer sichtbar)
- **Friendly Name\*** — Name der Anwendung, der im Anmeldefenster erscheint
  („Anmelden bei ‚xxxxx'").
- **Datenschutz Policy URL\*** — URL, unter der **tatsächlich** eine Datenschutzerklärung
  liegt. Sie muss **bereits zum Zeitpunkt der Antragstellung** Bezug auf die
  Datenverarbeitung dieses SP nehmen und Art. 12 & 13 DSGVO erfüllen. Wird dem Nutzer beim
  Anmelden angezeigt.
- **Friendly URL** (optional) — öffentliche URL der Anwendung. Checkbox „Öffentlich
  anzeigen": Einwilligung, das Angebot auf `id-austria.gv.at` öffentlich zu verlinken.
- **Logo\*** — PNG-Datei, max. 1 MB, **exakt 960 × 120 Pixel**.

### Authentifizierung (zwei Checkboxen, beide/einzeln/keine)
- **Testidentitäten Unterstützung** — erlaubt Anmeldung mit Testidentitäten.
  **In REF aktivieren**, damit man ohne echte ID Austria testen kann.
- **eIDAS Unterstützung** — lässt Anmeldungen mit ausländischen elektronischen Identitäten
  zu. Nur aktivieren, wenn das fachlich gewünscht ist.

### Angeforderte Daten (Attribute)
Liste von Checkboxen. **Nur anfordern, was wirklich gebraucht wird** — je weniger
Attribute, desto einfacher die Akkreditierung. Für jedes angehakte Attribut muss unten im
Feld **Begründung** einzeln dargelegt werden, wozu es benötigt wird (bei Vorname,
Familienname, Geburtsdatum genügt regelmäßig „zur Identifikation der Person").

Wichtige verfügbare Attribute (Auszug): Vorname, Familienname, Geburtsdatum; zusätzlich
u. a. Ausstellungsland, bPK-Bereich, ID-Austria-Level, Signaturzertifikat, eIDAS
Identifier; sowie viele weitere Merkmale (Hauptwohnsitz/Meldeadresse, Gemeindedaten,
Familienstand, Geschlecht, PLZ, Staatsangehörigkeit, „14/16/18/21 Jahre oder älter",
Lichtbild, Ausweisdokumente, Zulassungsschein- und Studierendendaten, Vollmachten u. v. m.).

**Die bPK** (bereichsspezifisches Personenkennzeichen) ist der Personen-Schlüssel und wird
im OIDC-Login geliefert; sie leitet sich aus der Stammzahl (Firmenbuchnummer) des
Betreibers ab und ist daher pro Betreiber verschieden.

**Begründung\*** — Freitextfeld für die Begründung aller angehakten Attribute
(Beispiele siehe unten unter „Empfohlene Minimal-Konfiguration").

### Technische Metadaten\* — OIDC (dieses Paket)
Option **OIDC** wählen (nicht SAML).

- **Weiterleitungsadresse(n)** — die **Redirect-URI(s)** des SP, an die das ID Token nach
  erfolgreicher Authentifizierung zurückgeht. Max. 50 Endpunkte.
  **Achtung: Die URL muss exakt so, wie hier eingetragen, auch im OIDC-Request verwendet
  werden. Wildcards (`*`) o. Ä. werden nicht unterstützt.** → entspricht `redirectUri` in
  der Paket-Konfiguration.
- **Checkbox „OIDC Requested Claims unterstützen"** — nur in Ausnahmefällen nötig.
  **Für dieses Paket NICHT aktivieren** (das Paket nutzt keine Requested-Claims).
- **Checkbox „Ich benötige ein OIDC Verschlüsselungszertifikat"** — optional; verschlüsselt
  das ID Token zusätzlich. **Für dieses Paket NICHT aktivieren** — der Kern verifiziert das
  `id_token` per Signatur (JWS), er entschlüsselt kein verschlüsseltes Token (JWE). Nur
  aktivieren, wenn das Paket entsprechend erweitert wurde.

> **SAML** ist für dieses Paket nicht relevant. (Falls doch benötigt: EntityID,
> Signaturzertifikat(e) als PEM, optionales Verschlüsselungszertifikat und die
> SP-Endpunkte mit HTTP-POST-Methode; Metadaten können per XML importiert werden.)

Das **Client Secret** wird **nicht** automatisch erzeugt — du musst es **vor dem
Aktivieren** explizit anlegen (siehe Schritt 3, Punkt 6). Es entspricht `clientSecret` in
der Paket-Konfiguration (OIDC-Auth-Methode `client_secret_post`). **Niemals ins
Frontend/den Client — nur ins serverseitige Secret Management.**

---

## Schritt 3 — Prüfen, beantragen, OIDC-Secret erstellen, aktivieren

1. **Speichern.**
2. Button **„Prüfen"** → das System prüft die Angaben (Pflichtfelder, Fehlerhinweise).
3. Button **„Akkreditierung beantragen"** → Rückfrage „Sind Sie sicher …?" bestätigen.
4. Zwei Pflicht-Checkboxen bestätigen (Antrag gem. § 18 Abs. 2 E-GovG):
   - Einhaltung der DSGVO (Verordnung (EU) 2016/679).
   - Kenntnisnahme der Pflichten gem. § 18 E-GovG (Änderungen an den Registrierungsdaten,
     am Zweck oder an Verantwortlichen gem. § 9 VStG sind dem BMI unverzüglich über das USP
     zu melden).
5. **REF:** Der Antrag wird **stündlich automatisch genehmigt**. **Echtsystem:** manuelle
   Prüfung durch die Behörde.
6. **OIDC Client Secret erstellen — Pflicht vor dem Aktivieren, leicht zu übersehen!**
   Ohne Secret bricht das Aktivieren mit „Fehler beim Aktivieren — Bitte erstellen Sie vor
   dem Aktivieren ein OIDC Client Secret" ab. Auf **Service-Provider-Ebene** (nicht in der
   Version) findet sich neben den Buttons „Neue Version anlegen" und „Service Provider
   löschen" der kleine, unscheinbare Button **„OIDC Secret neu erstellen"**. Klicken →
   Dialog „OIDC Client Secret neu erstellen" bestätigen. **Das Secret wird nur EINMALIG
   angezeigt — sofort kopieren** und als `clientSecret` bzw. `IDA_CLIENT_SECRET`
   hinterlegen. Die Änderung kann **bis zu 30 Minuten** wirksam werden.
7. Nach erfolgter Akkreditierung **und** vorhandenem OIDC-Secret den SP/die Version
   **aktivieren**. Fertig.

---

## Feld → Paket-Konfiguration

| USP-Feld | Paket-Config (`createIdAustria`) | Anmerkung |
|---|---|---|
| Unique ID (OIDC Client ID) | `clientId` | exakt übernehmen; = `aud` im `id_token` |
| Client Secret (Button „OIDC Secret neu erstellen") | `clientSecret` | einmalig angezeigt; nur serverseitig, Secret Manager |
| Weiterleitungsadresse | `redirectUri` | exakt, keine Wildcards, muss im Request identisch sein |
| Umgebung (IDA vs. IDA REF) | `environment` | `production` bzw. `test` |
| Angeforderte Attribute | (— serverseitig geliefert) | erscheinen als Claims im `id_token`, siehe `profile.js` |

```js
const ida = createIdAustria({
  environment: 'test',                      // REF; für Echtsystem 'production'
  clientId:     process.env.IDA_CLIENT_ID,  // = Unique ID / OIDC Client ID
  clientSecret: process.env.IDA_SECRET,     // bei Registrierung erzeugt
  redirectUri:  process.env.IDA_REDIRECT,   // exakt wie im USP eingetragen
});
```

Attribut-Claim → normalisiertes Profilfeld (`profile.js`): `given_name → firstName`,
`family_name → lastName`, `birthdate → birthdate`, `urn:pvpgvat:oidc.bpk → bpk`
(Personen-Schlüssel), `urn:pvpgvat:oidc.eid_citizen_qaa_eidas_level → qaaLevel`.

---

## Empfohlene Minimal-Konfiguration

Für „echten, eindeutigen Menschen anmelden" reicht die **bPK** als Schlüssel plus die
Basis-Personendaten. So wenig Attribute wie möglich anfordern.

Angeforderte Attribute: **Vorname, Familienname, Geburtsdatum** (die bPK wird ohnehin
geliefert).

Begründungs-Vorlage für das Feld „Begründung":

> Vorname, Familienname und Geburtsdatum: zur eindeutigen Identifikation der Person im
> Rahmen der Kontoerstellung und Zuordnung des Benutzerkontos.

Authentifizierung in **REF**: „Testidentitäten Unterstützung" aktivieren.
„OIDC Requested Claims" und „OIDC Verschlüsselungszertifikat" **nicht** aktivieren.

---

## Checkliste für ein neues Projekt

1. [ ] USP-Services „IDA Serviceprovider" (+ REF) aktiv? (einmalig pro Organisation)
2. [ ] Stammdaten in der SP-Registrierung gepflegt? (einmalig)
3. [ ] **Zuerst in REF:** neuen SP anlegen (Name + Unique ID = OIDC Client ID).
4. [ ] Neue Version: Zweck, Gründe, Friendly Name, Datenschutz-URL (muss live sein!),
       Logo (PNG 960×120, ≤1 MB).
5. [ ] Attribute minimal wählen (Vorname/Familienname/Geburtsdatum) + je Begründung.
6. [ ] Testidentitäten aktivieren (REF); Requested Claims & Verschlüsselung AUS.
7. [ ] Technische Metadaten: OIDC, Redirect-URI(s) exakt eintragen.
8. [ ] Speichern → Prüfen → Akkreditierung beantragen → 2 Checkboxen → (REF: stündlich
       auto-genehmigt).
9. [ ] **Vor dem Aktivieren:** auf SP-Ebene Button „OIDC Secret neu erstellen" → Secret
       **einmalig** anzeigen/kopieren (bis zu 30 Min. wirksam), dann **aktivieren**.
10. [ ] `clientId`/`clientSecret`/`redirectUri` ins Secret Management des Projekts, `ida`
       mit `environment: 'test'` verdrahten, Login end-to-end testen.
11. [ ] Erst wenn REF läuft: SP im **Echtsystem** anlegen/akkreditieren,
        `environment: 'production'`, Live-Redirect-URI eintragen.
