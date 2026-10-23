# Überwachung, Diagnose und Selbstheilung aktiver Geräte

Konzept für einen Geräte-Monitor im Projekt. Stand: 2026-10-22. Noch nichts davon ist
umgesetzt; vorhanden ist die Grundlage in `tuya-devices` (Verbindungsdiagnose, Befehl
`getDiagnostics`, ab Version nach 1.3.9).

## Ziel

Ein Gerät, das nicht funktioniert, soll zeitnah gemeldet werden. Zusätzlich soll der
Monitor die Ursache eingrenzen (Onboard-Diagnose) und gestufte Selbstheilungsversuche
unternehmen. Alles ist abschaltbar und konfigurierbar – für das ganze Projekt und je Gerät.

Anlass: Eine Alarmzentrale (Kategorie `mal`) hing wiederholt, teils 12 h, ohne dass es
auffiel. Die Diagnose zeigte später Muster wie ausbleibende Herzschlag-Antworten vor einem
`ECONNRESET` und kurze Ausfälle mit Selbsterholung.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Wo liegt die Logik? | In `tuya-devices` als Monitor des Projekts (`lib/monitor.js`), testbar ohne Node-RED, läuft auch ohne Manager-Node |
| Meldeweg | Nur über den Ausgang des Manager-Nodes; der Benutzer verbindet ihn z. B. mit Telegram. Das Paket kennt keinen Meldedienst |
| Projekt-Einstellungen | Im Projekt-Node (`tuya-project`); der Manager-Node ist optional |
| Einstellungen je Gerät | Im Konfig-Node `tuya-local-device`, neuer Reiter „Monitoring“; erbt standardmäßig vom Projekt |
| Standard für bestehende Installationen | Aus. Erst nach dem Einschalten ändert sich das Verhalten |

## Vorhandene Grundlage

- Projekt: kennt alle aktiven Geräte; Ereignisse `device-state`, `device-find`,
  `cloud-status`; Gerätezustand (online, offline, pausiert, gestoppt).
- Manager-Node: hört auf diese Ereignisse, zeigt den Zustand im Reiter „Devices“.
- Gerät (`lib/device.js`): Diagnose beim ersten Verbindungsverlust, nach 5 min Ausfall,
  Zusammenfassung beim Wiederverbinden; `getDiagnostics()` mit Zustand, Verbindung
  (`lastDataAt`, `lastPongAt`, `lastPingSentAt`), Fehlerarten, Adresse (IP, Rundruf-IP,
  ARP-IP), Protokoll (Version, verifiziert, Durchprobieren), Wiederverbindung.

## 1. Überwachung

Gesundheitszustand je Gerät: **ok**, **auffällig** (läuft, aber Warnzeichen),
**gestört** (funktioniert nicht), **gestoppt** (vom Benutzer abgeschaltet, nicht überwacht).

| Prüfung | Bedeutung | Standardwert |
|---|---|---|
| Offline-Dauer | länger als *X* nicht verbunden → gestört | 5 min |
| Häufige Abbrüche | mehr als *N* Abbrüche in *T* → auffällig | 5 in 1 h |
| Herzschlag | verbunden, aber länger als *X* keine Antwort – Herzschlag-Antwort oder Daten, jede Antwort zählt – → auffällig (nur Geräte, die den Herzschlag beantworten) | 60 s |
| Datenstille | länger als *X* keine Daten → auffällig (nur für Geräte, die regelmäßig senden) | aus |
| Protokoll | nicht verifiziert bzw. Durchprobieren läuft → auffällig | an |

Meldung nur beim **Wechsel** des Zustands, entprellt, nicht wiederholt. Ausgang des
Manager-Nodes:

```js
{
  topic: 'deviceHealth',
  payload: { deviceId, name, health, previous, reason, since, diagnosis }
}
```

Dazu: Bericht auf Anfrage (`msg.topic = 'healthReport'` an den Manager), optional ein
täglicher Bericht zu einer einstellbaren Uhrzeit.

## 2. Onboard-Diagnose

Regeln werten die Momentaufnahme aus und liefern einen Befund mit Hinweis
(`diagnosis` in der Meldung):

| Befund | Erkennung | Hinweis |
|---|---|---|
Umgesetzt in `tuya-devices/lib/diagnosis.js`; die Regeln gelten in dieser Reihenfolge,
die erste passende liefert den Befund (`finding`):

