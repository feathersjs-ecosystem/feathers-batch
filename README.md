# feathers-batch

[![Build Status](https://travis-ci.org/feathersjs/feathers-batch.png?branch=master)](https://travis-ci.org/feathersjs/feathers-batch)

> Batch multiple Feathers service calls into one

## About

feathers-batch allows you to batch multiple calls to other service methods into one. This is very useful for minimizing HTTP requests through the REST API but also works with websockets (or any other supported provider).

## Usage

Batching is implemented as a Feathers service that allows to `create` new batch requests. Initialize the service in your app like:

```js
var feathers = require('feathers');
var bodyParser = require('body-parser');
var batcher = require('feahters-batch');

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

## Changelog

__0.1.0__

- Initial release

## Author

- [David Luecke](https://github.com/daffl)

## License

Copyright (c) 2015 David Luecke

Licensed under the [MIT license](LICENSE).
