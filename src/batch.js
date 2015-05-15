//import commons from 'feathers-commons';

function each(obj, cb) {
  Object.keys(obj).forEach(key => cb(obj[key], key));
}

// Wraps the arguments for a single call
function wrapSingleCall(callData) {
  if(callData.filter(Array.isArray).length !== callData.length) {
    return [ callData ];
  }

  return callData;
}

function wrapAll(data) {
  let result = {};
  each(data, (value, key) => result[key] = wrapSingleCall(value));
  return result;
}

function getTotal(data) {
  let total = 0;
  each(data, data => total += data.length);
  return total;
}

export default function() {
  return {
    create(data, params, callback) {
      data = wrapAll(data);

      let result = {};
      let total = getTotal(data);
      let processed = 0;

      if(total === 0) {
        // If there is nothing to do call back right away
        return callback(null, result);
      }

      Object.keys(data).forEach(call => {
        let [ path, method ] = call.split('::');
        let service = this.app.service(path);
        let callData = data[call];
        let results = result[call] = [];

        callData.forEach((args, index) => {
          // commons.getAguments(method, args)
          service[method](...args, function() {
            results[index] = Array.from(arguments);
            processed++;

            if(total === processed) {
              callback(null, result);
            }
          });
        });
      });

    },

    setup(app) {
      this.app = app;
    }
  };
}
