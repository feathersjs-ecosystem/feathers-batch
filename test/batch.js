import assert from 'assert';
import feathers from 'feathers';
import memory from 'feathers-memory';

import batcher from '../src/batch';

describe('feathers-batch tests', () => {
  it('batching with no parameters comes back with empty object', (done) => {
    let app = feathers();

    app.use('/batch', batcher());

    app.service('batch').create({}, {}, function (error) {
      assert.ok(!error, 'No errors');
      done();
    });
  });

  it('simple batching with one service', (done) => {
    let app = feathers();

    app.use('/todos', memory())
      .use('/batch', batcher());

    app.listen(7667, () => {
      app.service('batch').create({
        'todos::create': [
          [{'text': 'one todo', 'complete': false}],
          [{'text': 'another todo', 'complete': true}]
        ],
        'todos::find': [{}]
      }, function (error, data) {
        assert.ok(!error);
        assert.deepEqual(data, {
          'todos::create': [
            [
              null,
              {
                'text': 'one todo',
                'complete': false,
                'id': 0
              }
            ],
            [
              null,
              {
                'text': 'another todo',
                'complete': true,
                'id': 1
              }
            ]
          ],
          'todos::find': [
            [
              null,
              [
                {
                  'text': 'one todo',
                  'complete': false,
                  'id': 0
                },
                {
                  'text': 'another todo',
                  'complete': true,
                  'id': 1
                }
              ]
            ]
          ]
        });
        done();
      });
    });
  });
});
