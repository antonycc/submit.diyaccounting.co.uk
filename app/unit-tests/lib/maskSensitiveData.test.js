// app/unit-tests/lib/maskSensitiveData.test.js

import { describe, test, expect } from 'vitest';
import {
  maskIPAddress,
  maskDeviceID,
  maskGovClientHeaders,
  maskLogContext,
} from '@app/lib/maskSensitiveData.js';

describe('maskSensitiveData', () => {
  describe('maskIPAddress', () => {
    test('masks IPv4 address correctly', () => {
      expect(maskIPAddress('192.168.1.100')).toBe('192.168.xxx.xxx');
      expect(maskIPAddress('10.0.0.1')).toBe('10.0.xxx.xxx');
      expect(maskIPAddress('172.16.254.1')).toBe('172.16.xxx.xxx');
    });

    test('handles edge cases for IPv4', () => {
      expect(maskIPAddress('127.0.0.1')).toBe('127.0.xxx.xxx');
      expect(maskIPAddress('255.255.255.255')).toBe('255.255.xxx.xxx');
    });

    test('masks IPv6 address', () => {
      const result = maskIPAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(result).toBe('2001:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx');
    });

    test('handles null, undefined, and empty values', () => {
      expect(maskIPAddress(null)).toBe(null);
      expect(maskIPAddress(undefined)).toBe(undefined);
      expect(maskIPAddress('')).toBe('');
    });

    test('handles non-string inputs', () => {
      expect(maskIPAddress(123)).toBe(123);
      expect(maskIPAddress({})).toEqual({});
    });

    test('masks unrecognized formats', () => {
      const longString = 'some-long-identifier-value';
      const result = maskIPAddress(longString);
      expect(result).toContain('xxx');
      expect(result.length).toBeLessThan(longString.length);
    });
  });

  describe('maskDeviceID', () => {
    test('masks device ID correctly', () => {
      expect(maskDeviceID('abc123xyz789')).toBe('abc***789');
      expect(maskDeviceID('device-id-12345')).toBe('dev***345');
      expect(maskDeviceID('1234567890abcdef')).toBe('123***def');
    });

    test('does not mask short device IDs', () => {
      expect(maskDeviceID('short')).toBe('short');
      expect(maskDeviceID('abc123')).toBe('abc123');
      expect(maskDeviceID('12345678')).toBe('12345678');
    });

    test('handles null, undefined, and empty values', () => {
      expect(maskDeviceID(null)).toBe(null);
      expect(maskDeviceID(undefined)).toBe(undefined);
      expect(maskDeviceID('')).toBe('');
    });

    test('handles non-string inputs', () => {
      expect(maskDeviceID(123456789)).toBe(123456789);
      expect(maskDeviceID({})).toEqual({});
    });
  });

  describe('maskGovClientHeaders', () => {
    test('masks IP addresses in Gov-Client headers', () => {
      const headers = {
        'Gov-Client-Public-IP': '192.168.1.100',
        'Gov-Vendor-Public-IP': '10.0.0.1',
        'Gov-Client-User-Agent': 'Mozilla/5.0',
      };
      const masked = maskGovClientHeaders(headers);
      expect(masked['Gov-Client-Public-IP']).toBe('192.168.xxx.xxx');
      expect(masked['Gov-Vendor-Public-IP']).toBe('10.0.xxx.xxx');
      expect(masked['Gov-Client-User-Agent']).toBe('Mozilla/5.0');
    });

    test('masks device ID in Gov-Client headers', () => {
      const headers = {
        'Gov-Client-Device-ID': 'abc123xyz789device',
        'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
      };
      const masked = maskGovClientHeaders(headers);
      expect(masked['Gov-Client-Device-ID']).toBe('abc***ice');
      expect(masked['Gov-Client-Connection-Method']).toBe('WEB_APP_VIA_SERVER');
    });

    test('masks email addresses in Gov-Client-User-IDs', () => {
      const headers = {
        'Gov-Client-User-IDs': 'email=user@example.com,server=test-server',
      };
      const masked = maskGovClientHeaders(headers);
      expect(masked['Gov-Client-User-IDs']).toContain('us***@example.com');
      expect(masked['Gov-Client-User-IDs']).toContain('server=test-server');
    });

    test('handles null, undefined, and empty objects', () => {
      expect(maskGovClientHeaders(null)).toBe(null);
      expect(maskGovClientHeaders(undefined)).toBe(undefined);
      expect(maskGovClientHeaders({})).toEqual({});
    });

    test('does not modify headers without sensitive data', () => {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123',
      };
      const masked = maskGovClientHeaders(headers);
      expect(masked).toEqual(headers);
    });

    test('does not mutate original headers object', () => {
      const headers = {
        'Gov-Client-Public-IP': '192.168.1.100',
      };
      const originalIP = headers['Gov-Client-Public-IP'];
      maskGovClientHeaders(headers);
      expect(headers['Gov-Client-Public-IP']).toBe(originalIP);
    });
  });

  describe('maskLogContext', () => {
    test('masks IP addresses in log context', () => {
      const context = {
        message: 'Request received',
        clientIP: '192.168.1.100',
        method: 'POST',
      };
      const masked = maskLogContext(context);
      expect(masked.clientIP).toBe('192.168.xxx.xxx');
      expect(masked.message).toBe('Request received');
      expect(masked.method).toBe('POST');
    });

    test('masks device IDs in log context', () => {
      const context = {
        message: 'Device connected',
        deviceId: 'abc123xyz789device',
      };
      const masked = maskLogContext(context);
      expect(masked.deviceId).toBe('abc***ice');
    });

    test('masks headers in log context', () => {
      const context = {
        message: 'Headers received',
        headers: {
          'Gov-Client-Public-IP': '192.168.1.100',
          'Content-Type': 'application/json',
        },
      };
      const masked = maskLogContext(context);
      expect(masked.headers['Gov-Client-Public-IP']).toBe('192.168.xxx.xxx');
      expect(masked.headers['Content-Type']).toBe('application/json');
    });

    test('masks govClientHeaders in log context', () => {
      const context = {
        message: 'Gov client headers',
        govClientHeaders: {
          'Gov-Vendor-Public-IP': '10.0.0.1',
        },
      };
      const masked = maskLogContext(context);
      expect(masked.govClientHeaders['Gov-Vendor-Public-IP']).toBe('10.0.xxx.xxx');
    });

    test('handles alternative field names', () => {
      const context1 = { client_ip: '192.168.1.100' };
      const context2 = { ip: '10.0.0.1' };
      const context3 = { device_id: 'abc123xyz789' };
      const context4 = { deviceID: 'xyz789abc123' };

      expect(maskLogContext(context1).client_ip).toBe('192.168.xxx.xxx');
      expect(maskLogContext(context2).ip).toBe('10.0.xxx.xxx');
      expect(maskLogContext(context3).device_id).toBe('abc***789');
      expect(maskLogContext(context4).deviceID).toBe('xyz***123');
    });

    test('does not mutate original context object', () => {
      const context = {
        clientIP: '192.168.1.100',
        headers: {
          'Gov-Client-Public-IP': '10.0.0.1',
        },
      };
      const originalIP = context.clientIP;
      const originalHeaderIP = context.headers['Gov-Client-Public-IP'];
      
      maskLogContext(context);
      
      expect(context.clientIP).toBe(originalIP);
      expect(context.headers['Gov-Client-Public-IP']).toBe(originalHeaderIP);
    });

    test('handles null, undefined, and empty objects', () => {
      expect(maskLogContext(null)).toBe(null);
      expect(maskLogContext(undefined)).toBe(undefined);
      expect(maskLogContext({})).toEqual({});
    });
  });
});
