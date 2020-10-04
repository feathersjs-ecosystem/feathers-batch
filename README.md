<h1>feathers-batch</h1>

[![Dependency Status](https://img.shields.io/david/feathersjs-ecosystem/feathers-batch.svg?style=flat-square)](https://david-dm.org/feathersjs-ecosystem/feathers-batch)
[![Download Status](https://img.shields.io/npm/dm/feathers-batch.svg?style=flat-square)](https://www.npmjs.com/package/feathers-batch)
[![Slack Status](http://slack.feathersjs.com/badge.svg)](http://slack.feathersjs.com)

> Batch multiple Feathers service calls into one

<!-- TOC -->

- [About](#about)
- [Service](#service)
  - [Usage](#usage)
  - [Batch calls](#batch-calls)
  - [Authentication](#authentication)
- [Client](#client)
  - [Usage](#usage-1)
  - [Options](#options)
  - [Parallelizing requests](#parallelizing-requests)
- [License](#license)

<!-- /TOC -->

## About

`feathers-batch` allows to batch multiple service requests into one. This is useful for minimizing client side requests to any Feathers API and can additionally speed up batched requests by only [performing authentication once](#authentication).

It also comes with a client side module that automatically collects API requests from a [Feathers client]() into a batch.

`feathers-batch` consists of two parts:

- The server side [batch service](#service) to execute batch calls
- The client side [batch client](#client) to collect parallel requests from a [Feathers client]() into a batch service request

```
npm install feathers-batch --save
```

## Service

The batch service is a normal Feathers service that executes the batch calls.

### Usage

It can be registered by adding the following to your `src/services/index.js|ts`:

```js
const { BatchService } = require('feathers-batch');

module.exports = function (app) {
  // ...
  app.use('batch', new BatchService(app));
}
```

### Batch calls

Now multiple service calls can be made by sending a `create` (`POST`) call to `/batch` with a `{ calls: [] }` property. `calls` is an array in the same format as the [Socket.io direct connection](https://docs.feathersjs.com/api/client/socketio.html#direct-connection) events:

```js
{
  "calls": [
    [ "method", "serviceName", /* list of parameters */ ],
    ...
  ]
}
```

> __Note:__ When using a Feathers client with the [batch client](#client) this will be done automatically.

For example, the following will execute a batch call to `app.service('users').get(1, { query: { active: true } })` and `app.service('messages').find({ query: { userId } })`:

```js
{
  "calls": [
    [ "get", "users", 1, { active: true } ],
    [ "find", "messages", { userId } ]
  ]
}
```

The return value will be the information as returned by [Promise.allSettled](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled):

```js
[
  {
    "status": : "fulfilled",
    "value": { /* user object returned by app.service('users').get(1) */ } 
  }, {
    "status": : "fulfilled",
    "value": { /* page returned by app.service('messages').find({ query: { userId } }) */ } 
  }
]
```

If an error happened:

```js
[
  {
    "status": : "fulfilled",
    "value": { /* user object returned by app.service('users').get(1) */ } 
  }, {
    "status": : "rejected",
    "reason": { /* error JSON or object with error message */ } 
  }
]
```

### Authentication

If you are batching authenticated requests, it is possible to perform the authentication step only once (instead of on every service call) in a batch by adding the [authenticate hook](https://docs.feathersjs.com/api/authentication/hook.html) to the batch service `create` method:

```js
app.service('batch').hooks({
  before: {
    create: [ authenticate('jwt') ]
  }
});
```

## Client

`feathers-batch` also exports a client side module that can be used with [Feathers on the client](https://docs.feathersjs.com/api/client.html) that automatically collects multiple requests that are made at the same time into a single batch call. This works for any transport mechanism (REST, Socket.io etc.).

### Usage

Batching on the client can be enabled like this:

```js
// If your module loader supports the `browser` package.json field
import { batchClient } from 'feathers-batch';
// Alternatively
import { batchClient } from 'feathers-batch/client';

const client = feathers();
// configure Feathers client here

// `batchClient` should be configured *after*
// any other application level hooks
client.configure(batchClient({
  batchService: 'batch'
}));
```

Now you can continue to make normal service calls and whenever possible they will be automatically combined into a batch (see [parallelizing requests](#parallelizing-requests) for more information).

### Options

The following options are available for the `batchClient`:

- `batchService` (*required*) - The name of the batch service
- `exclude` (*optional*) - An array of service names that should be excluded from batching
- `timeout` (*optional*) (default: `50`) - The number of milliseconds to wait when collecting parallel requests.

### Parallelizing requests

At the same time means e.g. multiple components making requests to the API in parallel. The following example will __NOT__ be collected into a batch since the calls run sequentially using `await`:

```js
const user = await client.service('users').get(userId);
const messages = await client.service('messages').find({
  query: { userId }
});
```

If the requests are not dependent on each other and you want to batch them, [Promise.all](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all) needs to be used:

```js
const [ user, messages ] = await Promise.all([
  client.service('users').get(userId),
  client.service('messages').find({
    query: { userId }
  })
]);
```

## License

Copyright (c) 2020 Feathers contributors

Licensed under the [MIT license](LICENSE).