| Befund (`finding`) | Erkennung | Hinweis |
|---|---|---|
| nicht im Netz (`not-in-network`) | Fehler `EHOSTUNREACH` / `ENETUNREACH` | WLAN bzw. Stromversorgung des Geräts prüfen |
| Verbindung abgelehnt (`connection-refused`) | `ECONNREFUSED` | anderer lokaler Client verbunden? |
| Adresse gewechselt (`address-changed`) | verwendete IP ≠ Rundruf-IP | IP wird neu ermittelt; ggf. feste IP |
| Protokoll unsicher (`protocol-uncertain`) | nicht verifiziert bzw. Durchprobieren | Protokollversion prüfen |
| Gerät hängt (`device-hangs`) | offline/pausiert, aber Rundruf jünger als 2 min | Neustart des Geräts |
| nicht erreichbar (`unreachable`) | offline/pausiert, kein aktueller Rundruf | WLAN bzw. Stromversorgung prüfen |
| antwortet nicht (`not-answering`) | verbunden, keine Antwort (Herzschlag oder Daten) | bei Wiederholung Neustart |
| instabil (`unstable`) | häufige Abbrüche | WLAN-Empfang am Gerät prüfen |
| unbekannt (`unknown`) | keine Regel trifft | Momentaufnahme liegt bei |

Ist das Gerät wieder ok, ist `diagnosis` `null`. Die Momentaufnahme enthält dafür neu
`address.announcementAt` (Zeitpunkt des letzten Rundrufs). Die ARP-Prüfung ist nicht
Teil der Regeln, weil sie asynchron ist; sie bleibt in der protokollierten Momentaufnahme.

## 3. Selbstheilung

Gestuft, jede Stufe einzeln abschaltbar, höchste Stufe je Gerät einstellbar:

1. **Neu verbinden** – vorhanden.
2. **Verbindung neu aufbauen** – IP neu ermitteln (ARP, Rundruf), Kanal neu erzeugen
   (deinit/init).
3. **Aktive Suche** – Rundruf auslösen, damit sich das Gerät meldet.
4. **Strom aus/an** über ein konfiguriertes Schaltgerät (Gerät + DP): aus, kurze Pause, an.
   Wartezeit danach 60 s, bei weiterem Ausfall jeweils verdoppelt, bis das Gerät antwortet.
   Ist das Schaltgerät selbst nicht erreichbar, kein Schaltversuch, sondern Meldung.
5. **Aufgeben** – Gerät pausieren und melden.

Schutzregeln:

- wachsende Wartezeit je Stufe, kein Wiederholen im festen Takt (keine Reset-Schleife);
- Obergrenze für Heilaktionen pro Stunde im Projekt, getrennt für kritische und übrige
  Geräte; kritische zuerst;
- keine Aktionen für gestoppte Geräte;
- **Probelauf**: der Monitor meldet nur, was er tun würde.

Jede Heilaktion wird gemeldet (`topic: 'deviceHealing'`, mit Stufe und nächster Wartezeit).

Umgesetzt (Stand Schritt 5): Stufen 2, 3 und 4; Stufe 5 (Aufgeben) nicht – die Wartezeit
wächst bis 60 min, die Obergrenze pro Stunde begrenzt die Aktionen.

## 4. Konfiguration

**Projekt-Node** (`tuya-project`), gilt für alle Geräte:

- Überwachung an/aus (Standard aus)
- Standardwerte der Prüfungen
- Selbstheilung an/aus, höchste Stufe
- Probelauf an/aus
- täglicher Bericht an/aus, Uhrzeit

**Geräte-Node** (`tuya-local-device`, Reiter „Monitoring“), erbt vom Projekt:

- Überwachung: erben / an / aus
- Abweichende Schwellen, erwartetes Datenintervall
- höchste Heilstufe
- Schaltgerät für Stufe 4 (Konfig-Node + DP)
- Wichtigkeit (z. B. „kritisch“ für die Alarmzentrale: kürzere Schwellen)

## 5. Reihenfolge der Umsetzung

Jeder Schritt einzeln, testgetrieben, einzeln committbar:

1. Monitor mit den Prüfungen Offline-Dauer, häufige Abbrüche, Herzschlag; Ereignis
   `deviceHealth` am Manager; Konfiguration nur im Projekt-Node. – **Umgesetzt 2026-10-22**
   (`tuya-devices`: `lib/monitor.js`, Tests `test/monitor_tests.js`; Projekt-Node Reiter
   „Monitoring“, Manager-Ausgang `deviceHealth`).
