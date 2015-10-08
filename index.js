var request = require('request');
var util = require('util');
var chalk = require('chalk');

var kSystemHostname = require('os').hostname();
var kEnvironmentName = process.env.NODE_ENV || 'dev';
var opts = null;
var middleware = [];


var Transaction = function Transaction(type, parent) {
    this.id = require('uuid').v4();
    this.type = type;
    this.parent = parent || null;
    this._startTime = new Date().getTime();
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

function prettyStack(stack) {
    var lines = stack.split('\n');
    lines.shift();

    return lines.map(function(line) {
        return line.indexOf('/node_modules/') > -1 ? chalk.black(line) : chalk.gray(line);
    }).join('\n');
}

// method to write directly to the console for local logging
function writeLocal(level, data) {
    var prettyLevel;
    if(level === 'error') {
        console.error(chalk.red(util.inspect(data)));
    }
    else if(level === 'warning') {
        console.error(chalk.yellow(util.inspect(data)));
    }
    else if(level === 'info') {
        console.log(chalk.cyan(util.inspect(data)));
    }
    else {
        console.log(chalk.white(util.inspect(data)));
    }

    if (data && data.stack) {
        console.log(prettyStack(data.stack));
    } else if (data && data.exception && data.exception.stack) {
        console.log(prettyStack(data.exception.stack));
    }
}

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
        if(req.headers['x-flight-control-parent']) {
            parentTransactionID = req.headers['x-flight-control-parent'];
        }

        req.transaction = logger.createTransaction('express', parentTransactionID);

        req.logger = {
            write: function(level, data) {
                var object = {};

                // basic clone of data so we don't attach these props to the obj
                for(var k in data) {
                    object[k] = data[k];
                }

                if(!object.headers) object.headers = req.headers;
                if(!object.method) object.method = req.method + ' ' + req.path;
                if(!object.params) object.params = req.params || {};
                if(!object.query) object.query = req.query || {};
                if(!object.body && typeof(req.body) !== 'undefined') object.body = req.body || {};

                req.transaction.write(level, object);
            }
        };

        res.on('finish', function() {
            req.transaction.setData({
                route: req.route.path,
                method: req.method,
                url: req.url,
                status: res.statusCode
            });

            req.transaction.end();
        });

        next();
    }, 

    // method should be like - function(req, res, transaction, next) {}
    use: function(method) {
        middleware.push(method);
    },
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