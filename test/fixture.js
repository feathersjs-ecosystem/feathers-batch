const feathers = require('@feathersjs/feathers');
const express = require('@feathersjs/express');
const socketio = require('@feathersjs/socketio');
const { NotAcceptable } = require('@feathersjs/errors');
const memory = require('feathers-memory');

const { BatchService } = require('../lib');

const app = express(feathers());

app.configure(socketio());
app.configure(express.rest());
app.use(express.json());
app.use('/dummy', {
  async get (id) {
    if (id === 'feathers-error') {
      throw new NotAcceptable('No!');
    }

    if (id === 'error') {
      throw Error('This did not work');
    }

    return { id };
  }
});
app.use('/people', memory());

app.use('/batch', new BatchService(app));

exports.app = app;
