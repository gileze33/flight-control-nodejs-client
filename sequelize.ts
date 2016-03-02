/**
 * Hooks into sequelize connection object and creates a new transaction for every query.
 */
import fc = require('./index');

function beforeHook(model, action, values, options) {
  var parent = options.fcTransaction;
  options._fcQueryTransaction = fc.createTransaction('sequelize.' + model + '.' + action, parent);
  options._fcQueryTransaction.setData({
    where: options.where,
    order: options.order,
    limit: options.limit,
    offset: options.offset,
    include: options.include,
  });
}

function afterHook(model, action, instance, options) {
  if (options._fcQueryTransaction) {
    if (typeof instance === 'number') {
      options._fcQueryTransaction.data.response = instance;
    } else {
      var rows = 0;
      if (instance) {
        rows = Array.isArray(instance) ? instance.length : 1;
      }
      options._fcQueryTransaction.data.response = {
        rows: rows,
      };
    }

    options._fcQueryTransaction.end();
  }
}

var singleParam = [
  'beforeBulkDestroy',
  'afterBulkDestroy',
  'beforeBulkRestore',
  'afterBulkRestore',
  'beforeBulkUpdate',
  'afterBulkUpdate',
  'beforeFind',
];

/**
 * Usage:
 *     var sequelize = new Sequelize(...);
 *     sequelizeFCHook(sequelize);
 */
export = function sequelizeFCHook(sequelize) {
  sequelize.addHook('beforeDefine', function beforeDefine(attributes, options) {
    var model = options.modelName;
    options.hooks = options.hooks || {};

    [
      'create',
      'destroy',
      'restore',
      'update',
      'bulkCreate',
      'bulkDestroy',
      'bulkRestore',
      'bulkUpdate',
      'find',
      'sync',
    ].forEach(function forEachHooks(action) {
      var actionCap = action.substr(0, 1).toUpperCase() + action.substr(1);

      var before = 'before' + actionCap;
      var after = 'after' + actionCap;

      options.hooks[before] = options.hooks[before] || [];
      options.hooks[before] = Array.isArray(options.hooks[before]) ? options.hooks[before] : [options.hooks[before]];
      options.hooks[before].unshift({
        name: 'fc',
        fn: singleParam.indexOf(before) > -1 ? beforeHook.bind(null, model, action, null) : beforeHook.bind(null, model, action),
      });

      options.hooks[after] = options.hooks[after] || [];
      options.hooks[after] = Array.isArray(options.hooks[after]) ? options.hooks[after] : [options.hooks[after]];
      options.hooks[after].unshift({
        name: 'fc',
        fn: singleParam.indexOf(after) > -1 ? afterHook.bind(null, model, action, null) : afterHook.bind(null, model, action),
      });
    });
  });
};
