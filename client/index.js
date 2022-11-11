const { convert } = require('@feathersjs/errors');

class BatchManager {
  constructor (app, options) {
    this.app = app;
    this.batches = [];
    this.timeout = null;
    this.options = options;
  }

  batch (context) {
    const args = makeArguments(context);
    const payload = [context.method, context.path, ...args];

    const batchPromise = new Promise((resolve, reject) => {
      this.batches.push({
        resolve,
        reject,
        payload
      });
    });

    if (this.timeout === null) {
      this.timeout = setTimeout(() =>
        this.flush()
      , this.options.timeout || 50);
    }

    return batchPromise;
  }

  async flush () {
    const currentBatches = this.batches;

    this.batches = [];
    this.timeout = null;

    const { batchService } = this.options;
    const results = await this.app.service(batchService).create({
      calls: currentBatches.map(({ payload }) => payload)
    });

    currentBatches.forEach((batch, index) => {
      const callResult = results[index];

      if (callResult.status === 'fulfilled') {
        batch.resolve(callResult.value);
      } else {
        batch.reject(convert(callResult.reason));
      }
    });
  }
}

const makeArguments = context => {
  const { query = {} } = context.params;

  switch (context.method) {
    case 'get':
    case 'remove':
      return [context.id, query];
    case 'update':
    case 'patch':
      return [context.id, context.data, query];
    case 'create':
      return [context.data, query];
    default:
      return [query];
  }
};

const batchHook = options => {
  if (typeof options.batchService !== 'string') {
    throw new Error('`batchService` name option must be passed to batchClient');
  }

  const manager = new BatchManager(context.app, options);
  const excludes = (options.exclude || []).concat(options.batchService);

  return async context => {
    const { path } = context;

    if (excludes.includes(path)) {
      return context;
    }

    context.result = await manager.batch(context);

    return context;
  };
};

const stashPath = context => {
  context.params.path = context.path;
  return context;
};

const batchClient = options => app => {
  if (typeof options.batchService !== 'string') {
    throw new Error('`batchService` name option must be passed to batchClient');
  }

  const manager = new BatchManager(app, options);
  const excludes = (options.exclude || []).concat(options.batchService);

  app.hooks({
    before: {
      all: [stashPath]
    }
  });

  // app.mixins.push(function (service) {
  //   // console.log(service)
  //   const find = service.find;
  //   service.find = function (params = {}) {
  //     if (params.batch === false || excludes.includes(params.path)) {
  //       return find.call(this, params);
  //     }
  //     return manager.batch({
  //       params,
  //       path: params.path,
  //       method: 'find'
  //     });
  //   };

  //   const get = service.get;
  //   service.get = async function (id, params = {}) {
  //     console.log('Calling GET')
  //     if (params.batch === false || excludes.includes(params.path)) {
  //       return get.call(this, params);
  //     }
  //     console.log('Calling Manager')
  //     const result = await manager.batch({
  //       id,
  //       params,
  //       path: service.name,
  //       method: 'get'
  //     });
  //     console.log({ result })
  //     return manager.batch({
  //       id,
  //       params,
  //       path: service.name,
  //       method: 'get'
  //     });
  //   };

  //   const create = service.create;
  //   service.create = function (data, params = {}) {
  //     if (params.batch === false || excludes.includes(params.path)) {
  //       return create.call(this, params);
  //     }
  //     return manager.batch({
  //       data,
  //       params,
  //       path: params.path,
  //       method: 'create'
  //     });
  //   };

  //   const update = service.update;
  //   service.update = function (id, data, params = {}) {
  //     if (params.batch === false || excludes.includes(params.path)) {
  //       return update.call(this, params);
  //     }
  //     return manager.batch({
  //       id,
  //       data,
  //       params,
  //       path: params.path,
  //       method: 'update'
  //     });
  //   };

  //   const patch = service.patch;
  //   service.patch = function (id, data, params = {}) {
  //     if (params.batch === false || excludes.includes(params.path)) {
  //       return patch.call(this, params);
  //     }
  //     return manager.batch({
  //       id,
  //       data,
  //       params,
  //       path: service.name,
  //       method: 'patch'
  //     });
  //   };

  //   const remove = service.remove;
  //   service.remove = function (id, params = {}) {
  //     if (params.batch === false || excludes.includes(params.path)) {
  //       return remove.call(this, params);
  //     }
  //     return manager.batch({
  //       id,
  //       params,
  //       path: params.path,
  //       method: 'remove'
  //     });
  //   };
  // });
};

exports.BatchManager = BatchManager;
exports.makeArguments = makeArguments;
exports.batchClient = batchClient;
exports.batchHook = batchHook;
