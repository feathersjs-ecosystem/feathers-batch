const { convert } = require('@feathersjs/errors');

class BatchManager {
  constructor (app, options) {
    this.app = app;
    this.batches = [];
    this.timeout = null;
    this.options = options;
  }

  addBatchCall (batch) {
    this.batches.push(batch);

    if (this.timeout === null) {
      this.timeout = setTimeout(() =>
        this.flush()
      , this.options.timeout || 50);
    }
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

const batchClient = options => app => {
  if (typeof options.batchService !== 'string') {
    throw new Error('`batchService` name option must be passed to batchClient');
  }

  const excludes = (options.exclude || []).concat(options.batchService);
  const manager = new BatchManager(app, options);
  const collectBatches = async context => {
    const { method, path } = context;

    if (excludes.includes(path)) {
      return context;
    }

    const args = makeArguments(context);
    const payload = [method, path, ...args];
    const batchPromise = new Promise((resolve, reject) => manager.addBatchCall({
      resolve,
      reject,
      payload
    }));

    context.result = await batchPromise;

    return context;
  };

  app.hooks({
    before: collectBatches
  });
};

exports.BatchManager = BatchManager;
exports.makeArguments = makeArguments;
exports.batchClient = batchClient;