2. Abweichungen je Gerät im Geräte-Editor. – **Umgesetzt 2026-10-22** (Reiter „Monitoring“:
   wie Projekt / an / aus, eigene Schwellen, Wichtigkeit als `priority` in der Meldung – ändert
   keine Schwellen; „an“ wirkt auch bei ausgeschaltetem Projekt-Monitor).
3. Diagnose-Regeln. – **Umgesetzt 2026-10-22** (`tuya-devices`: `lib/diagnosis.js`, Tests
   `test/diagnosis_tests.js`; Feld `diagnosis` in der Meldung `deviceHealth`).
4. Selbstheilung Stufe 2 und 3. – **Umgesetzt 2026-10-22** (`tuya-devices`: `lib/monitor.js`
   `heal()`, `Device.rebuildConnection()`, `Device.activeSearch()`, `Scanner.probe()`, Tests
   `test/healing_tests.js`; Projekt-Node: Selbstheilung an/aus, höchste Stufe, Aktionen pro
   Stunde, Probelauf; Geräte-Node: „Healing up to“; Manager-Ausgang `deviceHealing`).
   Ablauf: ab „gestört“ wechseln die Stufen 2 → 3 → 2 … bis zur höchsten Stufe; Wartezeit
   60 s, nach jeder Aktion verdoppelt, höchstens 60 min; zurückgesetzt, sobald das Gerät
   nicht mehr gestört ist. Obergrenze 10 Aktionen pro Stunde im Projekt, getrennt für
   kritische und übrige Geräte (ergänzt 2026-10-23); kritische Geräte zuerst, danach das am
   längsten nicht geheilte; eine Sperre durch die Obergrenze wird je Gerät einmal gemeldet
   (`skipped`), im Log eine Sammelwarnung. Gateway: nur Stufe 3 (seine Clients teilen den Kanal); Gateway-Clients: keine
   Aktion; gestoppte Geräte: keine Aktion; pausierte Geräte werden geheilt (Stufe 2 hebt die
   Pause auf, Stufe 3 führt über den Rundruf zum Fortsetzen). Die aktive Suche sendet den
   Rundruf des Scanners sofort; darauf antworten v3.5-Geräte, ältere melden sich ohnehin
   selbst alle paar Sekunden.
   **Ergänzt 2026-10-22 (4b):** Stufe 3 prüft die Erreichbarkeit selbst und verbindet sofort,
   unabhängig vom Verbindungszustand: Rundruf jünger als 2 min → mit dessen IP verbinden;
   sonst ARP über die MAC liefert eine andere IP → mit ihr verbinden; sonst Ping: antwortet →
   `device-hangs`, keine Antwort → `unreachable`, in beiden Fällen Empfehlung `power-cycle`
   (nur gemeldet, geschaltet wird erst mit Stufe 4). Ergebnis als `probe` in `deviceHealing`.
5. Stufe 4 mit Schaltgerät – danach können Ausfallmeldung und Neustart-Wächter aus
   anwendungsspezifischen Flows (z. B. „Alarm2“) entfallen. – **Umgesetzt 2026-10-22**
   (`tuya-devices`: `Monitor.powerCycle()`, Tests `test/healing_tests.js`; Geräte-Node:
   Schaltgerät (lokales Gerät desselben Projekts, gespeichert als Geräte-ID), Schalt-DP
   (Standard `1`), Aus-Zeit (Standard 10 s), „Healing up to“ bis 4; Projekt: höchste Stufe
   Standard 4 – wirkt nur bei Geräten mit Schaltgerät). Ablauf: Stufe 4 direkt nach einer
   Stufe 3, deren Prüfung `power-cycle` empfiehlt (Gerät antwortet nur auf Ping, oder nicht im
   Netz); danach wieder Stufe 2. Schaltgerät nicht verbunden → nichts geschaltet, Meldung;
   Einschalten bis zu 3 Versuche, sonst Meldung „device stays off“. Probelauf: Stufe 3 prüft
   nur (ohne Aktion), Stufe 4 wird nur gemeldet. Ein Gerät schaltet sich nicht selbst.
   Gleichzeitig keine anderen Neustart-Automatiken für dasselbe Gerät betreiben.
6. Manager, Reiter „Devices“: Spalte Gesundheit und letzte Diagnose, Knöpfe
   „Diagnose jetzt“ und „Heilen jetzt“.

## Offene Punkte

- Entprellung: wie lange muss ein Zustand anhalten, bevor er gemeldet wird?
- Täglicher Bericht: Inhalt und Format.
- Gateway-Clients (Geräte hinter einem Gateway): Überwachung über das Gateway oder einzeln?
