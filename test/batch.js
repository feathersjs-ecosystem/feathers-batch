import assert from 'assert';
import feathers from '@feathersjs/feathers';
import express from '@feathersjs/express';
import memory from 'feathers-memory';

import batcher from '../src/batch';

// Start a server for the 'app' and run the 'test' function.
const runWithServer = async function (app, test) {
  const server = app.listen(7667);
  const onListen = new Promise((resolve, reject) => {
    server.on('listening', resolve);
  });

  await onListen.then(async () => {
    try {
      await test();
    } finally {
      await new Promise((resolve, reject) => server.close(resolve));
    }
  });
};

describe('feathers-batch tests', () => {
  it('batching with no parameters comes back with empty object', async () => {
    const app = express(feathers());

    app.use('/batch', batcher());

    const data = await app.service('batch').create({call: []}, {});
    assert.deepEqual(data, {type: 'parallel', results: []});
  });

  it('simple batching in series with one service and one error', async () => {
    const app = express(feathers());

    app.use('/todos', memory());
    app.use('/batch', batcher());

    await runWithServer(
      app,
      async () => {
        const data = await app.service('batch').create({
          type: 'series',
          call: [
            ['todos::create', {'text': 'one todo', 'complete': false}],
            ['todos::create', {'text': 'another todo', 'complete': true}],
            ['todos::get', 10],
            ['todos::find', {}]
          ]
        });

        const notFound = data.data[2];
        assert.deepEqual(data, {
          type: 'series',
          data: [
            [null, {'text': 'one todo', 'complete': false, 'id': 0}],
            [null, {'text': 'another todo', 'complete': true, 'id': 1}],
            notFound,
            [
              null,
              [
                {'text': 'one todo', 'complete': false, 'id': 0},
                {'text': 'another todo', 'complete': true, 'id': 1}
              ]
            ]
          ]
        });
      }
    );
  });

  it('extends service params to batch calls and sets query', async () => {
    const app = express(feathers());

    app.use('/todos', {
      get (id, params) {
        return Promise.resolve({id, params});
      }
    });
    app.use('/batch', batcher());

    await runWithServer(
      app,
      async () => {
        const data = await app.service('batch').create(
          {
            call: [
              ['todos::get', 1, {test: 'param1'}],
              ['todos::get', 3, {test: 'param2'}]
            ]
          },
          {my: 'params'}
        );

        assert.deepEqual(data, {
          type: 'parallel',
          data: [
            [null, {id: 1, params: {my: 'params', query: {test: 'param1'}}}],
            [null, {id: 3, params: {my: 'params', query: {test: 'param2'}}}]
          ]
        });
      }
    );
  });
});
