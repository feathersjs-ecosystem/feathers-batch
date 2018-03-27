// babel-polyfill is required to avoid error:
//     ReferenceError: regeneratorRuntime is not defined
// It should be removed if no support for node js version below 7.6 is required.
// https://github.com/babel/babel/issues/5085
import 'babel-polyfill';
import async from 'async';
import errors from '@feathersjs/errors'

const paramsPositions = {
  find: 0,
  update: 2,
  patch: 2
};


export default function () {
  return {
    async create (data, params) {
      const type = data.type || 'parallel';

      if (Array.isArray(data.call) && !data.call.length) {
        return { type, results: [] };
      }

      if (!(data.call instanceof Object)) {
        throw new Error('Malformed "call" value, it must be an Array or an Object.');
      }

      // async.series or async.parallel
      const process = async[type];

      if (!process) {
        throw new Error(`Processing type "${data.type}" is not supported`);
      }

      let returnAs = data.return;
      if (!Array.isArray(data.call)) {
        returnAs = returnAs || 'object';
        data.call = Object.entries(data.call).map(pair => [pair[0]].concat(pair[1]))
      }
      returnAs = returnAs || 'array';

      const makeWorker = (call) => {
        const args = call.slice(0);
        const name = (returnAs === 'object') ? args.shift() : 'noname';
        const [ path, method ] = args.shift().split('::');
        const service = this.app.service(path);
        const position = typeof paramsPositions[method] !== 'undefined'
          ? paramsPositions[method] : 1;

        const runner = async () => {
          if (!service) {
            throw new errors.NotFound(`Service ${path} does not exist`);
          }

          if (!method || typeof service[method] !== 'function') {
            throw new errors.MethodNotAllowed(
              `Method ${method} on service ${path} does not exist`
            );
          }

          // Put the parameters into `query` and extend with original
          // service parameters (logged in user etc) just like a websocket call
          args[position] = Object.assign({}, params, { query: args[position] });

          // Call the service method
          return service[method](...args);
        };
        // async.asyncify should be removed if no support
        // for node js version below 7.6 is required,
        // because 'async' library supports native AsyncFunction.
        return async.asyncify(async () => {
          try {
            return [name, null, await runner()];
          } catch (e) {
            return [name, e];
          }
        });
      }

      const workers = data.call.map(makeWorker);

      return new Promise((resolve, reject) => {
        process(
          workers,
          (error, list) => {
            if (error) {
              reject(error);
            } else {
              const named = list.reduce((p, v) => (p[v.shift()] = v, p), {});
              resolve({
                type,
                data: (returnAs === 'object') ? named : list
              });
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
