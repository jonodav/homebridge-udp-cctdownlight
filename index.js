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
      .on('set', this.setBrightness.bind(this))
      .on('get', this.getBrightness.bind(this));

    this.lightService
      .addCharacteristic(Characteristic.ColorTemperature)
      .on('set', this.setColorTemperature.bind(this))
      .on('get', this.getColorTemperature.bind(this));
  }

  getServices() {
    return [this.lightService];
  }

  setPowerState(state, callback) {
    this.sendCommand(state ? '1' : '0', callback);
  }

  getPowerState(callback) {
    this.sendStatus((err, brightness, colorTemp) => {
      callback(err, brightness > 0);
    });
  }

  setBrightness(brightness, callback) {
    this.sendCommand(`l,${Math.round(brightness * 1023 / 100)}`, callback);
  }

  getBrightness(callback) {
    this.sendStatus((err, brightness, colorTemp) => {
      callback(err, Math.round(brightness * 100 / 1023));
    });
  }

  setColorTemperature(colorTemp, callback) {
    this.sendCommand(`t,${Math.round(colorTemp * 1023 / 100)}`, callback);
  }

  getColorTemperature(callback) {
    this.sendStatus((err, brightness, colorTemp) => {
      callback(err, Math.round(colorTemp * 100 / 1023));
    });
  }

  sendCommand(command, callback) {
    this.udpClient.send(command, this.port, this.ip, (err) => {
      if (err) {
        this.log(`Error sending command "${command}": ${err.message}`);
        callback(err);
      } else {
        this.log(`Sent command "${command}"`);
        this.sendStatus(callback);
      }
    });
  }

  sendStatus(callback) {
    this.udpClient.send('s', this.port, this.ip, (err, bytes) => {
      if (err) {
        this.log(`Error getting status: ${err.message}`);
        callback(err);
      } else {
        this.log(`Received status response`);
        this.udpClient.on('message', (msg) => {
          const [brightness, colorTemp] = msg.toString().split(',').map(Number);
          callback(null, brightness, colorTemp);
        });
      }
    });
  }
}