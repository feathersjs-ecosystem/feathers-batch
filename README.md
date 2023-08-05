<h1>feathers-batch</h1>

[![CI](https://github.com/feathersjs-ecosystem/feathers-batch/workflows/CI/badge.svg)](https://github.com/feathersjs-ecosystem/feathers-batch/actions?query=workflow%3ACI)
[![Dependency Status](https://img.shields.io/david/feathersjs-ecosystem/feathers-batch.svg?style=flat-square)](https://david-dm.org/feathersjs-ecosystem/feathers-batch)
[![Download Status](https://img.shields.io/npm/dm/feathers-batch.svg?style=flat-square)](https://www.npmjs.com/package/feathers-batch)
[![Slack Status](http://slack.feathersjs.com/badge.svg)](http://slack.feathersjs.com)

> Batch multiple Feathers service calls into one

<!-- TOC -->

- [About](#about)
- [Server](#server)
  - [Usage](#usage)
  - [Batch calls](#batch-calls)
  - [Authentication](#authentication)
- [Client](#client)
  - [Usage](#usage-1)
  - [Options](#options)
  - [Parallelizing requests](#parallelizing-requests)
  - [UI Frameworks](#ui-frameworks)
- [License](#license)

<!-- /TOC -->

## About

Feathers-batch is a high-performance library for Feathers applications that intelligently batches multiple service calls into one, reducing network overhead and improving response times. It optimizes authentication and seamlessly integrates with REST and Socket.io, simplifying batching and delivering faster and more efficient data processing without complex coding.

- Reduced Network Overhead: Most browsers limit concurrent HTTP requests to 6. By batching multiple service requests into a single batch call, the library significantly reduces the number of API requests made from the client to the server. This leads to a reduction in network overhead and improves the overall efficiency of data transfer.

- Improved Performance: Fewer API requests and reduced network latency result in faster response times. Batching helps optimize the performance of applications, especially when dealing with multiple parallel requests.

- Optimized Authentication: The library allows batching of authenticated requests, performing the authentication step only once for the entire batch. This reduces redundant authentication requests and enhances the processing speed of batched requests while maintaining security measures.

- Simplified Code: The library abstracts the complexity of batching multiple service requests, making it easier for developers to manage and optimize API calls without having to manually handle batching logic.

`feathers-batch` consists of two parts:

- The server side [batch service](#service) to execute batch calls
- The client side [batch client](#client) to collect parallel requests from a [Feathers client]() into a batch service request

```bash
npm install feathers-batch --save
```

## Server

The `BatchService` on the server-side in feathers-batch is a custom service provided by the library. It is designed to handle batched service calls sent by the client. When a client makes a batch request, the `BatchService` processes and executes multiple service calls together in a single operation.

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

feathers-batch allows for optimizing authenticated requests within a batch by performing the authentication step only once. This reduces redundant authentication requests and improves processing efficiency, ensuring both security and performance in batch scenarios.

Add the [authenticate hook](https://docs.feathersjs.com/api/authentication/hook.html) to the batch service `create` method. Authentication will be called on the batch service and its results will be available in all of the batched requests.

```js
app.service('batch').hooks({
  before: {
    create: [ authenticate('jwt') ]
  }
});
```

## Client
[Feathers Client](https://docs.feathersjs.com/api/client.html)

The client-side module of feathers-batch empowers Feathers applications to optimize API requests from the browser by automatically batching multiple parallel requests into a single call. This capability is especially valuable because most browsers restrict the number of concurrent HTTP requests to a single domain to around six connections. By using feathers-batch, you can overcome this limitation and effectively batch requests, leading to reduced network overhead and improved performance.

### Usage

In feathers-batch, there are two approaches to utilize the client-side functionality. The first method involves using the `batchClient` function, which enables batching for all services within the Feathers client instance automatically. The second option is to apply the `batchHook` to individual services, allowing more control over which services should be batched and which ones should be processed individually. These two approaches offer flexibility in configuring batching behavior to best suit your application's requirements.

The `batchClient` function is used to configure batching for all services within the Feathers client instance. It takes an options object and ensures any service calls made from the client are automatically captured as batches.
```js
import { batchClient } from 'feathers-batch';

const client = feathers();

// Use `batchClient` to enable batching for all services
client.configure(batchClient({
  batchService: 'batch',
  // Other options for batching
}));
```

The `batchHook` is applied on a per-service basis. It allows you to configure batching behavior for individual services independently. You do not have to use `batchClient` to use `batchHook`. If you would like to only enable batching on select services, just use `batchHook`.
```js
import { batchHook } from 'feathers-batch';

const usersService = client.service('users');
const messagesService = client.service('messages');

// Create a hook with custom configuration
const batch = batchHook({
  batchService: 'batch',
   // Other options for batching
})

usersService.hooks({
  before: {
     find: [batch],
     get: [batch],
     create: [batch],
     update: [batch],
     patch: [batch],
     remove: [batch]
  }
});

// You can share batches across services
usersService.hooks({
  before: {
     find: [batch],
     get: [batch],
     create: [batch],
     update: [batch],
     patch: [batch],
     remove: [batch]
  }
});
```
> __Note:__ The hook returned from `batchHook` should always be the LAST before hook for each method.

With `batchHook`, you can customize batching for specific services without affecting other services, or you can share the same batch across specific services. You can even send batches to a different backend endpoint. The settings provided to `batchHook` will override the global settings of `batchClient`.

Once configured, you can continue to make regular service calls using the Feathers client. The client will automatically collect parallel requests and combine them into a single batch, ensuring efficient use of available connections and optimizing data transfer.

### Options

When configuring feathers-batch, you have several options available to fine-tune the behavior of the batching process:

- **batchService** (required): The name of the batch service registered on the server-side. This option specifies the endpoint to which the batched requests will be sent.

- **exclude** (optional): An array of service names that should be excluded from batching. Alternatively, you can provide an async function that takes the context as an argument to dynamically decide whether to exclude a particular service call from batching. This option is useful when certain services should not be included in the batch for specific scenarios.

- **dedupe** (optional): A boolean indicating whether requests should be deduplicated in the batch. Alternatively, you can provide an async function that takes the context as an argument to determine whether to deduplicate a particular service call. Deduplication helps avoid redundant requests within the batch.

- **timeout** (optional): The number of milliseconds to wait when collecting parallel requests before creating a batch. The default value is 25. Adjusting the timeout can help balance the trade-off between batch size and responsiveness.

```js
client.configure(batchClient({
  batchService: 'batch',
  exclude: ['authentication'], // Exclude 'authentication' service from batching
  dedupe: false, // disable deduplication of requests in the batch
  timeout: 50 // Set the batch collection timeout to 50 milliseconds
}));
```

```js
client.configure(batchClient({
  batchService: 'batch',
  exclude: (context) => {
    // Exclude 'admin' service from batching
    return context.path === 'admin';
  },
  dedupe: async (context) => {
    // Deduplicate 'users' service find requests within the batch
    if (context.path === 'users' && context.method === 'find') {
      return true;
    }
    return false;
  },
  timeout: 50 // Set the batch collection timeout to 50 milliseconds
}));
```

By using functions for `exclude` and `dedupe`, you gain flexibility in customizing which service calls to include or exclude from the batch, making it easy to handle different scenarios based on your application's needs. You can also use params to control batching on each individual service call.

```js
// Exclude service calls individually with params
await app.service('users').find({ batch: { exclude: true } });
await app.service('admin').get(1, { batch: { exclude: (context) => true } });

// Deduplicate service calls individually with params
await app.service('messages').get(1, { batch: { dedupe: true } });
await app.service('notifications').find({ batch: { dedupe: (context) => true } });
```

By setting these options on each service call, you can control which requests should be excluded from batching, ensuring they are processed individually. Additionally, you can deduplicate certain service calls to avoid redundancy within the batch, tailoring the batching behavior to suit specific requirements and further optimize the performance of your Feathers application.


### Parallelizing Requests

In feathers-batch, sequential requests are not automatically combined into a batch. When multiple service calls are made sequentially using await, each request is processed individually, similar to making separate API calls. Feathers-batch doesn't batch these requests together because it only collects parallel requests into a single batch call. Just use services as you normally would.

```js
// This works as expected
const user = await client.service('users').get(userId);
const messages = await client.service('messages').find({
  query: { userId }
});
```

When using `Promise.all` to parallelize requests, feathers-batch will automatically detect and capture these concurrent requests as a batch. This is how `feathers-schema` and others resolvers handle promises, which means batching works in all resolvers and loaders.

```js
const [ user, messages ] = await Promise.all([
  client.service('users').get(userId),
  client.service('messages').find({
    query: { userId }
  })
]);
```

## UI Frameworks

Feathers-batch seamlessly integrates with UI libraries like React and Vue, requiring no additional configuration. When components make service requests simultaneously, Feathers-batch automatically captures these requests and combines them into a single batch. This batching process occurs transparently behind the scenes, optimizing data retrieval without any manual intervention.

```js
// Given the User component fetches each user, the
// app will automatically batch all user requests
<ListGroup>
  {userIds.map((userId) => {
    return (
      <ListItem>
        <User userId={userId}>
      </ListItem>
    )
  })}
</ListGroup>
```

## License

Copyright (c) 2020 Feathers contributors

Licensed under the [MIT license](LICENSE).
