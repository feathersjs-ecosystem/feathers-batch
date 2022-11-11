const assert = require('assert');
const { app } = require('./fixture');

describe('feathers-batch', () => {
  it('initialized the service', () => {
    assert.ok(app.service('batch'));
  });

  it('makes a batch call', async () => {
    const results = await app.service('batch').create({
      calls: [
        ['get', 'dummy', 'testing'],
        ['get', 'dummy', 'testing 2'],
        ['get', 'dummy', 'testing 3']
      ]
    });

    assert.deepStrictEqual(results, [
      { status: 'fulfilled', value: { id: 'testing' } },
      { status: 'fulfilled', value: { id: 'testing 2' } },
      { status: 'fulfilled', value: { id: 'testing 3' } }
    ]);
  });

  it('works with no batch calls', async () => {
    const results = await app.service('batch').create({
      dummy: true
    });

    assert.deepStrictEqual(results, []);
  });

  it('works with promises', async () => {
    const results = await app.service('batch').create({
      calls: [
        app.service('people').find(),
        app.service('people').find(),
      ]
    });

    assert.deepStrictEqual(results, [
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [] }
    ]);
  });

  it('works with service.all', async () => {
    const results = await app.service('batch').all([
      app.service('people').find(),
      app.service('people').find(),
    ]);

    assert.deepStrictEqual(results, [[], []]);
  });

  it('works with service.allSettled', async () => {
    const results = await app.service('batch').allSettled([
      app.service('people').find(),
      app.service('people').find(),
    ]);

    assert.deepStrictEqual(results, [
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [] }
    ]);
  });

  it('makes batch calls with errors', async () => {
    const results = await app.service('batch').create({
      calls: [
        ['get', 'dummy', 'error'],
        ['get', 'dummy', 'testing 2'],
        ['get', 'dummy', 'feathers-error'],
        ['get', 'foobar', 1],
        ['blabla', 'dummy', 1]
      ]
    });

    assert.deepStrictEqual(results, [
      { status: 'rejected', reason: { message: 'This did not work' } },
      { status: 'fulfilled', value: { id: 'testing 2' } },
      {
        status: 'rejected',
        reason: {
          name: 'NotAcceptable',
          message: 'No!',
          code: 406,
          className: 'not-acceptable',
          data: undefined,
          errors: {}
        }
      }, {
        status: 'rejected',
        reason: {
          name: 'NotFound',
          message: 'Invalid service foobar',
          code: 404,
          className: 'not-found',
          data: undefined,
          errors: {}
        }
      }, {
        status: 'rejected',
        reason: {
          name: 'BadRequest',
          message: 'Invalid method blabla on dummy',
          code: 400,
          className: 'bad-request',
          data: undefined,
          errors: {}
        }
      }
    ]);
  });
});
