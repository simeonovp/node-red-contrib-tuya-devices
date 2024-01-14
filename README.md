# node-red-contrib-tuya-devices
Support for Tuya devices in SmartHome projects using [Node-RED](https://nodered.org/).  
The goal of the project is to allow using local devices supports Tuya in Node-Red

## Getting Started

Prerequisites: [Node-RED](https://nodered.org) installation. For details see [here](https://nodered.org/docs/getting-started/installation).

## Install
- Option 1 use NodeRed: keys: ctrl + shift + P / Installation / type: node-red-contrib-tuya-devices and click "install"
- Option 2 use NPM: got to NodeRed install folder (e.g. ~/.node-red) and install package

```shell
$ cd ~/.node-red
$ npm install node-red-contrib-tuya-devices
```
then restart node-red

The Tuya devices are represented by config Nodes (single Node per device). The flow Nodes references a device node and can exists multiple times in different flows. It can be defined a project object to group and control all Tuya devices in the local network. The IP addresses of the devices will be detect automaticaly. If configured a cloud access the device capabilities will be downloded and cached localy.

## First steps
- create a new Manager node (e.g. drag end drop)
- open manager properties form (double click on the node)
- go to parameter Project and click on the pen to create an new project
- set property Name for your project(e.g. House)
- go to parameter Project and click on the pen to create an new cloud connection
  (! The cloud connection is ONLY used to get the capabilities of new devices.
  The setting will be cached localy and used from local cache.)
- set property Name for your cloud account (e.g. Cloud)
- fill the required properties: AccessId, AccessKey, Region, Any deviceId (used to automaticaly recognize the user)
- accept the cloud settings (Add/Modify button) to close the mask go back to project settings
- accept the project settings (Add/Modify button) to close the mask go back to manager settings

If the cloud configuration is correct and the manager node has received at least once a message with topic 'updateDevices' all mapped devices will be listed in the config. The device capabilities will be cached localy. With the plus button can be added a config node for every local device. This config nodes contains all setting nedded to use the device localy and can be selected in the configuration of the Tuya device nodes. 

## TODO
- flow examples
- write change log
  

## Disclaimer
The software is provided as-is under the MIT license. The author cannot be held responsible for any unintended behaviours.

## Thanks
If you like our ideas and want to support further development, you can donate here:  
[![Donate](https://img.shields.io/badge/donate-PayPal-blue.svg)](https://paypal.me/tasmotas)
[![Donate](https://img.shields.io/badge/donate-buy%20me%20a%20coffee-yellow.svg)](https://www.buymeacoffee.com/smarthomenodes)
