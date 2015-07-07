var request = require('request');
var async = require('async');

var kSystemHostname = require('os').hostname();
var kEnvironmentName = process.env.NODE_ENV || 'dev';
var opts = null;
var middleware = [];


var Transaction = function Transaction(type, parent) {
    this.id = require('uuid').v4();
    this.type = type;
    this.parent = parent || null;
    this._startTime = new Date().getTime();

    // support for passing in the parent transaction directly rather than needing the ID
    if(typeof(this.parent) === 'object' && this.parent != null) {
        if(typeof(this.parent.id) !== 'undefined') {
            this.parent = this.parent.id;
        }
    }
};
Transaction.prototype.setData = function setData(data) {
    this.data = data;
};
Transaction.prototype.end = function end() {
    var endTime = new Date().getTime();

    this.time = endTime - this._startTime; 
    delete this._startTime;

    logger.trace(this);
};
Transaction.prototype.write = function write(level, data) {
    data.transaction = this.id;

    logger.write(level, data);
};
Transaction.prototype.factory = function factory(type, parent) {
    return new Transaction(type, parent);
};


// method to write directly to the console for local logging
var writeLocal = function writeLocal(level, data) {
    var prettyLevel;
    if(level === 'error') {
        prettyLevel = level.red;
    }
    else if(level === 'warning') {
        prettyLevel = level.yellow;
    }
    else if(level === 'info') {
        prettyLevel = level.cyan;
    }
    else {
        prettyLevel = level.white;
    }

    console.log(prettyLevel, JSON.stringify(data));
};

// method to attach constants to every trace and write
var formatData = function(data) {
    var dataOut = {};

    // basic clone of data so we don't attach system and hostname to original obj
    for(var k in data) {
        dataOut[k] = data[k];
    }

    dataOut.timestamp = new Date().toString();
    dataOut.system = opts.sysIdent;
    dataOut.hostname = kSystemHostname;
    dataOut.env = kEnvironmentName;

    return dataOut;
};
var logger = {
    init: function(sysIdent, base, key) {
        opts = {
            sysIdent: sysIdent,
            base: base,
            key: key
        };
    },

    setWriteLocalEnabled: function(bool) {
        opts.writeLocal = bool || false;
    },
    setTraceLocalEnabled: function(bool) {
        opts.traceLocal = bool || false;
    },

    write: function(level, data) {
        if(!opts) return;

        var obj = {
            level: level,
            data: data
        };

        if(data.transaction) {
            obj.transaction = data.transaction;
        }

        obj = formatData(obj);

        logger.commit('log', obj);

        if(opts.writeLocal) writeLocal(level, obj);
    },

    trace: function(transaction) {
        if(!opts) return;

        transaction = formatData(transaction);

        logger.commit('transaction', transaction);

        if(opts.traceLocal) writeLocal('trace', transaction);
    },

    commit: function(type, obj) {
        request({
            url: opts.base + '/' + type + '?key=' + opts.key,
            method: 'POST',
            body: JSON.stringify(obj),
            headers: {
                'content-type': 'application/json'
            }
        }, function(err, response, data) {
            if(err) {
                return;
            }
        });
    },

    createTransaction: function(type, parent) {
        return new Transaction(type, parent);
    },

    express: function(req, res, next) {
        var parentTransactionID = null;
        if(req.headers['x-parent-transaction']) {
            parentTransactionID = req.headers['x-parent-transaction'];
        }

        req.transaction = logger.createTransaction('express', parentTransactionID);

        req.logger = {
            write: function(level, data) {
                var object = {};

                // basic clone of data so we don't attach these props to the obj
                for(var k in data) {
                    object[k] = data[k];
                }

                req.transaction.write(level, object);
            }
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
                    body: req.body
                },
                response: {
                    status: res.statusCode
                }
            });

            req.transaction.end();
        });

        next();
    },

    rabbitr: function(message, next) {
        var ack = message.ack;
        var reject = message.reject;
        var send = message.send;

        message.transaction = logger.createTransaction('Rabbitr', message.data._parentTransaction);
        delete message.data._parentTransaction;

        var trace = function(status) {
            message.transaction.setData({
                topic: message.topic,
                data: message.data,
                status: status
            });

            message.transaction.end();
        };

        // TODO - make these swizzles args less arbritrary

        // swizzle the ack and reject methods so they can trace once the message is complete
        message.ack = function(a1, a2, a3) {
            trace('ack');
            ack(a1, a2, a3);
        };
        message.reject = function(a1, a2, a3) {
            trace('reject');
            reject(a1, a2, a3);
        };

        // swizzle the send method to the message object so nested tracing can occur
        message.send = function(topic, data, cb) {
            // here we just attach the current transaction ID to the message data
            data._parentTransaction = message.transaction.id;

            send(topic, data, cb);
        };
    }
};

module.exports = logger;


// attach a generic exception handler to write to FlightControl
process.on('uncaughtException', function (err) {
    console.trace(err);

    logger.write('error', {
        type: 'exception',
        stack: err.stack,
        error: err
    }, function() {
        process.exit(1);
    });
});
console.log('Added generic exception handler for FlightControl logger\n');


module.exports = logger;