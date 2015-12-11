import {commit, writeLocal, formatData} from './write';
import opts, {setOptions} from './options';
import Transaction from './transaction';

const logger = {
  init(sysIdent, base, key) {
    setOptions({sysIdent, base, key});
  },

  setWriteLocalEnabled(bool: boolean) {
    setOptions({writeLocal: bool || false});
  },

  setTraceLocalEnabled(bool: boolean) {
    setOptions({traceLocal: bool || false});
  },

  write(level, data, done?) {
    if (!opts) return;

    var obj = {
      level,
      data,
      transaction: null,
    };

    if (data.transaction) {
      obj.transaction = data.transaction;
    }

    obj = formatData(obj);

    if (opts.writeLocal) writeLocal(level, obj);

    logger.commit('log', obj, done);
  },

  trace(transaction) {
    if (!opts) return;

    transaction = formatData(transaction);

    logger.commit('transaction', transaction);

    if (opts.traceLocal) writeLocal('trace', transaction);
  },

  commit(type, obj, done?: Function) {
    commit(opts, type, obj, done);
  },

  createTransaction(type, parent) {
    return new Transaction(type, parent);
  },

  express(req, res, next) {
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

    res.on('finish', function() {
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

    next();
  },

  rabbitr(message, next) {
    var _ack = message.ack;
    var _reject = message.reject;
    var _send = message.send;
    var _rpcExec = message.rpcExec;

    var transaction = logger.createTransaction('Rabbitr', message.data._parentTransaction);
    message.transaction = transaction;
    delete message.data._parentTransaction;
    message.logger = {
      write: transaction.write.bind(transaction),
    };

    var completed = false;
    var trace = function(status) {
      // prevent us tracing twice in case theres a race condition on the client
      if (completed) return;
      completed = true;

      message.transaction.setData({
        topic: message.topic,
        data: message.data,
        status: status,
      });

      message.transaction.end();
    };

    // swizzle the ack and reject methods so they can trace once the message is complete
    message.ack = function(a1, a2, a3) {
      trace('ack');
      _ack(a1, a2, a3);
    };

    message.reject = function(a1, a2, a3) {
      trace('reject');
      _reject(a1, a2, a3);
    };

    // swizzle the send method to the message object so nested tracing can occur
    message.send = function(topic, data, cb) {
      // here we just attach the current transaction ID to the message data
      data._parentTransaction = message.transaction.id;

      _send(topic, data, cb);
    };

    // swizzle the rpcExec method to the message object so nested tracing can occur
    message.rpcExec = function(topic, data, opts, cb) {
      // here we just attach the current transaction ID to the message data
      data._parentTransaction = message.transaction.id;

      _rpcExec(topic, data, opts, cb);
    };

    next();
  },
};

export = logger;
