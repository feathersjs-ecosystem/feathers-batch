const assert = require('assert');

const axios = require('axios');
const feathers = require('@feathersjs/feathers');
const restClient = require('@feathersjs/rest-client');

const { app } = require('./fixture');
const { batchClient } = require('../client');

describe('feathers-batch client', async () => {
  const client = feathers();

  client.configure(restClient('http://localhost:7865').axios(axios));
  client.configure(batchClient({
    batchService: 'batch',
  }));

  before(async () => {
    await new Promise(resolve => {
      app.listen(7865).once('listening', () => resolve());
    });
  });

  it('errors with wrong options', () => {
    assert.throws(() => feathers().configure(batchClient({})), {
      message: '`batchService` name option must be passed to batchClient'
    });
  });

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

  // it('collect batches of multiple calls', async () => {
  //   const batchPromise = new Promise(resolve => {
  //     app.service('batch').hooks({
  //       after: {
  //         create: context => {
  //           resolve(context.result);
  //           return context;
  //         }
  //       }
  //     });
  //   });

  //   const results = await Promise.all([
  //     client.service('dummy').get('test 1'),
  //     client.service('dummy').get('test 2'),
  //     client.service('dummy').get('test 3')
  //   ]);

  //   assert.deepStrictEqual(results, [
  //     { id: 'test 1' },
  //     { id: 'test 2' },
  //     { id: 'test 3' }
  //   ]);

  //   assert.deepStrictEqual(await batchPromise, [
  //     { status: 'fulfilled', value: { id: 'test 1' } },
  //     { status: 'fulfilled', value: { id: 'test 2' } },
  //     { status: 'fulfilled', value: { id: 'test 3' } }
  //   ]);
  // });

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
    const people = client.service('people');
    const person = await people.create({
      name: 'Dave'
    });

    const [otherPerson, patchedPerson] = await Promise.all([
      people.create({ name: 'Other Dave' }),
      people.patch(person.id, { name: 'Davester' })
    ]);

    assert.deepStrictEqual(otherPerson, { name: 'Other Dave', id: 1 });
    assert.deepStrictEqual(patchedPerson, { name: 'Davester', id: 0 });

    const [gotPerson, allPeople] = await Promise.all([
      people.get(person.id),
      people.find()
    ]);

    assert.deepStrictEqual(gotPerson, patchedPerson);
    assert.deepStrictEqual(allPeople, [
      { name: 'Davester', id: 0 },
      { name: 'Other Dave', id: 1 }
    ]);

    await Promise.all([
      people.remove(person.id),
      people.remove(otherPerson.id)
    ]);

    assert.deepStrictEqual(await people.find(), []);
  });

  it('does resolve and reject from a batch', async () => {
    const results = await Promise.allSettled([
      client.service('dummy').get('testing'),
      client.service('dummy').get('error')
    ]);

    assert.deepStrictEqual(results[0].value, { id: 'testing' });
    assert.strictEqual(results[1].reason.message, 'This did not work');
  });
});
