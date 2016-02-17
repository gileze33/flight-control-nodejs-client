var fc = require('./index');
var objectAssign = require('object-assign');

function fcRabbitrMiddleware(message, next) {
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

module.exports = integrateFCWithRabbitr;
module.exports.middleware = fcRabbitrMiddleware;
