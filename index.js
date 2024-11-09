'use strict';

let Service, Characteristic;

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory('homebridge-udp-light', 'UDPLight', UDPLight);
};

class UDPLight {
  constructor(log, config) {
    this.log = log;
    this.name = config.name;
    this.ip = config.ip;
    this.port = config.port;

    this.udpClient = require('dgram').createSocket('udp4');

    this.lightService = new Service.Lightbulb(this.name);
    this.lightService
      .getCharacteristic(Characteristic.On)
      .on('set', this.setPowerState.bind(this))
      .on('get', this.getPowerState.bind(this));

    this.lightService
      .addCharacteristic(Characteristic.Brightness)
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 1
      })
      .on('set', this.setBrightness.bind(this))
      .on('get', this.getBrightness.bind(this));

    this.lightService
      .addCharacteristic(Characteristic.ColorTemperature)
      .setProps({
        minValue: 140,  // Coldest temperature (in Mired)
        maxValue: 500,  // Warmest temperature (in Mired)
        minStep: 1
      })
      .on('set', this.setColorTemperature.bind(this))
      .on('get', this.getColorTemperature.bind(this));
  }

  getServices() {
    return [this.lightService];
  }

  setPowerState(state, callback) {
    const command = state ? '1' : '0';
    this.sendCommandWithStatus(command, (err, brightness) => {
      callback(err, brightness > 0);
    });
  }

  getPowerState(callback) {
    this.sendStatus((err, brightness, colorTemp) => {
      callback(err, brightness > 0);
    });
  }

  setBrightness(brightness, callback) {
    // Map 0-100 to 0-1023
    const scaledBrightness = Math.round(brightness * 1023 / 100);
    this.sendCommandWithStatus(`l,${scaledBrightness}`, (err, brightness) => {
      if (err) {
        callback(err);
        return;
      }
      callback(null, Math.round(brightness * 100 / 1023));
    });
  }

  getBrightness(callback) {
    this.sendStatus((err, brightness, colorTemp) => {
      if (err) {
        callback(err);
        return;
      }
      callback(null, Math.round(brightness * 100 / 1023));
    });
  }

  setColorTemperature(miredValue, callback) {
    // Convert Mired (140-500) to device value (1023-0)
    // Note: Mired and device scales are inverted - higher Mired = warmer, lower device value = warmer
    const deviceValue = Math.round(1023 - ((miredValue - 140) * 1023 / (500 - 140)));
    this.sendCommandWithStatus(`t,${deviceValue}`, (err, brightness, colorTemp) => {
      if (err) {
        callback(err);
        return;
      }
      // Convert device value back to Mired for confirmation
      const miredResult = Math.round(140 + ((1023 - colorTemp) * (500 - 140) / 1023));
      callback(null, miredResult);
    });
  }

  getColorTemperature(callback) {
    this.sendStatus((err, brightness, colorTemp) => {
      if (err) {
        callback(err);
        return;
      }
      const miredValue = Math.round(140 + ((1023 - colorTemp) * (500 - 140) / 1023));
      callback(null, miredValue);
    });
  }

  sendCommandWithStatus(command, callback) {
    this.udpClient.send(command, this.port, this.ip, (err) => {
      if (err) {
        this.log(`Error sending command "${command}": ${err.message}`);
        callback(err);
        return;
      }
      
      this.log(`Sent command "${command}"`);
      
      // Wait briefly before requesting status to ensure command was processed
      setTimeout(() => {
        this.sendStatus(callback);
      }, 50);
    });
  }

  sendStatus(callback) {
    this.udpClient.send('s', this.port, this.ip, (err) => {
      if (err) {
        this.log(`Error getting status: ${err.message}`);
        callback(err);
        return;
      }
      
      this.log(`Sent status request`);
      
      // Set up timeout to handle case where no response is received
      const timeout = setTimeout(() => {
        this.udpClient.removeListener('message', messageHandler);
        callback(new Error('Status request timed out'));
      }, 1000);
      
      const messageHandler = (msg) => {
        clearTimeout(timeout);
        try {
          const [brightness, colorTemp] = msg.toString().split(',').map(Number);
          if (isNaN(brightness) || isNaN(colorTemp)) {
            callback(new Error('Invalid status response format'));
            return;
          }
          callback(null, brightness, colorTemp);
        } catch (error) {
          callback(new Error('Failed to parse status response'));
        }
      };
      
      this.udpClient.once('message', messageHandler);
    });
  }
}