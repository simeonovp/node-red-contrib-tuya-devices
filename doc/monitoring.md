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
| nicht im Netz | MAC nicht in ARP, kein Rundruf | WLAN bzw. Stromversorgung des Geräts prüfen |
| Adresse gewechselt | verwendete IP ≠ ARP-IP bzw. Rundruf-IP | IP wird neu ermittelt |
| Gerät hängt | Rundruf kommt, TCP antwortet nicht; Herzschlag-Lücke vor dem Abbruch | Neustart des Geräts |
| Verbindung abgelehnt | `ECONNREFUSED` | anderer lokaler Client verbunden? |
| Protokoll unsicher | nicht verifiziert bzw. Durchprobieren | Protokollversion prüfen |
| unbekannt | keine Regel trifft | Momentaufnahme liegt bei |

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
- Obergrenze für Heilaktionen pro Stunde im ganzen Projekt;
- keine Aktionen für gestoppte Geräte;
- **Probelauf**: der Monitor meldet nur, was er tun würde.

Jede Heilaktion wird gemeldet (`topic: 'deviceHealing'`, mit Stufe und nächster Wartezeit).

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
3. Diagnose-Regeln.
4. Selbstheilung Stufe 2 und 3.
5. Stufe 4 mit Schaltgerät – danach können Ausfallmeldung und Neustart-Wächter aus
   anwendungsspezifischen Flows (z. B. „Alarm2“) entfallen.
6. Manager, Reiter „Devices“: Spalte Gesundheit und letzte Diagnose, Knöpfe
   „Diagnose jetzt“ und „Heilen jetzt“.

## Offene Punkte

- Entprellung: wie lange muss ein Zustand anhalten, bevor er gemeldet wird?
- Täglicher Bericht: Inhalt und Format.
- Gateway-Clients (Geräte hinter einem Gateway): Überwachung über das Gateway oder einzeln?
