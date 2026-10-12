import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateId,
  generatePin,
  validateName,
  validateRollNumber,
  validateRoomName,
  validatePin,
  validateChatMessage,
  sanitizeInput,
} from '../dist/index.js';

describe('Shared Utilities', () => {
  describe('generateId', () => {
    it('should generate a 24-character ID', () => {
      const id = generateId();
      assert.equal(id.length, 24);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      assert.equal(ids.size, 100);
    });

    it('should only contain alphanumeric characters', () => {
      const id = generateId();
      assert.ok(/^[A-Za-z0-9]+$/.test(id));
    });
  });

  describe('generatePin', () => {
    it('should generate a 6-digit PIN', () => {
      const pin = generatePin();
      assert.equal(pin.length, 6);
      assert.ok(/^\d+$/.test(pin));
    });
  });

  describe('validateName', () => {
    it('should accept valid names', () => {
      assert.ok(validateName('Ali'));
      assert.ok(validateName('Ali Raza'));
      assert.ok(validateName('A'.repeat(60)));
    });

    it('should reject empty or short names', () => {
      assert.ok(!validateName(''));
      assert.ok(!validateName('A'));
    });

    it('should reject long names', () => {
      assert.ok(!validateName('A'.repeat(61)));
    });

    it('should handle whitespace-only names', () => {
      assert.ok(!validateName('   '));
    });
  });

  describe('validateRollNumber', () => {
    it('should accept valid roll numbers', () => {
      assert.ok(validateRollNumber('23-CS-104'));
      assert.ok(validateRollNumber('001'));
    });

    it('should reject short roll numbers', () => {
      assert.ok(!validateRollNumber('A'));
    });

    it('should reject long roll numbers', () => {
      assert.ok(!validateRollNumber('A'.repeat(31)));
    });
  });

  describe('validateRoomName', () => {
    it('should accept valid room names', () => {
      assert.ok(validateRoomName('CS-5A'));
      assert.ok(validateRoomName('Room 101'));
    });

    it('should reject short room names', () => {
      assert.ok(!validateRoomName('A'));
    });
  });

  describe('validatePin', () => {
    it('should accept valid 6-digit PINs', () => {
      assert.ok(validatePin('123456'));
      assert.ok(validatePin('000000'));
    });

    it('should reject non-digit PINs', () => {
      assert.ok(!validatePin('abcdef'));
      assert.ok(!validatePin('12345a'));
    });

    it('should reject wrong-length PINs', () => {
      assert.ok(!validatePin('12345'));
      assert.ok(!validatePin('1234567'));
    });
  });

  describe('validateChatMessage', () => {
    it('should accept valid messages', () => {
      assert.ok(validateChatMessage('Hello'));
      assert.ok(validateChatMessage('A'.repeat(1000)));
    });

    it('should reject empty messages', () => {
      assert.ok(!validateChatMessage(''));
    });

    it('should reject long messages', () => {
      assert.ok(!validateChatMessage('A'.repeat(1001)));
    });
  });

  describe('sanitizeInput', () => {
    it('should strip angle brackets', () => {
      assert.equal(sanitizeInput('<script>alert(1)</script>'), 'scriptalert(1)/script');
    });

    it('should trim whitespace', () => {
      assert.equal(sanitizeInput('  hello  '), 'hello');
    });

    it('should handle normal input', () => {
      assert.equal(sanitizeInput('Ali Raza'), 'Ali Raza');
    });
  });
});
