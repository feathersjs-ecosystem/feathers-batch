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
      this.timeout = setTimeout(() => this.flush(), this.options.timeout || 50);
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

const makeArguments = (context) => {
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

const batchHook = (options) => {
  if (typeof options.batchService !== 'string') {
    throw new Error('`batchService` name option must be passed to hook');
  }

  let manager = null;
  const excludes = (options.exclude || []).concat(options.batchService);

  return async (context) => {
    if (!manager) {
      manager = new BatchManager(context.app, options);
    }

    // TODO: Should this use service.name?
    if (excludes.includes(context.path)) {
      return context;
    }

    context.result = await manager.batch(context);

    return context;
  };
};

const batchClient = (options) => (app) => {
  if (typeof options.batchService !== 'string') {
    throw new Error('`batchService` name option must be passed to batchClient');
  }

  const manager = new BatchManager(app, options);
  const excludes = (options.exclude || []).concat(options.batchService);

  const filterContext = ({ batch, ...batchParams }, service) => {
    const path = service.name;
    return {
      batchParams,
      path,
      skip: batch === false || !path || excludes.includes(path)
    };
  };

  app.mixins.push(function (service) {
    const find = service.find;
    service.find = function (params = {}) {
      const { batchParams, path, skip } = filterContext(params, service);
      if (skip) {
        return find.call(this, params);
      }
      return manager.batch({
        path,
        params: batchParams,
        method: 'find'
      });
    };

    const get = service.get;
    service.get = async function (id, params = {}) {
      const { batchParams, path, skip } = filterContext(params, service);
      if (skip) {
        return get.call(this, id, params);
      }
      return manager.batch({
        id,
        path,
        params: batchParams,
        method: 'get'
      });
    };

    const create = service.create;
    service.create = function (data, params = {}) {
      const { batchParams, path, skip } = filterContext(params, service);
      if (skip) {
        return create.call(this, data, params);
      }
      return manager.batch({
        data,
        path,
        params: batchParams,
        method: 'create'
      });
    };

    const update = service.update;
    service.update = function (id, data, params = {}) {
      const { batchParams, path, skip } = filterContext(params, service);
      if (skip) {
        return update.call(this, id, data, params);
      }
      return manager.batch({
        id,
        data,
        path,
        params: batchParams,
        method: 'update'
      });
    };

    const patch = service.patch;
    service.patch = function (id, data, params = {}) {
      const { batchParams, path, skip } = filterContext(params, service);
      if (skip) {
        return patch.call(this, id, data, params);
      }
      return manager.batch({
        id,
        data,
        path,
        params: batchParams,
        method: 'patch'
      });
    };

    const remove = service.remove;
    service.remove = function (id, params = {}) {
      const { batchParams, path, skip } = filterContext(params, service);
      if (skip) {
        return remove.call(this, id, params);
      }
      return manager.batch({
        id,
        path,
        params: batchParams,
        method: 'remove'
      });
    };
  });
};

exports.BatchManager = BatchManager;
exports.makeArguments = makeArguments;
exports.batchClient = batchClient;
exports.batchHook = batchHook;
