const { convert, GeneralError } = require('@feathersjs/errors');

const has = (obj, path) => {
  return Object.prototype.hasOwnProperty.call(obj, path);
};

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
    method,
    path: service.name
  };

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
};

const isObject = (obj) => {
  return obj && typeof obj === 'object' && !Array.isArray(obj);
};

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
      keys.forEach((key) => {
        result[key] = value[key];
      });
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

  async batch (context) {
    const payload = getPayload(context);
    const dedupe = await this.dedupe(context);

    const batchPromise = new Promise((resolve, reject) => {
      this.batches.push({
        payload,
        dedupe,
        resolve,
        reject
      });
    });

    if (this.timeout === null) {
      this.timeout = setTimeout(() => this.flush(), this.options.timeout);
    }

    return batchPromise;
  }

  async flush () {
    const currentBatches = this.batches;
    const { batchService } = this.options;
    const calls = [];
    const resultIndexes = [];
    const keyMap = new Map();

    this.batches = [];
    this.timeout = null;

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

  async dedupe (context) {
    const params = context.params;
    let dedupe = this.options.dedupe;

    if (params.batch && has(params.batch, 'dedupe')) {
      dedupe = params.batch.dedupe;
    }

    if (typeof dedupe === 'function') {
      const result = await dedupe(context);
      return !!result;
    }

    return !!dedupe;
  }

  async exclude (context) {
    const path = context.path || context.service.name;
    const params = context.params;
    let exclude = this.options.exclude;

    if (path === this.options.batchService) {
      return true;
    }

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
      const result = await exclude(context);
      return !!result;
    }

    return !!exclude;
  }
}

const batchHook = (options) => {
  let manager = null;

  return async (context) => {
    if (context.params.batch && context.params.batch.manager) {
      return context;
    }

    if (!manager) {
      manager = new BatchManager(context.app, options);
    }

    context.params.batch = {
      ...context.params.batch,
      manager
    };

    return context;
  };
};

const batchClient = (options) => (app) => {
  if (typeof options.batchService !== 'string') {
    throw new Error('`batchService` name option must be passed to batchClient');
  }

  const defaultManager = new BatchManager(app, options);

  app.set('batchManager', defaultManager);

  const getManager = (context) => {
    const manager = context.params.batch && context.params.batch.manager;
    if (manager) {
      return manager;
    }
    return defaultManager;
  };

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
        if (await manager.exclude(context)) {
          return oldMethod.call(this, ...args);
        }
        oldMethod.call(this, ...args);
        return manager.batch(context);
      };
    });
  });
};

exports.BatchManager = BatchManager;
exports.batchClient = batchClient;
exports.batchHook = batchHook;
