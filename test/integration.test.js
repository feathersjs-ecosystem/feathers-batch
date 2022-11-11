const assert = require('assert');

const axios = require('axios');
const feathers = require('@feathersjs/feathers');
const restClient = require('@feathersjs/rest-client');

const { app } = require('./fixture');
const { batchClient, batchHook } = require('../client');

const tests = (app, client) => {
  return {
    'collect batches of multiple calls': async () => {
      const batchPromise = new Promise(resolve => {
        app.service('batch').hooks({
          after: {
            create: context => {
              resolve(context.result);
              return context;
            }
          }
        });
      });

      const results = await Promise.all([
        client.service('dummy').get('test 1'),
        client.service('dummy').get('test 2'),
        client.service('dummy').get('test 3')
      ]);

      assert.deepStrictEqual(results, [
        { id: 'test 1' },
        { id: 'test 2' },
        { id: 'test 3' }
      ]);

      assert.deepStrictEqual(await batchPromise, [
        { status: 'fulfilled', value: { id: 'test 1' } },
        { status: 'fulfilled', value: { id: 'test 2' } },
        { status: 'fulfilled', value: { id: 'test 3' } }
      ]);
    },
    'collects single batch with error': async () => {
      try {
        await client.service('dummy').get('feathers-error');
        assert.fail('Should never get here');
      } catch (error) {
        assert.deepStrictEqual(error.toJSON(), {
          name: 'NotAcceptable',
          message: 'No!',
          code: 406,
          className: 'not-acceptable',
          data: undefined,
          errors: {}
        });
      }
    },
    'works with all service methods': async () => {
      const batchPromise = new Promise(resolve => {
        app.service('batch').hooks({
          after: {
            create: context => {
              resolve(context.result);
              return context;
            }
          }
        });
      });

      const results = await Promise.all([
        client.service('dummy').get('1'),
        client.service('dummy').find(),
        client.service('dummy').create({}),
        client.service('dummy').patch('1', {}),
        client.service('dummy').update('1', {}),
        client.service('dummy').remove('1')
      ]);

      assert.deepStrictEqual(results, [
        { id: '1' },
        { method: 'find' },
        { method: 'create' },
        { method: 'patch' },
        { method: 'update' },
        { method: 'remove' }
      ]);

      assert.deepStrictEqual(await batchPromise, [
        { status: 'fulfilled', value: { id: '1' } },
        { status: 'fulfilled', value: { method: 'find' } },
        { status: 'fulfilled', value: { method: 'create' } },
        { status: 'fulfilled', value: { method: 'patch' } },
        { status: 'fulfilled', value: { method: 'update' } },
        { status: 'fulfilled', value: { method: 'remove' } }
      ]);
    },
    'does resolve and reject from a batch': async () => {
      const results = await Promise.allSettled([
        client.service('dummy').get('testing'),
        client.service('dummy').get('error')
      ]);

      assert.deepStrictEqual(results[0].value, { id: 'testing' });
      assert.strictEqual(results[1].reason.message, 'This did not work');
    }
  };
};

before(async () => {
  await new Promise(resolve => {
    app.listen(7865).once('listening', () => resolve());
  });
});

describe('feathers-batch client', async () => {
  const client = feathers();
  client.configure(restClient('http://localhost:7865').axios(axios));

  it('does a batch call', async () => {
    const result = await client.service('batch').create({
      calls: [
        ['get', 'dummy', 'testing']
      ]
    });

    assert.deepStrictEqual(result, [
      { status: 'fulfilled', value: { id: 'testing' } }
    ]);
  });
});

describe('feathers-batch plugin', async () => {
  const client = feathers();

  client.configure(restClient('http://localhost:7865').axios(axios));
  client.configure(batchClient({
    batchService: 'batch'
  }));

  it('errors with wrong options', () => {
    assert.throws(() => feathers().configure(batchClient({})), {
      message: '`batchService` name option must be passed to batchClient'
    });
  });

  Object.entries(tests(app, client)).forEach(([label, callback]) => {
    it(label, callback);
  });
});

describe('feathers-batch hook', async () => {
  const client = feathers();

  client.configure(restClient('http://localhost:7865').axios(axios));
  const hook = batchHook({ batchService: 'batch' });
  const hooks = {
    before: {
      all: [hook]
    }
  };
  client.service('dummy').hooks(hooks);

  it('errors with wrong options', () => {
    assert.throws(() => batchHook({}), {
      message: '`batchService` name option must be passed to hook'
    });
  });

  Object.entries(tests(app, client)).forEach(([label, callback]) => {
    it(label, callback);
  });
});
