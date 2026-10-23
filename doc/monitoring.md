# Device monitor

The device monitor watches the local Tuya devices of a project. It reports when a
device stops working, narrows down the probable cause (diagnosis) and can try to bring
a failed device back (self-healing).

The monitor is part of the project. It sends its messages on the output of the
`tuya-manager` node. Connect this output to whatever should receive the reports,
e.g. a notification service. The package itself does not send notifications.

The monitor is **off by default**. Existing installations behave as before until it is
enabled.

## Enable the monitor

- **For the whole project:** open the `tuya-project` config node, tab **Monitoring**,
  and check *Monitor the devices of this project*.
- **Per device:** open the `tuya-local-device` config node, tab **Monitoring**, and set
  *Monitor* to `as project` (default), `on` or `off`. `on` monitors the device even if
  the project monitor is off. `off` excludes the device.

Which devices are monitored:

- Only devices that are used by a `tuya-device` node (for a gateway, also through its
  clients). A local device config node that no device node uses does not connect and is
  never monitored, whatever the setting.
- Stopped devices (*Stopped* in the local device node) are not monitored.
- The monitor cannot tell a device that was switched off on purpose from a failed one.
  For such a device, set *Monitor* to `off` or stop the device.

The monitor checks all devices every 30 seconds.

## Health

Each monitored device has one of these health states:

| Health | Meaning |
|---|---|
| `ok` | connected, no warning signs |
| `degraded` | works, but with warning signs |
| `failed` | does not work |

### Checks

| Check | Result | Default |
|---|---|---|
| Offline | not connected for longer than the limit → `failed` | 5 min |
| Connection losses | this number of connection losses within the time window → `degraded` | 5 within 60 min |
| No answer | connected, but no answer for longer than the limit → `degraded` | 30 s |

Details:

- **Offline** counts from the loss of the connection. A device that never connected
  since the monitor started counts from the start of the monitor.
- A **paused** device (connection attempts paused, see *Pause when offline* in the local
  device node)
  is `failed` at once, with the reason `connection attempts paused`.
- **No answer** applies only to devices that answered the heartbeat in the current
  connection. Some devices never answer the heartbeat; they are not checked. Any
  answer counts: a heartbeat answer or data.
- Independently of the monitor, the library closes the connection to a device that
  answered the heartbeat and then sends nothing (no heartbeat answer, no data) for
  60 s. The device then reconnects. This counts as a connection loss.
- While a device is offline for less than the limit, its last health is kept.

### Reports

A report is sent only when the health of a device **changes**. It is not repeated.

- The first evaluation after the start reports problems only, not `ok`.
- Stopping and starting a device by the user is not reported.

Output of the `tuya-manager` node:

```js
{
  topic: 'deviceHealth',
  payload: {
    deviceId: '<deviceId>',
    name: 'Alarm hub',
    health: 'failed',              // ok | degraded | failed
    previous: 'ok',                // last health, null for the first report
    reason: 'offline for 5 min',
    priority: 'normal',            // normal | critical, from the local device node
    since: '2026-01-01T12:00:00.000Z',
    diagnosis: {                   // null when the device is ok again
      finding: 'unreachable',
      text: 'device does not answer and does not announce itself',
      hint: 'check the WLAN and the power supply of the device'
    },
    diagnostics: { /* connection snapshot of the device */ }
  }
}
```

`diagnostics` is the same snapshot that the command `getDiagnostics` returns on a device
node: state, connection times, errors, address, protocol and reconnect counters. It does
not contain the local key. It does contain the IP and MAC address of the device; filter it
before you forward the message to an external service.

## Diagnosis

The diagnosis evaluates the connection snapshot and the check that failed. The rules
apply in this order; the first match gives the finding.

