const assert = require('assert');
const axios = require('axios');
const feathers = require('@feathersjs/feathers');
const restClient = require('@feathersjs/rest-client');
const memory = require('feathers-memory');

const { app } = require('./fixture');
const {
  batchClient,
  batchHook,
  batchMethods,
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

const testExcludeHook = (title, batchExclude, memoryConfig) => {
  it(title, async () => {
    const batchPromise = batchResultPromise();
    const client = feathers();
    client.configure(restClient('http://localhost:7865').axios(axios));
    client.use('/local', memory(memoryConfig));
    const hook = batchHook({
      batchService: 'batch',
      batchExclude: batchExclude
    });
    const hooks = {
      before: {
        all: [hook]
      }
    };
    client.service('dummy').hooks(hooks);

    const results = await Promise.all([
      client.service('dummy').get('1'),
      client.service('local').find()
    ]);

    assert.deepStrictEqual(results, [
      { id: '1' },
      []
    ]);

    assert.deepStrictEqual(await batchPromise, [
      { status: 'fulfilled', value: { id: '1' } }
    ]);
  });
};

const testExcludePlugin = (label, batchExclude, memoryConfig) => {
  it(label, async () => {
    const batchPromise = batchResultPromise();
    const client = feathers();
    client.configure(restClient('http://localhost:7865').axios(axios));
    client.use('/local', memory(memoryConfig));
    client.configure(batchClient({
      batchService: 'batch',
      batchExclude
    }));

    const results = await Promise.all([
      client.service('dummy').get('1'),
      client.service('local').find()
    ]);

    assert.deepStrictEqual(results, [
      { id: '1' },
      []
    ]);

    assert.deepStrictEqual(await batchPromise, [
      { status: 'fulfilled', value: { id: '1' } }
    ]);
  });
};

const commonTests = (app, client) => {
  return {
    'collect batches of multiple calls': async () => {
      const batchPromise = batchResultPromise();
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
    },
    'does resolve and reject from a batch': async () => {
      const results = await Promise.allSettled([
        client.service('dummy').get('testing'),
        client.service('dummy').get('error')
      ]);

      assert.deepStrictEqual(results[0].value, { id: 'testing' });
      assert.strictEqual(results[1].reason.message, 'This did not work');
    },
    'skips batching with params.batchExclude': async () => {
      const batchPromise = batchResultPromise();
      const results = await Promise.all([
        client.service('dummy').get('1', { batchExclude: true }),
        client.service('dummy').get('1', { batchExclude: ['dummy'] }),
        client.service('dummy').get('1', { batchExclude: () => true }),
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
    },
    'dedupes batch arguments': async () => {
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
    },
    'works with params.batchManager': async () => {
      const batchPromise = batchResultPromise();
      const batchManager = new BatchManager(client, { batchService: 'batch' });
      let called = false;
      const oldFlush = batchManager.flush;
      batchManager.flush = function flush () {
        called = true;
        oldFlush.call(this);
      };

      const results = await Promise.all([
        client.service('dummy').get('1', { batchManager }),
        client.service('dummy').get('2', { batchManager })
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
    }
  };
};

before(async () => {
  await new Promise(resolve => {
    app.listen(7865).once('listening', () => resolve());
  });
});

describe('feathers-batch methods', async () => {
  const client = feathers();
  client.configure(restClient('http://localhost:7865').axios(axios));
  client.configure(batchMethods({
    batchService: 'batch'
  }));

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

  it('works with service.all', async () => {
    const batchPromise = batchResultPromise();
    const results = await client.service('batch').all((service) => {
      return [
        service('dummy').get('1'),
        service('dummy').find(),
        service('dummy').create({}),
        service('dummy').patch('1', {}),
        service('dummy').update('1', {}),
        service('dummy').remove('1')
      ];
    });

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

  it('works with service.allSettled', async () => {
    const batchPromise = batchResultPromise();
    const results = await client.service('batch').allSettled((service) => {
      return [
        service('dummy').get('1'),
        service('dummy').find(),
        service('dummy').create({}),
        service('dummy').patch('1', {}),
        service('dummy').update('1', {}),
        service('dummy').remove('1')
      ];
    });

    assert.deepStrictEqual(results, [
      { status: 'fulfilled', value: { id: '1' } },
      { status: 'fulfilled', value: { method: 'find' } },
      { status: 'fulfilled', value: { method: 'create' } },
      { status: 'fulfilled', value: { method: 'patch' } },
      { status: 'fulfilled', value: { method: 'update' } },
      { status: 'fulfilled', value: { method: 'remove' } }
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

  const excludeFn = (context) => context.path === 'local';
  testExcludePlugin(
    'works with service.options.batchExclude array',
    null,
    ['local']
  );
  testExcludePlugin(
    'works with service.option.batchExclude array',
    null,
    excludeFn
  );
  testExcludePlugin('works with array batchExclude', ['local']);
  testExcludePlugin('works with array batchExclude', excludeFn);

  Object.entries(commonTests(app, client)).forEach(([label, callback]) => {
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

  const excludeFn = (context) => context.path === 'local';
  testExcludeHook(
    'works with service.options.batchExclude array',
    null,
    ['local']
  );
  testExcludeHook(
    'works with service.option.batchExclude array',
    null,
    excludeFn
  );
  testExcludeHook('works with array batchExclude', ['local']);
  testExcludeHook('works with array batchExclude', excludeFn);

  Object.entries(commonTests(app, client)).forEach(([label, callback]) => {
    it(label, callback);
  });
});
