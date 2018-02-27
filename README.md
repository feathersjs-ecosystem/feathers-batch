# feathers-batch

[![Greenkeeper badge](https://badges.greenkeeper.io/feathersjs-ecosystem/feathers-batch.svg)](https://greenkeeper.io/)
[![Build Status](https://travis-ci.org/feathersjs-ecosystem/feathers-batch.png?branch=master)](https://travis-ci.org/feathersjs-ecosystem/feathers-batch)
[![Dependency Status](https://img.shields.io/david/feathersjs-ecosystem/feathers-batch.svg?style=flat-square)](https://david-dm.org/feathersjs-ecosystem/feathers-batch)
[![Download Status](https://img.shields.io/npm/dm/feathers-batch.svg?style=flat-square)](https://www.npmjs.com/package/feathers-batch)
[![Slack Status](http://slack.feathersjs.com/badge.svg)](http://slack.feathersjs.com)

> Batch multiple Feathers service calls into one

## About

feathers-batch allows you to batch multiple calls to other service methods into one. This is very useful for minimizing HTTP requests through the REST API but also works with websockets (or any other supported provider).

## Usage

Batching is implemented as a Feathers service that allows to `create` new batch requests. Initialize the service in your app like:

```js
var feathers = require('feathers');
var bodyParser = require('body-parser');
var batcher = require('feathers-batch');

var app = feathers()
  .use(bodyParser())
  .use('/batch', batcher({
    limit: 10
  }));

// ...
```

Options:

- __limit__ - Indicates the maximum number of request allowed in a batch

## Sending batch requests

You can send a batch request as a `create` (`POST`) service call to `/batch` in the following format:

```js
{
  "type": "<series/parallel>",
  "call": [
    [ "path1::method1", /* call 1 list of params */ ],
    ...
    [ "pathN::methodN", /* call N list of params */ ]
  ]
}
```

`type` can be `parallel` to run all requests in parallel or `series` to run one after the other. If no type is given, `parallel` will be used.

`path::method` calls work the same way as equivalent websocket calls. This means that the batch `create` params will be used as the base (which contains e.g. the authenticated user information so that a user can only create batch requests to services they are allowed to access) and call params will be set as `params.query` in the actual service call:

```js
// Finds all todos that are complete
socket.emit('todos::find', { complete: true }, function(error, todos) {});

// The equivalent batch call
[ "todos::find", { "complete": true }]

// Both will call the service like
app.service('/todos', {
  find: function(params, callback) {
    // params == { query: { complete: true } }
  }
});
```

The batch call will return with the results like:

```js
{
  "type": "<series/parallel>",
  "data": [
    [ error, result ],
    ...
    [ errorN, resultN ]
  ]
}
```

## Example

The following example creates two Todos in series and then retrieves all Todos (with no parameters):

```js
{
  "type": "series",
  "call": [
    [ "todos::create", { "text": "one todo", "complete": false } ],
    [ "todos::create", { "text": "another todo", "complete": true } ]
    [ "todos::find", {} ]
  ]
}
```

Which might return something like:

```js
{
  "type": "series",
  "data": [
    [ null, { "id": 1, "text": "one todo", "complete": false }],
    [ null, { "id": 2, "text": "another todo", "complete": true }],
    [ null, [
        { "id": 0, "text": "todo that was already here", "complete": false },
        { "id": 1, "text": "one todo", "complete": false },
        { "id": 2, "text": "another todo", "complete": true }
      ]
    ]
  ]
}
```

## License

Copyright (c) 2018 Feathers contributors

Licensed under the [MIT license](LICENSE).
