import {expect} from 'chai';
import {wrapAsync} from '../index';
import * as Bluebird from 'bluebird';

describe('#wrapAsync', () => {
  it('input and output are not affected', () => {
    const fn = wrapAsync('test', a => {
      expect(a).to.equal(1);
      return Bluebird.resolve(2);
    });

    return fn(1).then(b => {
      expect(b).to.equal(2);
    });
  });

  it('logs result');
  it('logs errors');
});
