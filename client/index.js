const { convert } = require('@feathersjs/errors');

const isObject = (obj) => {
  return obj && typeof obj === 'object' && !Array.isArray(obj);
};

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
};

const payloadService = (path) => {
  return {
    get (id, params) {
      return makePayload({
        id,
        params,
        path,
        method: 'get'
      });
    },
    find (params) {
      return makePayload({
        params,
        path,
        method: 'find'
      });
    },
    create (data, params) {
      return makePayload({
        data,
        params,
        path,
        method: 'create'
      });
    },
    update (id, data, params) {
      return makePayload({
        id,
        data,
        params,
        path,
        method: 'update'
      });
    },
    patch (id, data, params) {
      return makePayload({
        id,
        data,
        params,
        path,
        method: 'patch'
      });
    },
    remove (id, params) {
      return makePayload({
        id,
        params,
        path,
        method: 'remove'
      });
    }
  };
};

const isExcluded = (context, options) => {
  const path = context.path || context.service.name;
  const isBatchService = path === options.batchService;
  if (isBatchService) {
    return true;
  }
  if (service.options && service.options.batch === false) {
    return true;
  }
  if (context.params && context.params.batch === false) {
    return true
  }
  if (!options.exclude) {
    return false;
  }
  if (Array.isArray(options.exclude)) {
    return options.exclude.includes(path);
  }
  return options.exclude(context, options);
}

stableStringify = (object) => {
  return JSON.stringify(object, (key, value) => {
    if (typeof value === 'function') {
      throw new GeneralError(
        'Cannot stringify non JSON value. The object passed to stableStringify must be serializable.'
      );
    }

    if (isObject(value)) {
      const keys = Object.keys(value).sort();
      const result = {};
      for (let index = 0, length = keys.length; index < length; ++index) {
        const key = keys[index];
        result[key] = value[key];
      }
      return result;
    }

    return value;
  });
};

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

    const { batchService, batchDedupe } = this.options;

    const calls = [];
    const resultIndexes = [];
    const keyMap = new Map();
    currentBatches.forEach((batch, index) => {
      if (batchDedupe === false) {
        resultIndexes.push(index);
        calls.push(batch.payload);
        return;
      }
      const key = stableStringify(batch.payload);
      if (!keyMap.has(key)) {
        keyMap.set(key, index);
        resultIndexes.push(index);
        calls.push(batch.payload);
      } else {
        resultIndexes.push(keyMap.get(key));
      }
    });

    const results = await this.app.service(batchService).create({
      calls
    });

    currentBatches.forEach((batch, index) => {
      const callResult = results[resultIndexes[index]];

      if (callResult.status === 'fulfilled') {
        batch.resolve(callResult.value);
      } else {
        batch.reject(convert(callResult.reason));
      }
    });
  }

  isExcluded(context) {
    const { batchService, exclude } = this.options;
    const path = context.path || context.service.name;
    const isBatchService = path === batchService;
    if (isBatchService) {
      return true;
    }
    if (context.params && context.params.batch === false) {
      return true
    }
    if (!exclude) {
      return false;
    }
    if (Array.isArray(exclude)) {
      return exclude.includes(path);
    }
    return exclude(context);
  }

  // async all(callback) {
  //   const calls = callback(payloadService);
  //   const service = this.app.service(batchService);
  //   const settledPromises = await service.create({ calls });
  //   const results = [];
  //   settledPromises.forEach((current) => {
  //     if (current.status === 'rejected') {
  //       throw convert(current.reason);
  //     }
  //     results.push(current.value);
  //   });
  //   return results;
  // }

  // async allSettled(callback) {
  //   const calls = callback(payloadService);
  //   const service = this.app.service(batchService);
  //   return service.create({ calls });
  // }
}

const batchHook = (options) => {
  if (typeof options.batchService !== 'string') {
    throw new Error('`batchService` name option must be passed to hook');
  }

  let defaultManager = null;
  return async (context) => {
    if (!defaultManager) {
      defaultManager = new BatchManager(context.app, options);
    }

    const manager = context.params.batchManager || defaultManager;

    if (manager.isExcluded(context)) {
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

  app.mixins.push(function (service) {
    const find = service.find;
    service.find = function (params = {}) {
      const manager = params.batchManager || defaultManager;
      if (manager.isExcluded({ service, params })) {
        return find.call(this, params);
      }
      return manager.batch({
        params,
        path: service.name,
        method: 'find'
      });
    };

    const get = service.get;
    service.get = async function (id, params = {}) {
      const manager = params.batchManager || defaultManager;
      if (manager.isExcluded({ service, params })) {
        return get.call(this, id, params);
      }
      return manager.batch({
        id,
        params,
        path: service.name,
        method: 'get'
      });
    };

    const create = service.create;
    service.create = function (data, params = {}) {
      const manager = params.batchManager || defaultManager;
      if (manager.isExcluded({ service, params })) {
        return create.call(this, data, params);
      }
      return manager.batch({
        data,
        params,
        path: service.name,
        method: 'create'
      });
    };

    const update = service.update;
    service.update = function (id, data, params = {}) {
      const manager = params.batchManager || defaultManager;
      if (manager.isExcluded({ service, params })) {
        return update.call(this, id, data, params);
      }
      return manager.batch({
        id,
        data,
        params,
        path: service.name,
        method: 'update'
      });
    };

    const patch = service.patch;
    service.patch = function (id, data, params = {}) {
      const manager = params.batchManager || defaultManager;
      if (manager.isExcluded({ service, params })) {
        return patch.call(this, id, data, params);
      }
      return manager.batch({
        id,
        data,
        params,
        path: service.name,
        method: 'patch'
      });
    };

    const remove = service.remove;
    service.remove = function (id, params = {}) {
      const manager = params.batchManager || defaultManager;
      if (manager.isExcluded({ service, params })) {
        return remove.call(this, id, params);
      }
      return manager.batch({
        id,
        params,
        path: service.name,
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
  };

  service.allSettled = async function (callback) {
    const calls = callback(payloadService);
    return service.create({ calls });
  };
};

exports.BatchManager = BatchManager;
exports.batchClient = batchClient;
exports.batchMethods = batchMethods;
exports.batchHook = batchHook;
