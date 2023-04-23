const assert = require('assert');
const axios = require('axios');
const feathers = require('@feathersjs/feathers');
const restClient = require('@feathersjs/rest-client');
const memory = require('feathers-memory');

const { app } = require('./fixture');
const {
  batchClient,
  batchHook,
  BatchManager
} = require('../client');

const batchResultPromise = () => new Promise(resolve => {
  app.service('batch').hooks({
    after: {
      create: context => {
        resolve(context.result);
        return context;
      }
    }
  });
});

const makeClient = (batchConfig) => {
  const client = feathers();
  client.configure(restClient('http://localhost:7865').axios(axios));
  client.use('/local', memory());
  client.configure(batchClient({
    batchService: 'batch',
    ...batchConfig
  }));
  return client;
};

before(async () => {
  await new Promise(resolve => {
    app.listen(7865).once('listening', () => resolve());
  });
});

// describe('feathers-batch methods', async () => {
//   const client = feathers();
//   client.configure(restClient('http://localhost:7865').axios(axios));
//   client.configure(batchMethods({
//     batchService: 'batch'
//   }));

//   it('does a batch call', async () => {
//     const result = await client.service('batch').create({
//       calls: [
//         ['get', 'dummy', 'testing']
//       ]
//     });

//     assert.deepStrictEqual(result, [
//       { status: 'fulfilled', value: { id: 'testing' } }
//     ]);
//   });

//   it('works with service.all', async () => {
//     const batchPromise = batchResultPromise();
//     const results = await client.service('batch').all((service) => {
//       return [
//         service('dummy').get('1'),
//         service('dummy').find(),
//         service('dummy').create({}),
//         service('dummy').patch('1', {}),
//         service('dummy').update('1', {}),
//         service('dummy').remove('1')
//       ];
//     });

//     assert.deepStrictEqual(results, [
//       { id: '1' },
//       { method: 'find' },
//       { method: 'create' },
//       { method: 'patch' },
//       { method: 'update' },
//       { method: 'remove' }
//     ]);

//     assert.deepStrictEqual(await batchPromise, [
//       { status: 'fulfilled', value: { id: '1' } },
//       { status: 'fulfilled', value: { method: 'find' } },
//       { status: 'fulfilled', value: { method: 'create' } },
//       { status: 'fulfilled', value: { method: 'patch' } },
//       { status: 'fulfilled', value: { method: 'update' } },
//       { status: 'fulfilled', value: { method: 'remove' } }
//     ]);
//   });

//   it('works with service.allSettled', async () => {
//     const batchPromise = batchResultPromise();
//     const results = await client.service('batch').allSettled((service) => {
//       return [
//         service('dummy').get('1'),
//         service('dummy').find(),
//         service('dummy').create({}),
//         service('dummy').patch('1', {}),
//         service('dummy').update('1', {}),
//         service('dummy').remove('1')
//       ];
//     });

//     assert.deepStrictEqual(results, [
//       { status: 'fulfilled', value: { id: '1' } },
//       { status: 'fulfilled', value: { method: 'find' } },
//       { status: 'fulfilled', value: { method: 'create' } },
//       { status: 'fulfilled', value: { method: 'patch' } },
//       { status: 'fulfilled', value: { method: 'update' } },
//       { status: 'fulfilled', value: { method: 'remove' } }
//     ]);

//     assert.deepStrictEqual(await batchPromise, [
//       { status: 'fulfilled', value: { id: '1' } },
//       { status: 'fulfilled', value: { method: 'find' } },
//       { status: 'fulfilled', value: { method: 'create' } },
//       { status: 'fulfilled', value: { method: 'patch' } },
//       { status: 'fulfilled', value: { method: 'update' } },
//       { status: 'fulfilled', value: { method: 'remove' } }
//     ]);
//   });
// });

