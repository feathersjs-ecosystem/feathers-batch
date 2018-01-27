import async from 'async';

const paramsPositions = {
  find: 0,
  update: 2,
  patch: 2
};

export default function () {
  return {
    async create (data, params) {
      const type = data.type || 'parallel';

      if (!Array.isArray(data.call) || !data.call.length) {
        return { type, results: [] };
      }

      // async.series or async.parallel
      const process = async[type];

      if (!process) {
        throw new Error(`Processing type "${data.type}" is not supported`);
      }

      const workers = data.call.map(call => {
        const args = call.slice(0);
        const [ path, method ] = args.shift().split('::');
        const service = this.app.service(path);
        const position = typeof paramsPositions[method] !== 'undefined'
          ? paramsPositions[method] : 1;

        const runner = async () => {
          if (!service) {
            throw new Error(`Service ${path} does not exist`);
          }

          if (!method || typeof service[method] !== 'function') {
            throw new Error(
              `Method ${method} on service ${path} does not exist`
            );
          }

          // Put the parameters into `query` and extend with original
          // service parameters (logged in user etc) just like a websocket call
          args[position] = Object.assign({}, params, { query: args[position] });

          // Call the service method
          return service[method](...args);
        };
        return async.asyncify(async () => {
          try {
            return [null, await runner()];
          } catch (e) {
            return [e];
          }
        });
      });

      return new Promise((resolve, reject) => {
        process(
          workers,
          (error, data) => {
            if (error) {
              reject(error);
            } else {
              resolve({ type, data });
            }
          }
        );
      });
    },

    setup (app) {
      this.app = app;
    }
  };
}
