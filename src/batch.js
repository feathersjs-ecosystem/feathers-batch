import async from 'async';
import commons from 'feathers-commons';

const paramsPositions = {
  find: 0,
  update: 2,
  patch: 2
};

function each(obj, cb) {
  Object.keys(obj).forEach(key => cb(obj[key], key));
}

function extend(target, ...others) {
  others.forEach(other => each(other, (val, prop) => target[prop] = val));
  return target;
}

export default function() {
  return {
    create(data, params, callback) {
      let type = data.type || 'parallel';

      if(!Array.isArray(data.call) || !data.call.length) {
        return callback(null, { type, results: [] });
      }

      // async.series or async.parallel
      let process = async[type];

      if(!process) {
        return callback(new Error(`Processing type "${data.type}" is not supported`));
      }

      let workers = data.call.map(call => {
        let args = call.slice(0);
        let [ path, method ] = args.shift().split('::');
        let service = this.app.service(path);
        let position = typeof paramsPositions[method] !== 'undefined' ?
          paramsPositions[method] : 1;

        args = commons.getArguments(method, args);

        return function(callback) {
          let handler = function() {
            callback(null, Array.from(arguments));
          };

          if(!service) {
            return handler(new Error(`Service ${path} does not exist`));
          }

          if(!method || typeof service[method] !== 'function') {
            return handler(new Error(`Method ${method} on
              service ${path} does not exist`));
          }

          // getArguments always adds a dummy callback to the end.
          args[args.length - 1] = handler;

          // Put the parameters into `query` and extend with original
          // service parameters (logged in user etc) just like a websocket call
          args[position] = extend({}, params, { query: args[position] });

          // Call the service method
          service[method](...args);
        };
      });

      process(workers, (error, data) => callback(error, { type, data }));
    },

    setup(app) {
      this.app = app;
    }
  };
}
