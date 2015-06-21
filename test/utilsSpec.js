import 'mocha';
import sinon from 'sinon';
import chai, {expect} from 'chai';
import sinonChai from 'sinon-chai';
import Utils from '../dist/js/utils';

chai.use(sinonChai)

describe('Utils', () => {

  /*
   * Result
   */
  describe('#result', () => {
    let obj;
    before(() => {
      obj = {
        val: true,
        func(result) { return result; }
      };
    });

    it('should return static values', () => {
      expect(Utils.result(obj, 'val')).to.be.true;
    });

    it('should return function results', () => {
      expect(Utils.result(obj, 'func', true)).to.be.true;
    });
  });

  /*
   * Extend
   */
  describe('#extend', () => {
    it('should return object when only arg', () => {
      expect(Utils.extend({key: true})).to.be.eql({key: true});
    });

    it('should extend subsequent objects', () => {
      const obj1 = {key1: true};
      const obj2 = {key2: true};
      expect(Utils.extend(obj1, obj2)).to.eql({
        key1: true,
        key2: true
      });
    });

    it('should override existing objects', () => {
      const obj1 = {key: true};
      const obj2 = {key: false};
      expect(Utils.extend(obj1, obj2)).to.eql({key: false});
    });

    it('should extend and override deeply', () => {
      const obj1 = {
        key1: {
          override: true
        }
      };
      const obj2 = {
        key1: {
          override: {
            key3: true
          }
        },
        key2: true
      };
      expect(Utils.extend(obj1, obj2)).to.eql({
        key1: {
          override: {
            key3: true
          }
        },
        key2: true
      });
    });
  });

  /*
   * Average
   */
  describe('#average', () => {
    it('should return NaN for empty list', () => {
      expect(Utils.average([])).to.eql(NaN);
    });

    it('should return average of list', () => {
      const list = [1, 2, 3, 4, 5];
      expect(Utils.average(list)).to.equal(3);
    });
  });

});
