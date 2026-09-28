import { describe, it, expect } from 'vitest';
import { extractPaymentDirective, isPaymentGrounded, decodeImageResponse } from '../paymentScreenshot';

// Minimal valid PNG: 8-byte signature is enough for the magic-byte check.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

describe('extractPaymentDirective', () => {
  it('parses a valid directive and strips it from the outgoing text', () => {
    const parts = [
      'SEND_PAYMENT_SS: {"amount":"5000","to_address":"upi@bank","payment_method":"upi"}',
      'sent bro',
    ];
    const { params, cleanedParts } = extractPaymentDirective(parts);
    expect(params).toEqual({
      amount: '5000',
      to_address: 'upi@bank',
      payment_method: 'upi',
      to_id: undefined,
      order_id: undefined,
    });
    expect(cleanedParts).toEqual(['sent bro']); // directive never leaks
  });

  it('handles the directive as the first line of a multi-line part', () => {
    const parts = ['SEND_PAYMENT_SS: {"amount":"10","to_address":"bc1xyz"}\ndone check'];
    const { params, cleanedParts } = extractPaymentDirective(parts);
    expect(params?.amount).toBe('10');
    expect(cleanedParts).toEqual(['done check']);
  });

  it('rejects params when a required field is missing but still strips the line', () => {
    const parts = ['SEND_PAYMENT_SS: {"amount":"5000"}', 'ok'];
    const { params, cleanedParts } = extractPaymentDirective(parts);
    expect(params).toBeNull();
    expect(cleanedParts).toEqual(['ok']);
  });

  it('drops placeholder junk ("nil"/"null") in optional fields', () => {
    const parts = ['SEND_PAYMENT_SS: {"amount":"150","to_address":"0xabc123","to_id":"nil","order_id":"N/A","payment_method":"USDT"}'];
    const { params } = extractPaymentDirective(parts);
    expect(params).toEqual({
      amount: '150',
      to_address: '0xabc123',
      to_id: undefined,
      order_id: undefined,
      payment_method: 'USDT',
    });
  });

  it('rejects when a required field is the placeholder "nil"', () => {
    const parts = ['SEND_PAYMENT_SS: {"amount":"150","to_address":"nil"}'];
    const { params } = extractPaymentDirective(parts);
    expect(params).toBeNull();
  });

  it('strips a malformed directive line so it can never reach the target', () => {
    const parts = ['SEND_PAYMENT_SS: {broken json', 'yo'];
    const { params, cleanedParts } = extractPaymentDirective(parts);
    expect(params).toBeNull();
    expect(cleanedParts).toEqual(['yo']);
    expect(cleanedParts.join(' ')).not.toContain('SEND_PAYMENT_SS');
  });

  it('leaves ordinary replies untouched', () => {
    const parts = ['hey', 'whats the address'];
    const { params, cleanedParts } = extractPaymentDirective(parts);
    expect(params).toBeNull();
    expect(cleanedParts).toEqual(['hey', 'whats the address']);
  });

  it('image-only reply (directive with no accompanying text) yields empty text', () => {
    const parts = ['SEND_PAYMENT_SS: {"amount":"1","to_address":"x@y"}'];
    const { params, cleanedParts } = extractPaymentDirective(parts);
    expect(params?.to_address).toBe('x@y');
    expect(cleanedParts).toEqual([]);
  });
});

describe('isPaymentGrounded', () => {
  const params = { amount: '5000', to_address: 'scammer@okhdfc' };

  it('accepts a destination that appears in the conversation', () => {
    const convo = 'ok send to scammer@okhdfc\ngot it, paying now';
    expect(isPaymentGrounded(params, convo)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isPaymentGrounded(params, 'pay to SCAMMER@OKHDFC now')).toBe(true);
  });

  it('rejects a hallucinated destination not present in the conversation', () => {
    const convo = 'hey you there? send the money already';
    expect(isPaymentGrounded(params, convo)).toBe(false);
  });

  it('rejects an implausibly short destination', () => {
    expect(isPaymentGrounded({ amount: '1', to_address: 'ab' }, 'ab cd ef')).toBe(false);
  });
});

describe('decodeImageResponse', () => {
  it('passes through raw image bytes', () => {
    expect(decodeImageResponse(PNG).equals(PNG)).toBe(true);
  });

  it('extracts base64 image from a Lambda-proxy JSON wrapper', () => {
    const wrapper = JSON.stringify({ statusCode: 200, headers: {}, body: PNG.toString('base64') });
    expect(decodeImageResponse(Buffer.from(wrapper)).equals(PNG)).toBe(true);
  });

  it('decodes a bare base64 string', () => {
    expect(decodeImageResponse(Buffer.from(PNG.toString('base64'))).equals(PNG)).toBe(true);
  });

  it('throws on a response that is not a recognizable image', () => {
    expect(() => decodeImageResponse(Buffer.from('{"error":"nope"}'))).toThrow(/not a recognizable image/);
    expect(() => decodeImageResponse(Buffer.from('plain text error'))).toThrow(/not a recognizable image/);
  });
});