| `finding` | Detected by | Hint |
|---|---|---|
| `not-in-network` | connection error `EHOSTUNREACH` or `ENETUNREACH` | check the WLAN and the power supply of the device |
| `connection-refused` | connection error `ECONNREFUSED` | another local client (app, integration) may be connected to the device |
| `address-changed` | the device announces another IP than the one in use | the IP is determined again; use a fixed IP (DHCP reservation) if it changes often |
| `protocol-uncertain` | protocol version not verified, or several versions tried | check the protocol version in the device settings |
| `device-hangs` | offline or paused, but an announcement of the device arrived within the last 2 min | restart the device (power off/on) |
| `unreachable` | offline or paused, no recent announcement | check the WLAN and the power supply of the device |
| `not-answering` | connected, but no answer (heartbeat or data) | the connection is rebuilt; if it repeats, restart the device |
| `unstable` | frequent connection losses | check the WLAN signal strength at the device |
| `unknown` | no rule matches | see the diagnostics snapshot |

`diagnosis` is an object `{ finding, text, hint }`, or `null` when the device is ok.

## Self-healing

Self-healing is **off by default**. Enable it in the project node, tab **Monitoring**,
*Self-healing of failed devices*. It acts on `failed` devices only.

### Levels

| Level | Action | What it does |
|---|---|---|
| 1 | own reconnect | Always done by the device itself. No action of the monitor. |
| 2 | `rebuild` | Rebuilds the connection: new channel, IP determined again (ARP, announcement) unless the IP is fixed. Also resumes a paused device. |
| 3 | `search` | Active search: checks whether the device is in the network and connects at once if so (see below). |
| 4 | `power-cycle` | Switches the power of the device off and on by a power switch device. |

**Level 3** works through these checks:

1. An announcement of the device arrived within the last 2 min → connect to its IP.
2. Otherwise, the ARP table (by MAC) gives another IP → connect to this IP.
3. Otherwise, ping the device:
   - it answers → finding `device-hangs`,
   - no answer → finding `unreachable`.

   In both cases the recommendation is `power-cycle`. Level 3 only reports it; level 4
   does the switching.

Level 3 also sends the discovery broadcast and forgets the last announcement, so the
next announcement of the device is noticed again. A paused device that is found is
resumed. The result of the checks is reported as `probe` (see below).

**Level 4** needs a power switch, configured in the local device node of the failed
device: *Power switch* (another local device of the same project), *Switch DP*
(default `1`) and *Power off* (default 10 s). The monitor switches the DP off, waits the
power off time and switches it on again. Switching on is tried up to 3 times. If the
power switch is not connected, nothing is switched and the error is reported. If
switching on fails 3 times, the report says that the device stays off. A device cannot
be its own power switch.

### Sequence

- The first action follows as soon as the device is `failed`.
- Levels 2 and 3 alternate: 2 → 3 → 2 → 3 …, up to the highest allowed level.
- Level 4 follows directly after a level 3 whose checks recommended `power-cycle`. After
  level 4 the sequence continues with level 2.
- The wait after the first action is 60 s. It doubles after each further action, up to
  60 min.
- As soon as the device is no longer `failed`, the sequence is reset. The next outage
  starts again with the first level and a wait of 60 s.

### Limits and special cases

- **Actions per hour** (default 10) limits the actions of the whole project. The limit
  counts separately for devices with priority `critical` and for the other devices, so
  other devices cannot lock out a critical one. Critical devices are healed first, then
  the device healed least recently. A device blocked by the limit is reported once with
  `skipped`.
- **Dry run** reports what the monitor would do, without doing it. Level 2 is only
  reported. Level 3 runs its checks without connecting or sending the broadcast. Level 4
  is only reported.
- **Gateway:** level 3 only (its clients share its connection), plus level 4 if it has a
  power switch.
- **Gateway clients** (devices behind a gateway): no action. They are healed through their
  gateway.
- **Stopped devices:** never touched.
- **Highest level:** set for the project (default 4) and optionally per device
  (*Healing up to*). Level 4 applies only to devices with a power switch.

