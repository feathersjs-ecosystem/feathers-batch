import assert from 'assert';
import feathers from 'feathers';
import memory from 'feathers-memory';

import batcher from '../src/batch';

describe('feathers-batch tests', () => {
  it('batching with no parameters comes back with empty object', done => {
    let app = feathers();

    app.use('/batch', batcher());

    app.service('batch').create({call: []}, {}, function (error, data) {
      assert.ok(!error, 'No errors');
      assert.deepEqual(data, {type: 'parallel', results: []});
      done();
    });
  });

  it('simple batching in series with one service and one error', done => {
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
        try {
          assert.ok(!error);
          const notFound = data.data[2];
          assert.deepEqual(data, {
            type: 'series',
            data: [
              [null, {"text": "one todo", "complete": false, "id": 0}],
              [null, {"text": "another todo", "complete": true, "id": 1}],
              notFound,
              [
                null,
                [
                  {"text": "one todo", "complete": false, "id": 0},
                  {"text": "another todo", "complete": true, "id": 1}
                ]
              ]
            ]
          });
        } catch(e) {
          return done(e);
        }
        
        server.close(done);
      });
    });
  });

  it('extends service params to batch calls and sets query', done => {
    let app = feathers();

    app.use('/todos', {
      get(id, params, callback) {
        callback(null, {id, params});
      }
    })
      .use('/batch', batcher());

    let server = app.listen(7667);
    server.on('listening', () => {
      app.service('batch').create({
        call: [
          ['todos::get', 1, {test: 'param1'}],
          ['todos::get', 3, {test: 'param2'}]
        ]
      }, {my: 'params'}, function (error, data) {
        assert.ok(!error);
        assert.deepEqual(data, {
          type: 'parallel',
          data: [
            [null, {id: 1, params: {my: 'params', query: {test: 'param1'}}}],
            [null, {id: 3, params: {my: 'params', query: {test: 'param2'}}}]
          ]
        });
        server.close(done);
      });
    });
  });
});
