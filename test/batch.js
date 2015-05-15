import assert from 'assert';
import feathers from 'feathers';
import memory from 'feathers-memory';

import batcher from '../src/batch';

describe('feathers-batch tests', () => {
  it('batching with no parameters comes back with empty object', (done) => {
    let app = feathers();

    app.use('/batch', batcher());

    app.service('batch').create({call: []}, {}, function (error, data) {
      assert.ok(!error, 'No errors');
      assert.deepEqual(data, {type: 'parallel', results: []});
      done();
    });
  });

  it('simple batching in series with one service and one error', (done) => {
    let app = feathers();

    app.use('/todos', memory())
      .use('/batch', batcher());

    let server = app.listen(7667);
    server.on('listening', () => {
      app.service('batch').create({
        type: 'series',
        call: [
          ['todos::create', {'text': 'one todo', 'complete': false}],
          ['todos::create', {'text': 'another todo', 'complete': true}],
          ['todos::get', 10],
          ['todos::find', {}]
        ]
      }, function (error, data) {
        assert.ok(!error);
        assert.deepEqual(data, [
          [null, {"text": "one todo", "complete": false, "id": 0}],
          [null, {"text": "another todo", "complete": true, "id": 1}],
          [{"message": "Could not find record", "data": {"id": 10}}],
          [
            null,
            [
              {"text": "one todo", "complete": false, "id": 0},
              {"text": "another todo", "complete": true, "id": 1}
            ]
          ]
        ]);
        server.close(done);
      });
    });
  });
});
