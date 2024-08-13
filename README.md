# node-red-contrib-tuya-devices
Support for Tuya devices in SmartHome projects using [Node-RED](https://nodered.org/).  
The goal of the project is to allow using local devices supports Tuya in Node-Red

## Getting Started

Prerequisites: [Node-RED](https://nodered.org) installation. For details see [here](https://nodered.org/docs/getting-started/installation).

Install via npm

```shell
$ cd ~/.node-red
$ npm install node-red-contrib-tuya-devices
```
then restart node-red

The Tuya devices are represented by config Nodes (single Node per device). The flow Nodes references a device node and can exists multiple times in different flows. It can be defined a project object to group and control all Tuya devices in the local network. The IP addresses of the devices will be detect automaticaly. If configured a cloud access the device capabilities will be downloded and cached localy.

## First steps
Insert Tuya manager node. 
In the manager config form:  
- Add new tuya-project. 
  In the project config form:  
  - set the name for the project
  - Add new tuya-cloud. 
    In the cloud config form:  
    - set the AccessID, AccessKey and Any deviceId (needed to recognise the userId and all devices mapped to the same user account)
    - optional can be set the Tuya cloud userId if known and a name for the config node

If the cloud configuration is correct and the manager node has received at least once a message with topic 'updateDevices' all mapped devices will be listed in the config. The device capabilities will be cached localy. With the plus button can be added a config node for every local device. This config nodes contains all setting nedded to use the device localy and can be selected in the configuration of the Tuya device nodes. 

## Changelog
### v1.2.x
- Refactoring to use 'tuya-devices' library

### v1.1.x
- Make possible to use local devices connected by gateway
- Refactoring local chache
- List cloud devices and models in the manager node configuration and create config nodes using '+' button
- Model elements can be manualy translated by editing of the file "translations.json" in .node-red\projects\node-red-contrib-tuya-devices\resources\{projectname}\

### v1.0.x
- Initial implementation
- Supports WLAN Tuya devices

## TODO
- filter models by selected room in manager view
- hide space column in manager view devices tab if room selected
- add room selection control in the manager view devices tab
- link the device settings view to the device row in manager view
- make possible to disable device in the admin page
- flow examples
- Make possible to translate cloud tokens (service descriptions) to english. Existing cache can be translated using manager command with topic 'translateDeviceModels'. 
  

## Disclaimer
The software is provided as-is under the MIT license. The author cannot be held responsible for any unintended behaviours.

## Thanks
If you like our ideas and want to support further development, you can donate here:  
[![Donate](https://img.shields.io/badge/donate-PayPal-blue.svg)](https://paypal.me/tasmotas)
[![Donate](https://img.shields.io/badge/donate-buy%20me%20a%20coffee-yellow.svg)](https://www.buymeacoffee.com/smarthomenodes)

## Screenshots
![manager_flow](./img/manager_flow.jpg) 
![cloud](./img/cloud.jpg) 
![project](./img/project.jpg) 
![manager_devices](./img/manager_devices.jpg) 
![manager_models](./img/manager_models.jpg) 
