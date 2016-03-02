import fc = require('./index');
import objectAssign = require('object-assign');

import Rabbitr = require('rabbitr');

declare module 'rabbitr' {
  // extend rabbitr
  interface IMessage<TData> {
    logger?: any;
    transaction?: fc.Transaction;
  }
}

function fcRabbitrMiddleware(message: Rabbitr.IMessage<any>, next) {
  var _ack = message.ack;
  var _reject = message.reject;
  var _send = message.send;
  var _rpcExec = message.rpcExec;

  var transaction = fc.createTransaction('Rabbitr', message.data._parentTransaction);
  message.transaction = transaction;
  delete message.data._parentTransaction;
  message.logger = {
    write: transaction.write.bind(transaction),
  };

  var completed = false;
  var trace = function (status) {
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

  function preRun<T extends Function>(pre: Function, fn: T): T {
    return <any>((...args) => {
      pre(...args);
      return fn(...args);
    });
  }

  // swizzle the ack and reject methods so they can trace once the message is complete
  message.ack = preRun(() => trace('ack'), message.ack);
  message.reject = preRun(() => trace('reject'), message.reject);

  // swizzle the send method to the message object so nested tracing can occur
  message.send = preRun(
    (topic, data) =>
      // here we just attach the current transaction ID to the message data
      data._parentTransaction = message.transaction.id
    , message.send);

  // swizzle the rpcExec method to the message object so nested tracing can occur
  message.rpcExec = preRun(
    (topic, data) =>
      // here we just attach the current transaction ID to the message data
      data._parentTransaction = message.transaction.id
    , message.rpcExec);

  next();
}

function integrateFCWithRabbitr(rabbitr) {
  var _rpcExec = rabbitr.rpcExec;
  rabbitr.rpcExec = function rpcExecWithFC(topic, data, opts, callback) {
    if ('function' === typeof opts) {
      // shift arguments
      callback = opts;
      opts = {};
    }

    var parent = data._parentTransaction;
    var transaction = fc.createTransaction('rabbitr.rpcExec', parent);

    var trackedCallback = function (error, output) {
      transaction.setData({
        topic: topic,
        error: error,
      });
      transaction.end();
      callback(error, output);
    };

    var newData = objectAssign({}, data, {
      _parentTransaction: transaction.id,
    });

    return _rpcExec.call(this, topic, newData, opts, trackedCallback);
  };

  rabbitr.use(fcRabbitrMiddleware);
}
namespace integrateFCWithRabbitr {
  export var middleware = fcRabbitrMiddleware;
}

export = integrateFCWithRabbitr;
