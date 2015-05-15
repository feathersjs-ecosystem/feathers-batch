# Feathers Batch

[![Build Status](https://travis-ci.org/feathersjs/feathers-batch.png?branch=master)](https://travis-ci.org/feathersjs/feathers-batch)

> Batch multiple Feathers service calls into one

## About

feathers-batch allows you to batch multiple calls to other service methods into one. This is very useful for minimizing HTTP requests through the REST API but also works with websockets (or any other supported provider).

## Usage

Batching is implemented as a Feathers service that allows you to `create` new batch requests. Initialize the service in your app like:

```js
var feathers = require('feathers');
var batcher = require('feahters-batch');

var app = feathers()
  .use('/batch', batcher());

// ...
```

And then send `create` batch requests in the following format:

```js
{
  "service::method": [ /* array of params */ ],
  // or for multiple calls to the same method
  "service::method": [
    [ /* call 1 array of params */ ],
    [ /* call 2 array of params */ ]
  ]
}
```

Which will return with the results like:


```js
{
  "service::method": [
    [ error, result ]
  ],
  // or for multiple calls to the same method
  "service::method": [
    [ error1, result1 ],
    [ error2, result2 ]
  ]
}
```

The following example creates two Todos and then retrieves all Todos (with no parameters):

```js
{
  "todos::create": [
    [{ "text": "one todo", "complete": false }],
    [{ "text": "another todo", "complete": true }]
  ],
  "todos::find": [{}]
}
```

And might return something like:

```js
{
  "todos::create": [
    [null, { "id": 1, "text": "one todo", "complete": false }],
    [null, { "id": 2, "text": "another todo", "complete": true }]
  ],
  "todos::find": [ null, [
      { "id": 0, "text": "todo that was already here", "complete": false },
      { "id": 1, "text": "one todo", "complete": false },
      { "id": 2, "text": "another todo", "complete": true }
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
