# feathers-batch

[![Dependency Status](https://img.shields.io/david/feathersjs-ecosystem/feathers-batch.svg?style=flat-square)](https://david-dm.org/feathersjs-ecosystem/feathers-batch)
[![Download Status](https://img.shields.io/npm/dm/feathers-batch.svg?style=flat-square)](https://www.npmjs.com/package/feathers-batch)
[![Slack Status](http://slack.feathersjs.com/badge.svg)](http://slack.feathersjs.com)

> Batch multiple Feathers service calls into one

## About

`feathers-batch` allows to batch multiple calls to other service methods into one. This is very useful for minimizing client side requests to any Feathers API and can additionally speed up batched requests by only [performing authentication once](#authentication).

It also comes with a client side module that automatically collects API requests from a [Feathers client]() into batches.

`feathers-batch` consists of two parts:

- The server side [batch service](#service) to execute batched calls in parallel.
- The client side [batch client](#client) to collect parallel requests from a [Feathers client]() into a batch service request

## Service

On the server, batching is handled by a standalone service adapter.  As with the database adapters, you can setup the service on a path of your choosing.  The service watching for incoming batched requests and proxies calls to the correct service.

### Usage

To setup the service, import the `BatchService` and pass it to `app.use`, as shown below.  Due to its simplicity, the `BatchService` only requires the `app` object as its first argument.  It does not accept any options.

```js
const feathers = require('@feathersjs/feathers');
const express = require('@feathersjs/express');
const socketio = require('@feathersjs/socketio');
const memory = require('feathers-memory');

const { BatchService } = require('feathers-batch');

const app = express(feathers());

app.configure(socketio());
app.configure(express.rest());
app.use(express.json());
app.use('/people', memory());

app.use('/batch', new BatchService(app));

exports.app = app;
```

The `/batch` service is now ready to handle batched calls.

### Batch calls

The `BatchService` only utilizes the `create` service method, which accepts a single `data` object as its only argument.  This object requires a `calls` array property, as shown below.

```js
app.service('batch').create({
  calls: [
    ['find', 'users', { query: {} }],
    ['get', 'users', 45, {}],
    ['create', 'todos', { name: 'Do the dishes' }, {}],
    ['remove', 'pages', 1, {}]
    ['update', 'todos', 3, { name: 'Pass test', isComplete: true }, {}],
    ['patch', 'users', 4, { name: 'Falcon Fury' }, {}],
  ]
});
```

Each item in the `calls` array is an array containing

1. the service method
2. the service name
3. the arguments for the service method

You can review the service method arguments in the [FeathersJS Service Docs](https://docs.feathersjs.com/api/services.html#service-methods).

### Authentication

If you are batching authenticated requests, it is possible to perform the authentication step only once (instead of for every service call) by adding the [authenticate hook]() to the batch service `create` method:

## Client

`feathers-batch` also exports a client side module that automatically collects multiple requests that are made at the same time into a single batch call.

### Parallel requests

At the same time means e.g. multiple components making requests to the API in parallel. The following example will __NOT__ be collected into a batch:

```js
const user = await client.service('users').get(userId);
const messages = await client.service('messages').find({
  query: { userId }
});
```

If you want to combine those requests, [Promise.all]() needs to be used:

```js
const [user, messages] = await Promise.all([
  client.service('users').get(userId),
  client.service('messages').find({
    query: { userId }
  })
]);
```

### Options

without having to change anything in your application.

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

Copyright (c) 2020 Feathers contributors

Licensed under the [MIT license](LICENSE).