Do not run another power cycle automation (e.g. a restart flow) for the same device at
the same time. Both would switch the power independently.

### Reports

Every action is reported on the output of the `tuya-manager` node:

```js
{
  topic: 'deviceHealing',
  payload: {
    deviceId: '<deviceId>',
    name: 'Alarm hub',
    priority: 'normal',
    since: '2026-01-01T12:05:00.000Z',
    level: 3,                      // 2 | 3 | 4
    action: 'search',              // rebuild | search | power-cycle
    attempt: 2,                    // number of the action in this outage
    done: true,                    // the action was carried out (false in a dry run)
    dryRun: false,
    waitSeconds: 120,              // wait until the next action
    nextAt: '2026-01-01T12:07:00.000Z',
    probe: {                       // level 3 only
      announced: false,            // recent announcement
      arpIp: '<ip>',               // IP from the ARP table, '' if none
      ipChanged: false,
      ping: true,
      action: 'none',              // connect | none
      finding: 'device-hangs',     // device-hangs | unreachable, '' after a connect
      recommendation: 'power-cycle'
    },
    power: undefined,              // level 4 only, see below
    diagnosis: { finding: 'device-hangs', text: '…', hint: '…' }
  }
}
```

`done` is `false` in a dry run, when an action failed, for level 2 if the connection
could not be rebuilt and for level 4 if nothing was switched.

For level 4, `power` contains `switch` (name of the power switch), `dps`, `offSeconds`,
`switched` and, on failure, `error` (e.g. power switch not connected, or switching on
failed and the device stays off).

If the hourly limit blocks an action, the payload contains only `deviceId`, `name`,
`priority`, `since` and `skipped` (the reason). This is sent once per device until the
next action runs.

## Settings

### Project node (`tuya-project`, tab Monitoring)

| Setting | Default | Meaning |
|---|---|---|
| Monitor the devices of this project | off | enables the monitor |
| Offline | 5 min | time without connection until `failed` |
| Connection losses / within | 5 / 60 min | connection losses within the window until `degraded` |
| No answer | 30 s | time without any answer until `degraded` (only devices that answer the heartbeat); an early warning before the library closes the connection after 60 s |
| Self-healing of failed devices | off | enables the self-healing |
| Highest level | 4 | highest self-healing level: 2, 3 or 4 |
| Actions per hour | 10 | limit for the project, separately for critical and other devices |
| Dry run: report only | off | reports the actions without doing them |

### Local device node (`tuya-local-device`, tab Monitoring)

Empty fields use the project values.

| Setting | Default | Meaning |
|---|---|---|
| Monitor | as project | `as project`, `on` (also if the project monitor is off) or `off` |
| Priority | normal | `normal` or `critical`; passed as `priority` in the reports, decides the order and the group of the hourly limit; does not change the limits of the checks |
| Offline, Connection losses / within, No answer | project value | limits of the checks for this device |
| Healing up to | as project | highest self-healing level: `1` (no action of the monitor), `2`, `3` or `4`; self-healing itself is enabled in the project node only |
| Power switch | none | local device of the same project that supplies this device with power |
| Switch DP | `1` | data point of the power switch |
| Power off | 10 s | time the power stays off |

The power switch settings are editable only if level 4 is possible: *Healing up to* is
4, or *as project* and the highest level of the project is 4.

## Design notes

- **Older devices and the active search.** The discovery broadcast of level 3 is
  answered by protocol v3.5 devices only. Older devices cannot be made to announce
  themselves; they announce themselves every few seconds anyway. For them, level 3
  relies on the last announcement, the ARP table and the ping.
- **No give-up level.** The monitor does not give up on a device. The growing wait (up
  to 60 min) and the hourly limit keep the number of actions low.
- **Heartbeat.** Not every device answers the heartbeat. The *No answer* check and the
  closing of silent connections therefore apply only to devices that answered it in the
  current connection.
