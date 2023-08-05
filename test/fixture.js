const { feathers } = require('@feathersjs/feathers');
const express = require('@feathersjs/express');
const socketio = require('@feathersjs/socketio');
const { NotAcceptable } = require('@feathersjs/errors');

const { batchServer } = require('../server');

const app = express(feathers());

app.use(express.json());
app.configure(socketio());
app.configure(express.rest());

app.use('/dummy', {
  async get (id) {
    if (id === 'feathers-error') {
      throw new NotAcceptable('No!');
    }

    if (id === 'error') {
      throw Error('This did not work');
    }

    return { id };
  },
  async find (params) {
    return { method: 'find' };
  },
  async create (data, params) {
    return { method: 'create' };
  },
  async update (id, data, params) {
    return { method: 'update' };
  },
  async patch (id, data, params) {
    return { method: 'patch' };
  },
  async remove (id, params) {
    return { method: 'remove' };
  }
});

app.configure(batchServer({
  batchService: '/batch'
}));

exports.app = app;
