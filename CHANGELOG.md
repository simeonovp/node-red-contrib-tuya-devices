# TODO
- Add receive buffering across TCP chunks in CommChannel/MessageParser: a Tuya packet split across two TCP segments (or one that just hasn't fully arrived yet) is currently parsed in isolation per socket 'data' event and fails with "Packet missing payload" instead of being buffered and completed by the next chunk. Caught internally (no crash, see v1.5.10), but the update for that moment is silently dropped. Needs a persistent partial-packet buffer in CommChannel that prepends leftover bytes to the next chunk before parsing.

# v1.5.9
- Fixed message parser occasionally dropping/failing to parse an otherwise valid, complete packet: parsePacketPre35() located the packet end by scanning for the raw '0000AA55' suffix bytes, which can occur by chance inside the encrypted payload and cause a premature/incorrect split. Now computed from the header's own length field instead. Bug has been present since the parser was first introduced (2025-03-01), not a recent regression (tuya-devices dependency bump required)
- Fixed #28 "Can not translate X" being logged (and the translation dropped) even when a translation was found; also fixed downloadIconAsync() silently swallowing the real error text and hanging forever on file errors (tuya-devices dependency bump required)
- Added #28 support for custom device icons served from an absolute URL (previously only Tuya's relative CDN icon paths worked); also fixed a crash in updateDeviceIcons() (missing `this.`) found along the way (tuya-devices dependency bump required)
- Added device state to the manager Devices tab: the "Add" column is now "Action" and shows the state by button and color (+: not added, gray play: disabled, yellow stop: offline, green stop: online, red stop: paused). Stop disables a device, play enables it again, both take effect after deploy (tuya-devices dependency bump required)
- Added "Enabled" option to the local device Settings tab: a disabled device stays configured, but does not connect (tuya-devices dependency bump required)
- Added "Pause when offline (min)" option to the local device Advanced tab: a device offline longer than this stops its connection attempts to avoid load and resumes on its next network announcement; 0 (default) never pauses, so existing devices behave as before (tuya-devices dependency bump required)
- Fixed network watchdog ("Reinit on lost connection") failing on its first check, `ping` was never required (tuya-devices dependency bump required)
- Fixed device models never being released when their last device was removed (tuya-devices dependency bump required)
- Fixed category overloads (e.g. value ranges) never being applied to device models (tuya-devices dependency bump required)
- Bumped tuya-devices to 1.3.8

# v1.5.8
- Bumped tuya-devices to 1.3.7 (decodes 'raw' typed data points by default instead of publishing them as base64 over MQTT, fixes #45)
- Added "Publish raw values as base64" option (rawAsCoded) to the local device Advanced tab to opt back into the previous behaviour

# v1.5.7
- Fixed crash on startup for device nodes with per-DP outputs when the device was already connected
- Fixed MQTT broker node (undefined mqttOptions on TLS, credentials never forwarded to the broker)
- Fixed device GET command being silently ignored when sent without a payload
- Fixed manager node not forwarding the userId status to the frontend
- Fixed device node config screen always resetting the selected Data point back to "all" on reopen
- Fixed crash (and resulting reboot loop) when a device received a command over MQTT (tuya-devices dependency bump required)
- Fixed crash (and resulting reboot loop) on deploy when a local device config node was left with an empty deviceId, e.g. from an imported example flow (tuya-devices dependency bump required)

# v1.5.6
- Added support for devices using Tuya v3.5, wich not send announcements
- Make possible to translate schemas (bussiness API)

# v1.5.5
- #41 Added device connection watchdog (thanks to tuzovvlad)

# v1.5.4
- #32 Fixed error in device (TypeError: Assignment to constant variable)
- #33 Fixed error in cipher (md5hash.subarray is not a function)
- #33 Fixed error in device (ReferenceError: val is nor defined)

# v1.5.3
- Persist local cache on update node version
- Improve config GUI table look
- Added support for external (using internet access) translator

# v1.5.2
- Fixed error in output selection
- Make multi outputs mode as default for new devices

# v1.5.1
- Make possible to select device node outputs
- Fixed error (in v1.5.0) on recogniye device properties

# v1.5.0
- Fixed error on create slave devices (gateway clients)
- Fixed device GUI for business data model
- provide support for Tuya 3.5 devices (Beta)
- Added scanner devices tab to manager GUI

# v1.4.6
- Fixed bug in the GUI on configure the device settings. After switch netType was not possible to show the old type settings again

# v1.4.5
- Fixed bug in the GUI on configure the cloud settings. After switch to business app was not possible to show the smart app settings again

# v1.4.4
- Add possibility do disable ARP
- Update overloads schema to support BADM (business app data model)
- Command getDataModel returns properties instead services, to support also BADM
- Fixed error in cache if schema not found

# v1.4.3
- Fixed error on get properties in device GUI (due to typo)
- Improve tuya_local_device GUI. Added netType to tuya_local_device settings

# v1.4.2
- Fixed error on add device using smart application data model

# v1.4.1
- Fixed error on update cloud data
- Integrate business application data model as addition to an smart application data

# v1.4.0
- Added support for business cloud applications

# v1.3.7
- Added possibility to backup cache local to be used after version update
- Added resolution for some cloud connection error codes
- Avoid deadlock after initialization of the cloud connection fails
- Skip device scanner if static IP configured for device

# v1.3.6
- Added possibility to reinit device on lost connection
- Improved debug logging configuration
- Improved cloud restore
- Try load icons in cache from local db
- Fixed problem on deinit project
- Convert tuya error messages to readable string

# v1.3.5
- Fixed critical error in local cache handling
- Added step by step example

# v1.3.4
- Improved manager GUI, added some buttons (e.g. clear and save local cache)
- Added link to access device Web interface if supported
- Added support for device context for some device categiries

# v1.3.3
- Add extra support for security cams (category 'sp'), e.g. PTZ
- Added support for device context in cache
- Improve cache functionality
- Make more robust the usage of ARP functionality (due to problems on some platforms)

# v1.3.2
- No functional changes

# v1.3.1
- Fixed critical error on load device model
- Added clearCache command (msg: {"topic":"clearCache"}). Optional message parameters: "complete" and "backup", both of type boolean
- Make Cache syncronisation more robust in case of connection problems
- Added possibility to sort translations (e.g. after manual edit)
- Added link to cache explorer in the project GUI

# v1.3.x
- Add possibility to restart Node-Red (service or application) running on Debian system (e.g. RaspberryPI) over the GUI by send message with topic "restartNodeRed" to a Tuya Manager node. For development purposes Node-Red can be startet by the script (~/.node-red/start-nodered.sh) to make possible to restart it.
- Added support of MQTT for Tuya devices (Beta status). The activation and configuration can be make in a Tuya project node. All devices in the project uses the same MQTT broker. 

# v1.2.x
- Refactoring to use 'tuya-devices' library
- Added support for MAC address and Tuya version to the local device
- Added tuya explorer (Beta, e.g. http://localhost:1880/resources/node-red-contrib-tuya-devices/index.html if no project configured or
  http://{ip-or-host}:1880/resources/node-red-contrib-tuya-devices/{project-name}.html)
- Improve device scanner
- Local devices can be used by IP or MAC address
- added dynamic generation of device commands based on model definitions
- Added extension for device category "mal". Especially for treatment of sub-devices

# v1.1.x
- Make possible to use local devices connected by gateway
- Refactoring local chache
- List cloud devices and models in the manager node configuration and create config nodes using '+' button
- Model elements can be manualy translated by editing of the file "translations.json" in .node-red\projects\node-red-contrib-tuya-devices\resources\{projectname}\

# v1.0.x
- Initial implementation
- Supports WLAN Tuya devices

# TODO
- filter models by selected room in manager view
- hide space column in manager view devices tab if room selected
- add room selection control in the manager view devices tab
- link the device settings view to the device row in manager view
- make possible to disable device in the admin page
- flow examples
- Make possible to translate cloud tokens (service descriptions) to english. Existing cache can be translated using manager command with topic 'translateDeviceModels'. 
