import objectAssign = require('object-assign');
import chalk = require('chalk');
import request = require('request');
import util = require('util');
var circular = require('circular');

const kSystemHostname: string = require('os').hostname();
const kEnvironmentName: string = process.env.NODE_ENV || 'dev';
var opts = null;

function prettyStack(stack) {
  var lines = stack.split('\n');
  lines.shift();

  return lines.map(function (line) {
    return line.indexOf('/node_modules/') > -1 || line.indexOf('(native)') > -1 ? chalk.black(line) : chalk.gray(line);
  }).join('\n');
}

// method to write directly to the console for local logging
function writeLocal(level, data) {
  if (level === 'error') {
    console.error(chalk.red(util.inspect(data)));
  } else if (level === 'warning') {
    console.error(chalk.yellow(util.inspect(data)));
  } else if (level === 'info') {
    console.log(chalk.cyan(util.inspect(data)));
  } else {
    console.log(chalk.white(util.inspect(data)));
  }

  if (data && data.stack) {
    console.log(prettyStack(data.stack));
  } else if (data && data.exception && data.exception.stack) {
    console.log(prettyStack(data.exception.stack));
  }
}

// method to attach constants to every trace and write
function formatData(data) {
  // basic clone of data so we don't attach system and hostname to original obj
  const formatted = objectAssign({}, data, {
    timestamp: new Date().toString(),
    system: opts.sysIdent,
    hostname: kSystemHostname,
    env: kEnvironmentName,
  });

  return formatted;
}

namespace logger {
  export class Transaction {
    id: string = require('uuid').v4();
    type: string;
    parent: string;

    private _startTime = new Date().getTime();

    constructor(type: string, parent?: string | Transaction) {
      this.type = type;

      // support for passing in the parent transaction directly rather than needing the ID
      if (typeof parent === 'string') {
        this.parent = parent;
      } else if (parent && parent.id) {
        this.parent = parent.id;
      }
    }

    data: any;
    setData(data) {
      this.data = data;
    }

    /** duration */
    time: number;
    end() {
      const endTime = new Date().getTime();

      this.time = endTime - this._startTime;
      delete this._startTime;

      logger.trace(this);
    }

    write(level: string, data: any) {
      data.transaction = this.id;

      logger.write(level, data);
    }

    factory(type: string, parent?: string | Transaction) {
      return new Transaction(type, parent);
    }

    promise<T, P extends PromiseLike<T>>(promise: P): P {
      return promise.then(result => {
        this.end();
        return result; // don't swallow
      }, error => {
        this.write(error.level || 'error', error);
        this.end();
        throw error; // throw it back
      }) as P;
    }
  }

  export function init(sysIdent, base, key) {
    opts = {
      sysIdent: sysIdent,
      base: base,
      key: key,
    };
  }

  export function setWriteLocalEnabled(bool: boolean) {
    opts.writeLocal = bool || false;
  }

  export function setTraceLocalEnabled(bool: boolean) {
    opts.traceLocal = bool || false;
  }

  export function write(level: string, data, done?: Function) {
    if (!opts) return;

    const obj = {
      level,
      data,
      transaction: data.transaction || void 0,
    };

    const formatted = formatData(obj);

    if (opts.writeLocal) writeLocal(level, formatted);

    logger.commit('log', formatted, done);
  }

  export function trace(transaction) {
    if (!opts) return;

    transaction = formatData(transaction);

    logger.commit('transaction', transaction);

    if (opts.traceLocal) writeLocal('trace', transaction);
  }

  export function commit(type: string, obj, done?: Function) {
    request({
      url: opts.base + '/' + type + '?key=' + opts.key,
      method: 'POST',
      body: JSON.stringify(obj, circular()),
      headers: {
        'content-type': 'application/json',
      },
    }, function (err/*, response, data*/) {
      if (done) done(err);
    });
  }

  export function createTransaction(type: string, parent?: string | Transaction) {
    return new Transaction(type, parent);
  }

  export function express(req, res, next) {
    var parentTransactionID = null;
    if (req.headers['x-parent-transaction']) {
      parentTransactionID = req.headers['x-parent-transaction'];
    }

    req.transaction = logger.createTransaction('express', parentTransactionID);

    req.logger = {
      write(level, data) {
        var object = {};

        // basic clone of data so we don't attach these props to the obj
        for (var k in data) {
          object[k] = data[k];
        }

        req.transaction.write(level, object);
      },
    };

    res.on('finish', function () {
      req.transaction.setData({
        request: {
          route: (req.route) ? req.route.path : '',
          method: req.method,
          url: req.url,
          headers: req.headers,
          params: req.params,
          query: req.query,
          body: req.body,
        },
        response: {
          status: res.statusCode,
        },
      });

      req.transaction.end();
    });

    res.setHeader('X-FC-Transaction', req.transaction.id);

    next();
  }

  let _didWarnForRabbitr = false;
  export function rabbitr() {
    if (!_didWarnForRabbitr) {
      console.warn(new Error('You\'re using the old way of hooking FC with rabbitr.'));
      _didWarnForRabbitr = true;
    }
    return require('./rabbitr').middleware.apply(null, Array.prototype.slice.call(arguments));
  }

  export interface AsyncFunction { (...args): PromiseLike<any>; }
  /**
   * Wrap a function that returns a promise with a transaction.
   *
   * Returns a function that's identical to the wrapped one. You can also pass parent transactions
   *  in the context (`this` object) as `this.transaction`.
   */
  export function wrapAsync<Fn extends AsyncFunction>(name: string, fn: Fn): Fn {
    return function (...args) {
      const transaction = new Transaction(name, this && this.transaction);
      const promise = fn(...args);

      return promise && promise.then ? promise.then(result => {
        transaction.setData({ result, fulfilled: true });
        transaction.end();
        return result;
      }, error => {
        transaction.setData({ fulfilled: false });
        transaction.write(error && error.level || 'error', error);
        transaction.end();
        throw error;
      }) : promise;
    } as Fn;
  }
}

process.on('uncaughtException', function (err) {
  if (err.name === 'SyntaxError') throw err;
  writeLocal('error', {
    exception: err,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, p) => {
  writeLocal('warning', reason);
});

console.log('Added generic exception handler for FlightControl logger\n');

export = logger;
