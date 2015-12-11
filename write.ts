import chalk = require('chalk');
import request = require('request');
import util = require('util');
import logger = require('./logger');
import opts from './options';
const circular = require('circular');

const kSystemHostname = require('os').hostname();
const kEnvironmentName = process.env.NODE_ENV || 'dev';

// method to attach constants to every trace and write
export function formatData(data) {
  var dataOut: any = {};

  // basic clone of data so we don't attach system and hostname to original obj
  for (var k in data) {
    dataOut[k] = data[k];
  }

  dataOut.timestamp = new Date().toString();
  dataOut.system = opts.sysIdent;
  dataOut.hostname = kSystemHostname;
  dataOut.env = kEnvironmentName;

  return dataOut;
}

export function prettyStack(stack) {
  var lines = stack.split('\n');
  lines.shift();

  return lines.map(function(line) {
    return line.indexOf('/node_modules/') > -1 || line.indexOf('(native)') > -1 ? chalk.black(line) : chalk.gray(line);
  }).join('\n');
}

/**
 * method to write directly to the console for local logging
 */
export function writeLocal(level, data) {
  if (level === 'error') {
    console.error(chalk.red(util.inspect(data)));
  }  else if (level === 'warning') {
    console.error(chalk.yellow(util.inspect(data)));
  }  else if (level === 'info') {
    console.log(chalk.cyan(util.inspect(data)));
  }  else {
    console.log(chalk.white(util.inspect(data)));
  }

  if (data && data.stack) {
    console.log(prettyStack(data.stack));
  } else if (data && data.exception && data.exception.stack) {
    console.log(prettyStack(data.exception.stack));
  }
}

export function trace(opts, transaction) {
  if (!opts) return;

  transaction = formatData(transaction);

  logger.commit('transaction', transaction);

  if (opts.traceLocal) writeLocal('trace', transaction);
}

export function commit(opts, type, obj: any & Object, done?: Function) {
  request({
    url: opts.base + '/' + type + '?key=' + opts.key,
    method: 'POST',
    body: JSON.stringify(obj, circular()),
    headers: {
      'content-type': 'application/json',
    },
  }, function(err/*, response, data*/) {
    if (done) done(err);
  });
}
