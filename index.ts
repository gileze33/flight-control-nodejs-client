import logger = require('./logger');

// attach a generic exception handler to write to FlightControl
process.on('uncaughtException', function(err) {
  console.trace();

  logger.write('error', {
    type: 'exception',
    stack: err.stack,
    error: err,
  }, function() {
    process.exit(1);
  });
});

console.log('Added generic exception handler for FlightControl logger\n');

module.exports = logger;
