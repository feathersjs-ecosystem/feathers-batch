const { strict: assert } = require('assert');
const { batch } = require('../lib');

describe('feathers-batch', () => {
  it('initializes the plugin', () => {
    assert.equal(batch(), 'Hello world');
  });
});
