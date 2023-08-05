const { BadRequest } = require('@feathersjs/errors');

const paramsPositions = {
  find: 0,
  get: 1,
  remove: 1,
  create: 1,
  update: 2,
  patch: 2
};

class BatchService {
  constructor (app) {
    this.app = app;
  }

  async create (data, params) {
    const { calls = [] } = data;
    const settledPromises = await Promise.allSettled(calls.map(async payload => {
      const [method, serviceName, ...args] = payload;
      const paramPosition = paramsPositions[method];
      const query = args[paramPosition] || {};
      const serviceParams = {
        ...params,
        query
      };

      const service = this.app.service(serviceName);

      if (paramPosition === undefined || typeof service[method] !== 'function') {
        throw new BadRequest(`Invalid method '${method}' on '${serviceName}'`);
      }

      args[paramPosition] = serviceParams;

      return service[method](...args);
    }));

    return settledPromises.map(current => {
      if (current.status === 'rejected') {
        const convertedError = typeof current.reason.toJSON === 'function'
          ? current.reason.toJSON()
          : { message: current.reason.message };

        return {
          ...current,
          reason: convertedError
        };
      }

      return current;
    });
  }

  setup () {
    if (typeof this.publish === 'function') {
      this.publish(() => false);
    }
  }
}

const batchServer = (options) => (app) => {
  if (typeof options.batchService !== 'string') {
    throw new Error('"batchService" is required in "batchServer" options');
  }
  app.use(options.batchService, new BatchService(app));
};

exports.BatchService = BatchService;
exports.batchServer = batchServer;
