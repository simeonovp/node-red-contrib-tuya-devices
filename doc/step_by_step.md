# node-red-contrib-tuya-devices
Drag and drop Manager node
![Alt-Text](ss_01.jpeg)  
Doble click on the node
![Alt-Text](ss_02.jpeg)  
Click on the pen to add new project
![Alt-Text](ss_03.jpeg)  
Type some name (here is House) and go to tab Cloud
![Alt-Text](ss_04.jpeg)  
Click on the pen to add new Clud object
![Alt-Text](ss_05.jpeg)  
Fill the fields AccessId, AccessKey and Any deviceId and accept (click "Update" [en] / "Hinzufügen" [de])
Also accept the Manager settings  
Now we have:
![Alt-Text](ss_06.jpeg)  
Acept this dialog and delpoy to Node-Red (Red button in Node-Red bar)
![Alt-Text](ss_07.jpeg)  
The tables in my cache are still (almost) empty, except for two static files: manifest.json and overloads.json
![Alt-Text](ss_08.jpeg)  
Now open again manager GUI and click "Update home"
![Alt-Text](ss_09.jpeg)  
Manager Node has green state -> connected to Cloud.
In my cache are now two more tables filled: users.json and homes.json
![Alt-Text](ss_10.jpeg)  
Click on "Refresh devices" (only once) and wait. This can take 1-2 minutes. At the end the devices appear in the table
![Alt-Text](ss_11.jpeg)  
The tables devices.json and models.json contains data
![Alt-Text](ss_12.jpeg)  
Now I can edit the node name for some device (optional) ant then click on + button to add this device to my Node-Red project.
I select "SmartGateway_01". Now ist the button + hidden and the name isn't editable
![Alt-Text](ss_13.jpeg)  
Accept and deploy (! always deploy after add new devices before use this)
Drag and drop a new Device node and double click on this
![Alt-Text](ss_14.jpeg)  
Accept and deploy.
If the device is online and in the same IP network it must be state "Online" (geen), else the state is yellow as my device 
The data points (DPS) of the device are listed in the combo box
![Alt-Text](ss_15.jpeg)  
If you select "Multi outputs" 
![Alt-Text](ss_16.jpeg)  
and accept an output will be shown for every data point. The first one is for control messages. If you go with mouse over the output you will be seen a tooltip with DPS number and code
![Alt-Text](ss_17.jpeg)  
The code is used as topic for the input and output messages

