const { convert } = require('@feathersjs/errors');

class BatchManager {
  constructor (app, options) {
    this.app = app;
    this.batches = [];
    this.timeout = null;
    this.options = options;
  }

  batch (context) {
    const payload = makePayload(context);

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
  const { query = {} } = context.params = {};

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

const makePayload = (context) => {
  const args = makeArguments(context);
  return [context.method, context.path, ...args];
}

const payloadService = (path) => {
  return {
    get(id, params) {
      return makePayload({
        id,
        params,
        path,
        method: 'get',
      });
    },
    find(params) {
      return makePayload({
        params,
        path,
        method: 'find',
      });
    },
    create(data, params) {
      return makePayload({
        data,
        params,
        path,
        method: 'create',
      });
    },
    update(id, data, params) {
      return makePayload({
        id,
        data,
        params,
        path,
        method: 'update',
      });
    },
    patch(id, data, params) {
      return makePayload({
        id,
        data,
        params,
        path,
        method: 'patch',
      });
    },
    remove(id, params) {
      return makePayload({
        id,
        params,
        path,
        method: 'remove',
      });
    }
  }
}

const batchHook = (options) => {
  if (typeof options.batchService !== 'string') {
    throw new Error('`batchService` name option must be passed to hook');
  }

  let defaultManager = null;
  const excludes = (options.exclude || []).concat(options.batchService);

  return async (context) => {
    if (!defaultManager) {
      defaultManager = new BatchManager(context.app, options);
    }

    const manager = context.params.batchManager || defaultManager;

    // TODO: Should this use service.name?
    if (context.params.batch === false || excludes.includes(context.path)) {
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

  const defaultManager = new BatchManager(app, options);
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
      const manager = params.batchManager || defaultManager;
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
      const manager = params.batchManager || defaultManager;
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
      const manager = params.batchManager || defaultManager;
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
      const manager = params.batchManager || defaultManager;
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
      const manager = params.batchManager || defaultManager;
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
      const manager = params.batchManager || defaultManager;
      return manager.batch({
        id,
        path,
        params: batchParams,
        method: 'remove'
      });
    };
  });
};

const batchMethods = (options) => (app) => {
  if (typeof options.batchService !== 'string') {
    throw new Error('`batchService` name option must be passed to batchMethods');
  }

  const service = app.service(options.batchService);

  service.all = async function (callback) {
    const calls = callback(payloadService);
    const settledPromises = await service.create({ calls });
    const results = [];
    settledPromises.forEach((current) => {
      if (current.status === 'rejected') {
        throw convert(current.reason);
      }
      results.push(current.value);
    });
    return results;
  }

  service.allSettled = async function(callback) {
    const calls = callback(payloadService);
    return service.create({ calls });
  }
};

exports.BatchManager = BatchManager;
exports.batchClient = batchClient;
exports.batchMethods = batchMethods;
exports.batchHook = batchHook;
