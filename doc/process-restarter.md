# Neustart von Node-RED aus dem Tuya Manager

Analyse der bestehenden Neustart-Funktion (`process-restarter` 1.0.2) und Vorschlag für eine
Überarbeitung. Stand: 2026-10-03. Noch nichts davon ist umgesetzt.

## Wie es heute funktioniert

Der Manager-Node erzeugt beim Start einen `Restarter`
([nodes/tuya_manager.js](../nodes/tuya_manager.js)):

```js
this.restarer = new Restarter('nodered.service', 'node-red',
  path.join(os.homedir(), '.node-red', 'start-nodered.sh'))
```

Ausgelöst wird der Neustart über eine Nachricht an den Manager-Node mit
`msg.topic = 'restartNodeRed'`. `Restarter.restart()` prüft dann mit
`systemctl is-active nodered.service`, ob Node-RED als systemd-Dienst läuft:

- **aktiv:** `sudo systemctl restart nodered.service`
- **nicht aktiv (Fallback):** Datei `/tmp/restart_node-red` anlegen und `pkill -f node-red`
  ausführen. Ein Überwachungsskript `~/.node-red/start-nodered.sh` soll Node-RED dann neu
  starten. Das Skript wird beim Erzeugen des Restarters angelegt, falls es fehlt, aber von
  niemandem gestartet.

Für den systemd-Weg braucht der Benutzer, unter dem Node-RED läuft, eine sudoers-Regel ohne
Passwort. Laut Kommentar im Code:

```
user ALL=(ALL) NOPASSWD: /bin/systemctl restart nodered.service
```

## Bewertung

### systemd-Weg: passt als Konzept

Ein Neustart über `systemctl` ist sauber: Node-RED fährt geordnet herunter und systemd startet
es wieder. Das funktioniert auch, wenn Node-RED den Befehl selbst auslöst, weil systemd den
Auftrag übernimmt, bevor der aufrufende Prozess beendet wird.

Schwächen:

1. **Kein `sudo -n`.** Fehlt die sudoers-Regel, wartet `sudo` auf ein Passwort, das nie kommt.
   Mit `-n` schlägt es sofort mit klarer Meldung fehl.
2. **Pfad in der sudoers-Regel.** Der Kommentar nennt `/bin/systemctl`. Auf aktuellen
   Raspberry Pi OS liegt es unter `/usr/bin/systemctl`, `/bin` ist nur ein Link. Ob sudo die
   Regel trotzdem anwendet, ist nicht geprüft (Vermutung). Prüfung siehe unten.
3. **Kein Ergebnis in Node-RED.** Der Manager ruft `done()` sofort auf; Fehler gehen nur per
   `console.error` ins Journal. Im Node-RED-Log stehen weder Aktion noch Ergebnis.

### Fallback ohne systemd: fehlerhaft und gefährlich

Befunde aus dem Code, nicht auf einem Gerät ausgeführt:

4. **Beendet Node-RED ohne Neustart.** Der Fallback greift immer, wenn `systemctl is-active`
   nicht „active“ meldet, z. B. bei anderem Dienstnamen, Docker oder pm2. Dann läuft
   `pkill -f node-red`. Läuft das Überwachungsskript nicht, ist Node-RED einfach aus.
5. **`pkill -f node-red` trifft zu viel.** Es beendet jeden Prozess, dessen Befehlszeile
   „node-red“ enthält. Dazu gehört auch das Überwachungsskript selbst, denn sein Pfad
   `~/.node-red/start-nodered.sh` enthält „node-red“.
6. **Das Skript erkennt sich vermutlich selbst.** `pgrep -f "node-red"` im Skript findet aus
   demselben Grund wohl immer einen Treffer, z. B. eine Subshell des Skripts. `grep -v $$`
   filtert nur die Haupt-PID, und zwar als Textstück, also auch PIDs, die diese Ziffern nur
   enthalten. Das Skript würde dann nie neu starten (Vermutung).

### Kleinere Punkte

7. `"child_process": "^1.0.2"` im `package.json` von `process-restarter` ist überflüssig.
   `child_process` ist in Node eingebaut; das npm-Paket dieses Namens ist nur ein Platzhalter.
8. Das Shell-Skript wird bei jedem Erzeugen eines Manager-Nodes angelegt, auch unter Windows.

## Prüfen auf dem Pi

```sh
# which user runs Node-RED
systemctl show -p User nodered.service
# as that user: -n fails at once instead of asking for a password
sudo -n systemctl is-active nodered.service && echo "sudo rule works"
# the configured rules of that user
sudo -l
```

Der Test mit `is-active` klappt nur, wenn die Regel `systemctl` allgemein erlaubt. Ist sie auf
`systemctl restart nodered.service` beschränkt, schlägt er fehl, obwohl der Neustart
funktionieren würde. Maßgeblich ist dann die Ausgabe von `sudo -l`.

## Vorschläge

### Hintergrund

