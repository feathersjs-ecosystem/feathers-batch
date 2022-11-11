const { NotFound, BadRequest } = require('@feathersjs/errors');

const paramsPositions = {
  find: 0,
  get: 1,
  remove: 1,
  create: 1,
  update: 2,
  patch: 2
};

exports.BatchService = class BatchService {
  constructor (app) {
    this.app = app;
  }

  async create ({ calls = [] }, { __convertJSON = true, ...params }) {
    const settledPromises = await Promise.allSettled(calls.map(async payload => {
      if (typeof payload === 'object' && typeof payload.then === 'function') {
        return payload;
      }

      const [method, serviceName, ...args] = payload;
      const paramPosition = paramsPositions[method];
      const query = args[paramPosition] || {};
      const serviceParams = {
        ...params,
        query
      };

      const service = this.app.service(serviceName);

      if (!service) {
        throw new NotFound(`Invalid service ${serviceName}`);
      }

      if (paramPosition === undefined || typeof service[method] !== 'function') {
        throw new BadRequest(`Invalid method ${method} on ${serviceName}`);
      }

      args[paramPosition] = serviceParams;

      return service[method](...args);
    }));

    if (__convertJSON) {
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

    return settledPromises;
  }

  async all (calls) {
    const settledPromises = await this.create(
      { calls },
      { __convertJSON: false }
    );
    const results = [];
    settledPromises.forEach(current => {
      if (current.status === 'rejected') {
        throw current.reason;
      }
      results.push(current.value);
    });
    return results;
  }

  async allSettled (calls) {
    return this.create({ calls }, { __convertJSON: false });
  }

  setup () {
    if (typeof this.publish === 'function') {
      this.publish(() => false);
    }
  }
};
