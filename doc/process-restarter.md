# Restarting Node-RED from the Tuya Manager

Analysis of the existing restart function (`process-restarter` 1.0.2) and a proposal for a
rework. As of 2026-10-03. None of this is implemented yet.

## How it works today

On start, the manager node creates a `Restarter`
([nodes/tuya_manager.js](../nodes/tuya_manager.js)):

```js
this.restarer = new Restarter('nodered.service', 'node-red',
  path.join(os.homedir(), '.node-red', 'start-nodered.sh'))
```

The restart is triggered by a message to the manager node with
`msg.topic = 'restartNodeRed'`. `Restarter.restart()` then uses
`systemctl is-active nodered.service` to check whether Node-RED runs as a systemd service:

- **active:** `sudo systemctl restart nodered.service`
- **not active (fallback):** create the file `/tmp/restart_node-red` and run `pkill -f node-red`.
  A watchdog script `~/.node-red/start-nodered.sh` is then supposed to start Node-RED again.
  The script is created when the Restarter is created, if it is missing, but nobody starts
  it.

For the systemd path, the user that runs Node-RED needs a sudoers rule without a password.
According to a comment in the code:

```
user ALL=(ALL) NOPASSWD: /bin/systemctl restart nodered.service
```

## Assessment

### systemd path: sound as a concept

A restart via `systemctl` is clean: Node-RED shuts down in an orderly way and systemd starts
it again. This also works when Node-RED itself triggers the command, because systemd takes
over the job before the calling process ends.

Weaknesses:

1. **No `sudo -n`.** If the sudoers rule is missing, `sudo` waits for a password that never
   comes. With `-n` it fails at once with a clear message.
2. **Path in the sudoers rule.** The comment names `/bin/systemctl`. On current
   Raspberry Pi OS it is located at `/usr/bin/systemctl`; `/bin` is only a link. Whether sudo
   still applies the rule is not verified (assumption). See below for how to check.
3. **No result in Node-RED.** The manager calls `done()` at once; errors only go to the
   journal via `console.error`. The Node-RED log shows neither the action nor the result.

### Fallback without systemd: faulty and dangerous

Findings from the code, not run on a device:

4. **Stops Node-RED without restarting it.** The fallback applies whenever
   `systemctl is-active` does not report "active", e.g. with a different service name, Docker
   or pm2. Then `pkill -f node-red` runs. If the watchdog script is not running, Node-RED is
   simply off.
5. **`pkill -f node-red` hits too much.** It stops every process whose command line contains
   "node-red". This includes the watchdog script itself, because its path
   `~/.node-red/start-nodered.sh` contains "node-red".
6. **The script probably detects itself.** For the same reason, `pgrep -f "node-red"` in the
   script probably always finds a match, e.g. a subshell of the script. `grep -v $$` only
   filters the main PID, and does so as a text fragment, so it also removes PIDs that merely
   contain these digits. The script would then never restart (assumption).

### Minor points

7. `"child_process": "^1.0.2"` in the `package.json` of `process-restarter` is not needed.
   `child_process` is built into Node; the npm package of that name is only a placeholder.
8. The shell script is created every time a manager node is created, also on Windows.

## Checking on the Pi

```sh
# which user runs Node-RED
systemctl show -p User nodered.service
# as that user: -n fails at once instead of asking for a password
sudo -n systemctl is-active nodered.service && echo "sudo rule works"
# the configured rules of that user
sudo -l
```

The test with `is-active` only works if the rule allows `systemctl` in general. If the rule
is limited to `systemctl restart nodered.service`, the test fails even though the restart
would work. In that case the output of `sudo -l` is what counts.

## Proposals

### Background

`process-restarter` was created because Node-RED has no built-in restart of its own process.
The Deploy menu only offers "Restart Flows": this restarts the flows, not the process, and so
does not load new package versions (e.g. after `git pull`).

Check before deciding: does the current Node-RED version have a process restart by now
(release notes, editor menu, Admin API)? State of this analysis: no, but not verified against
the current version.

### Alternative A: restart directly in the Tuya Manager

Implement the restart directly in `tuya_manager.js` and drop `process-restarter` as a
dependency:

- **systemd path only**, with `sudo -n systemctl restart nodered.service`.
- **Action and result in the Node-RED log**; errors via `done(err)` so that they show up in
  the debug panel.
- **No `pkill` fallback.** Without systemd there is a clear error message instead of a
  stopped Node-RED.
- **Optionally a "Restart Node-RED" button** in the manager dialog, so that no Inject node is
  needed.

Drawback: the restart is a general Node-RED function and does not belong in a Tuya package.

### Alternative B: separate package `node-red-contrib-process-restarter`

Applies if Node-RED still has no built-in process restart.

`process-restarter` becomes a standalone Node-RED package with a "Restart" node that you
drag into a flow (e.g. after an Inject node or a dashboard button). The Tuya Manager loses
the `restartNodeRed` function, and `process-restarter` is removed from the dependencies of
`node-red-contrib-tuya-devices`.

Proposal for the node:

- **Input:** every message triggers the restart.
- **Configuration:** name of the systemd service (default `nodered.service`).
- **Procedure:** `sudo -n systemctl restart <service>`. No `pkill` fallback.
- **Status and log:** action and result in the Node-RED log; node status before the restart
  ("restarting…"); errors (e.g. missing sudoers rule) via `done(err)` in the debug panel.
- **Output:** none needed. On success the process ends; an error comes via `done(err)` and
  can be caught with a Catch node.
- **Help text:** the sudoers rule and the check commands from above.

Steps:

1. Verify that Node-RED has no process restart of its own (see Background).
2. Create a new package `node-red-contrib-process-restarter` with a `restart` node; take over
   the logic from `process-restarter` and fix points 1 and 3 to 8 along the way.
3. In `node-red-contrib-tuya-devices`: remove `restartNodeRed` from the manager, the
   `Restarter` and the dependency `process-restarter`; add a CHANGELOG note that the restart
   now works via the new package (breaking change for flows that send `restartNodeRed`).
4. Mark `process-restarter` as deprecated on npm (`npm deprecate`), or keep it as a plain
   library of the new package.

Advantages: the function is available to all flows, independent of Tuya; the Tuya package
gets smaller.

Drawback: one more package that has to be maintained and published.

### For comparison: the Node-RED Exec node

It also works without a separate package, using the built-in Exec node and the command
`sudo -n systemctl restart nodered.service`. It needs the same sudoers rule. A dedicated node
is worth it mainly for better usability: fixed configuration instead of a command line, help
text, status, an understandable error message.

### Alternative C: fix `process-restarter` itself

In case it is still used as a library elsewhere: `sudo -n`, return the result via callback
or Promise, remove the fallback or only use it when explicitly requested, drop the
`child_process` dependency.

## Interaction with the source installation

With an installation from the Git checkout (see `test_tuya_install.md`), new versions usually
only need `git pull` in both repos and a restart. Exceptions:

- changed dependencies in a `package.json`: first run `npm install --omit=dev` in the
  affected checkout, for `node-red-contrib-tuya-devices` with `--no-save ../tuya-devices`
- changed editor files (`.html`): after the restart, reload the editor in the browser
