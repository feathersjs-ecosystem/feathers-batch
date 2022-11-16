const { convert, GeneralError } = require('@feathersjs/errors');

const isObject = (obj) => {
  return obj && typeof obj === 'object' && !Array.isArray(obj);
};

const has = (obj, path) => {
  return Object.prototype.hasOwnProperty.call(obj, path);
}

const getPayload = (context) => {
  const payload = [context.method, context.path];
  const query = context.params.query || {};

  switch (context.method) {
    case 'get':
    case 'remove':
      payload.push(context.id, query);
      return payload;
    case 'update':
    case 'patch':
      payload.push(context.id, context.data, query);
      return payload;
    case 'create':
      payload.push(context.data, query);
      return payload;
    default:
      payload.push(query);
      return payload;
  }
};

const getContext = (app, service, method, args) => {
  const context = {
    app,
    service,
    path: service.name,
    method
  }

  switch (method) {
    case 'get':
    case 'remove':
      context.id = args[0];
      context.params = args[1] || {};
      return context;
    case 'update':
    case 'patch':
      context.id = args[0];
      context.data = args[1];
      context.params = args[2] || {};
      return context;
    case 'create':
      context.data = args[0];
      context.params = args[1] || {};
      return context;
    default:
      context.params = args[0] || {};
      return context;
  }
}

// const payloadService = (path) => {
//   return {
//     get (id, params) {
//       return makePayload({
//         id,
//         params,
//         path,
//         method: 'get'
//       });
//     },
//     find (params) {
//       return makePayload({
//         params,
//         path,
//         method: 'find'
//       });
//     },
//     create (data, params) {
//       return makePayload({
//         data,
//         params,
//         path,
//         method: 'create'
//       });
//     },
//     update (id, data, params) {
//       return makePayload({
//         id,
//         data,
//         params,
//         path,
//         method: 'update'
//       });
//     },
//     patch (id, data, params) {
//       return makePayload({
//         id,
//         data,
//         params,
//         path,
//         method: 'patch'
//       });
//     },
//     remove (id, params) {
//       return makePayload({
//         id,
//         params,
//         path,
//         method: 'remove'
//       });
//     }
//   };
// };

const stableStringify = (object) => {
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
    this.options = {
      timeout: 50,
      dedupe: true,
      ...options
    };
  }

  batch (context) {
    const payload = getPayload(context);
    const params = context.params;

    let dedupe = this.options.dedupe;
    if (params.batch && has(params.batch, 'dedupe')) {
      dedupe = params.batch.dedupe;
    }
    if (typeof dedupe === 'function') {
      dedupe = dedupe(context);
    }

    const batchPromise = new Promise((resolve, reject) => {
      this.batches.push({
        dedupe,
        resolve,
        reject,
        payload
      });
    });

    if (this.timeout === null) {
      this.timeout = setTimeout(() => this.flush(), this.options.timeout);
    }

    return batchPromise;
  }

  async flush () {
    const currentBatches = this.batches;

    this.batches = [];
    this.timeout = null;

    const { batchService } = this.options;

    const calls = [];
    const resultIndexes = [];
    const keyMap = new Map();
    currentBatches.forEach((batch, index) => {
      if (!batch.dedupe) {
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

  async isExcluded (context) {
    const path = context.path || context.service.name;
    const params = context.params;

    if (path === this.options.batchService) {
      return true;
    }

    let exclude = this.options.exclude;
    if (params.batch && has(params.batch, 'exclude')) {
      exclude = params.batch.exclude;
    }

    if (!exclude) {
      return false;
    }

    if (Array.isArray(exclude)) {
      return exclude.includes(path);
    }

    if (typeof exclude === 'function') {
      return exclude(context);
    }

    return !!exclude;
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
  let manager = null;

  return async (context) => {
    if (context.params.batch && context.params.batch.manager) {
      return context;
    }

    if (!manager) {
      manager = new BatchManager(context.app, {
        batchService: context.app.get('batch').options.batchService,
        ...options
      });
    }

    context.params.batch = {
      ...context.params.batch,
      manager
    }

    console.log('Using: ', manager)

    return context;
  };
};

const batchClient = (options) => (app) => {
  if (typeof options.batchService !== 'string') {
    throw new Error('`batchService` name option must be passed to batchClient');
  }

  const defaultManager = new BatchManager(app, options);

  app.set('batch', { options, manager: defaultManager });

  const getManager = (context) => {
    const manager = context.params.batch && context.params.batch.manager;
    if (manager) {
      return manager;
    }
    return defaultManager;
  }

  const methods = ['get', 'find', 'create', 'update', 'patch', 'remove'];
  app.mixins.push(function (service) {
    if (service.name === options.batchService) {
      return;
    }
    methods.forEach((method) => {
      const oldMethod = service[method];
      if (!oldMethod) {
        return;
      }
      service[method] = async function (...args) {
        const context = getContext(app, service, method, args);
        const manager = getManager(context);
        if (await manager.isExcluded(context)) {
          return oldMethod.call(this, ...args);
        }
        return manager.batch(context);
      };
    });
  });
};

exports.BatchManager = BatchManager;
exports.batchClient = batchClient;
exports.batchHook = batchHook;
