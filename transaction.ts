import logger = require('./logger');
const uuid = require('uuid');

class Transaction {
  id: string = uuid.v4();
  type: string;
  parent: string;

  private startTime: number = new Date().getTime();

  constructor(type: string, parent?: string | Transaction) {
    this.type = type;

    if (parent) {
      // support for passing in the parent transaction directly rather than needing the ID
      if (parent instanceof Transaction) {
        this.parent = parent.id;
      } else {
        this.parent = '' + parent;
      }
    }
  }

  data: any;
  setData(data) {
    this.data = data;
  }

  private time: number;
  end() {
    const endTime = new Date().getTime();

    this.time = endTime - this.startTime;
    this.startTime = null;

    logger.trace(this);
  }

  write(level: string, data: any & Object) {
    data.transaction = this.id;
    logger.write(level, data);
  }

  factory(type: string, parent: string | Transaction) {
    return new Transaction(type, parent);
  }

  promise(promise: Thenable) {
    return promise.then(() => {
      this.end();
    }, (err) => {
      this.write(err.level || 'error', err);
      throw err; // throw it back
    });
  }
}

export interface Thenable {
  then(onResolve: () => any, onReject: (err: any) => any);
}

export default Transaction;