describe('feathers-batch plugin', async () => {
  const client = makeClient();

  it('errors with wrong options', () => {
    assert.throws(() => feathers().configure(batchClient({})), {
      message: '`batchService` name option must be passed to batchClient'
    });
  });

  it('works with array exclude', async () => {
    const batchPromise = batchResultPromise();
    const configClient = makeClient({
      exclude: ['local']
    });

    const results = await Promise.all([
      configClient.service('dummy').get('1'),
      configClient.service('local').find()
    ]);

    assert.deepStrictEqual(results, [
      { id: '1' },
      []
    ]);

    assert.deepStrictEqual(await batchPromise, [
      { status: 'fulfilled', value: { id: '1' } }
    ]);
  });

  it('works with function exclude', async () => {
    const batchPromise = batchResultPromise();
    const configClient = makeClient({
      exclude: (context) => context.path === 'local'
    });

    const results = await Promise.all([
      configClient.service('dummy').get('1'),
      configClient.service('local').find()
    ]);

    assert.deepStrictEqual(results, [
      { id: '1' },
      []
    ]);

    assert.deepStrictEqual(await batchPromise, [
      { status: 'fulfilled', value: { id: '1' } }
    ]);
  });

  it('works with disabled dedupe', async () => {
    const batchPromise = batchResultPromise();
    const configClient = makeClient({
      dedupe: false
    });

    const results = await Promise.all([
      configClient.service('dummy').get('1'),
      configClient.service('dummy').get('1')
    ]);

    assert.deepStrictEqual(results, [
      { id: '1' },
      { id: '1' }
    ]);

    assert.deepStrictEqual(await batchPromise, [
      { status: 'fulfilled', value: { id: '1' } },
      { status: 'fulfilled', value: { id: '1' } }
    ]);
  });

  it('collect batches of multiple calls', async () => {
    const batchPromise = batchResultPromise();
    const results = await Promise.all([
      client.service('dummy').get('1'),
      client.service('dummy').get('2'),
      client.service('dummy').get('3')
    ]);

    assert.deepStrictEqual(results, [
      { id: '1' },
      { id: '2' },
      { id: '3' }
    ]);

    assert.deepStrictEqual(await batchPromise, [
      { status: 'fulfilled', value: { id: '1' } },
      { status: 'fulfilled', value: { id: '2' } },
      { status: 'fulfilled', value: { id: '3' } }
    ]);
  });

  it('collects single batch with error', async () => {
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
  });

  it('works with all service methods', async () => {
    const batchPromise = batchResultPromise();
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
  });

  it('does resolve and reject from a batch', async () => {
    const results = await Promise.allSettled([
      client.service('dummy').get('testing'),
      client.service('dummy').get('error')
    ]);

    assert.deepStrictEqual(results[0].value, { id: 'testing' });
    assert.strictEqual(results[1].reason.message, 'This did not work');
  });

  it('skips batching with params.batch.exclude', async () => {
    const batchPromise = batchResultPromise();
    const results = await Promise.all([
      client.service('dummy').get('1', { batch: { exclude: true } }),
      client.service('dummy').get('1', { batch: { exclude: ['dummy'] } }),
      client.service('dummy').get('1', { batch: { exclude: () => true } }),
      client.service('dummy').get('2')
    ]);

    assert.deepStrictEqual(results, [
      { id: '1' },
      { id: '1' },
      { id: '1' },
      { id: '2' }
    ]);

    assert.deepStrictEqual(await batchPromise, [
      { status: 'fulfilled', value: { id: '2' } }
    ]);
  });

  it('dedupes batch arguments', async () => {
    const batchPromise = batchResultPromise();
    const results = await Promise.all([
      client.service('dummy').get('1'),
      client.service('dummy').get('1')
    ]);

    assert.deepStrictEqual(results, [
      { id: '1' },
      { id: '1' }
    ]);

    assert.deepStrictEqual(await batchPromise, [
      { status: 'fulfilled', value: { id: '1' } }
    ]);
  });

  it('skips dedupe with params.batch.dedupe', async () => {
    const batchPromise = batchResultPromise();
    const results = await Promise.all([
      client.service('dummy').get('1'),
      client.service('dummy').get('1', { batch: { dedupe: false } }),
      client.service('dummy').get('1', { batch: { dedupe: () => false } })
    ]);

    assert.deepStrictEqual(results, [
      { id: '1' },
      { id: '1' },
      { id: '1' }
    ]);

    assert.deepStrictEqual(await batchPromise, [
      { status: 'fulfilled', value: { id: '1' } },
      { status: 'fulfilled', value: { id: '1' } },
      { status: 'fulfilled', value: { id: '1' } }
    ]);
  });

  it('works with params.batch.manager', async () => {
    const batchPromise = batchResultPromise();
    const manager = new BatchManager(client, { batchService: 'batch' });
    let called = false;
    const oldFlush = manager.flush;
    manager.flush = function flush () {
      called = true;
      oldFlush.call(this);
    };

    const results = await Promise.all([
      client.service('dummy').get('1', { batch: { manager } }),
      client.service('dummy').get('2', { batch: { manager } })
    ]);

    assert.deepStrictEqual(results, [
      { id: '1' },
      { id: '2' }
    ]);

    assert.deepStrictEqual(called, true);

    assert.deepStrictEqual(await batchPromise, [
      { status: 'fulfilled', value: { id: '1' } },
      { status: 'fulfilled', value: { id: '2' } }
    ]);
  });

  it('works with client hooks', async () => {
    const batchPromise = batchResultPromise();

    let beforeCalled = false;
    const afterCalled = false;

    const beforeHook = (context) => {
      beforeCalled = true;
    };

    const afterHook = (context) => {
      beforeCalled = true;
    };

    client.service('dummy').hooks({
      before: {
        all: [beforeHook]
      },
      after: {
        all: [afterHook]
      }
    });

    const results = await Promise.all([
      client.service('dummy').get('1')
    ]);

    assert.deepStrictEqual(beforeCalled, true);
    assert.deepStrictEqual(afterCalled, true);

    assert.deepStrictEqual(results, [
      { id: '1' }
    ]);

    assert.deepStrictEqual(await batchPromise, [
      { status: 'fulfilled', value: { id: '1' } }
    ]);
  });

  it('configs manager via a batchHook', async () => {
    const hookClient = makeClient();
    const batchPromise = batchResultPromise();
    const hook = batchHook({
      batchService: 'batch',
      exclude: () => context.id === '2'
    });

    hookClient.service('dummy').hooks({
      before: {
        all: [hook]
      }
    });

    const results = await Promise.all([
      hookClient.service('dummy').get('1'),
      hookClient.service('dummy').get('2')
    ]);

    assert.deepStrictEqual(results, [
      { id: '1' },
      { id: '2' }
    ]);

    assert.deepStrictEqual(await batchPromise, [
      { status: 'fulfilled', value: { id: '1' } }
    ]);
  });
});