`process-restarter` ist entstanden, weil Node-RED keinen Neustart des eigenen Prozesses
mitbringt. Das Deploy-Menü bietet nur „Restart Flows“: Das startet die Flows neu, nicht den
Prozess, und lädt deshalb keine neuen Paketstände (z. B. nach `git pull`).

Vor der Entscheidung prüfen: Gibt es in der aktuellen Node-RED-Version inzwischen einen
Prozess-Neustart (Release Notes, Editor-Menü, Admin-API)? Stand der Analyse: nein, aber nicht
gegen die aktuelle Version geprüft.

### Alternative A: Neustart direkt im Tuya Manager

Neustart direkt in `tuya_manager.js` umsetzen und `process-restarter` als Abhängigkeit
streichen:

- **Nur der systemd-Weg**, mit `sudo -n systemctl restart nodered.service`.
- **Aktion und Ergebnis im Node-RED-Log**; Fehler über `done(err)`, damit sie im Debug-Panel
  erscheinen.
- **Kein `pkill`-Fallback.** Ohne systemd gibt es eine klare Fehlermeldung statt eines
  beendeten Node-RED.
- **Optional ein Button „Restart Node-RED“** im Manager-Dialog, damit kein Inject-Node nötig
  ist.

Nachteil: Der Neustart ist eine allgemeine Node-RED-Funktion und gehört fachlich nicht in ein
Tuya-Paket.

### Alternative B: eigenes Paket `node-red-contrib-process-restarter`

Gilt, falls Node-RED den Prozess-Neustart weiterhin nicht mitbringt.

Aus `process-restarter` wird ein eigenständiges Node-RED-Paket mit einem Node „Restart“, den
man in einen Flow zieht (z. B. hinter einen Inject- oder Dashboard-Button). Der Tuya Manager
verliert die Funktion `restartNodeRed`, und `process-restarter` fliegt aus den Abhängigkeiten
von `node-red-contrib-tuya-devices`.

Vorschlag für den Node:

- **Eingang:** jede Nachricht löst den Neustart aus.
- **Konfiguration:** Name des systemd-Dienstes (Default `nodered.service`).
- **Ablauf:** `sudo -n systemctl restart <dienst>`. Kein `pkill`-Fallback.
- **Status und Log:** Aktion und Ergebnis im Node-RED-Log; Node-Status vor dem Neustart
  („restarting…“); Fehler (z. B. fehlende sudoers-Regel) über `done(err)` im Debug-Panel.
- **Ausgang:** keiner nötig. Bei Erfolg endet der Prozess; ein Fehler kommt über `done(err)`
  und lässt sich mit einem Catch-Node abfangen.
- **Hilfetext:** sudoers-Regel und die Prüfbefehle von oben.

Schritte:

1. Prüfen, dass Node-RED keinen eigenen Prozess-Neustart hat (siehe Hintergrund).
2. Neues Paket `node-red-contrib-process-restarter` mit Node `restart` anlegen; die Logik aus
   `process-restarter` übernehmen und dabei die Punkte 1, 3 bis 8 beheben.
3. In `node-red-contrib-tuya-devices`: `restartNodeRed` aus dem Manager, den `Restarter` und die
   Abhängigkeit `process-restarter` entfernen; CHANGELOG-Hinweis, dass der Neustart jetzt über
   das neue Paket läuft (Breaking Change für Flows, die `restartNodeRed` senden).
4. `process-restarter` als npm-Paket als veraltet markieren (`npm deprecate`) oder als reine
   Bibliothek des neuen Pakets weiterführen.

Vorteile: Die Funktion steht allen Flows zur Verfügung, unabhängig von Tuya; das Tuya-Paket wird
schlanker.

Nachteil: ein weiteres Paket, das gepflegt und veröffentlicht werden muss.

### Zum Vergleich: Exec-Node von Node-RED

Ohne eigenes Paket geht es auch mit dem eingebauten Exec-Node und dem Befehl
`sudo -n systemctl restart nodered.service`. Voraussetzung ist dieselbe sudoers-Regel. Ein
eigener Node lohnt sich vor allem für die bessere Bedienung: feste Konfiguration statt
Befehlszeile, Hilfetext, Status, verständliche Fehlermeldung.

### Alternative C: `process-restarter` selbst reparieren

Falls es noch anderswo als Bibliothek verwendet wird: `sudo -n`, Ergebnis per Callback oder
Promise zurückgeben, Fallback entfernen oder nur auf ausdrücklichen Wunsch, die Abhängigkeit
`child_process` streichen.

## Zusammenspiel mit der Source-Installation

Bei einer Installation aus dem Git-Checkout (siehe `test_tuya_install.md`) reichen für neue
Stände in der Regel `git pull` in beiden Repos und ein Neustart. Ausnahmen:

- geänderte Abhängigkeiten in einem `package.json`: vorher `npm install --omit=dev` im
  betroffenen Checkout, bei `node-red-contrib-tuya-devices` mit `--no-save ../tuya-devices`
- geänderte Editor-Dateien (`.html`): nach dem Neustart den Editor im Browser neu laden
