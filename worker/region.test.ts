import assert from 'node:assert/strict';
import test from 'node:test';
import { getRegulatedRegion } from './region.ts';

test('returns false for confirmed countries outside the regulated region', () => {
  assert.equal(getRegulatedRegion({ country: 'AU', isEUCountry: '0' }), false);
  assert.equal(getRegulatedRegion({ country: 'KR', isEUCountry: '0' }), false);
  assert.equal(getRegulatedRegion({ country: 'US', isEUCountry: '0' }), false);
});

test('returns true for the United Kingdom, Switzerland, and Norway', () => {
  assert.equal(getRegulatedRegion({ country: 'GB', isEUCountry: '0' }), true);
  assert.equal(getRegulatedRegion({ country: 'CH', isEUCountry: '0' }), true);
  assert.equal(getRegulatedRegion({ country: 'NO', isEUCountry: '0' }), true);
});

test('returns true for EU members from either Cloudflare signal', () => {
  assert.equal(getRegulatedRegion({ country: 'DE', isEUCountry: '1' }), true);
  assert.equal(getRegulatedRegion({ country: 'FR' }), true);
});

test('returns null when Cloudflare region data is unavailable', () => {
  assert.equal(getRegulatedRegion(undefined), null);
  assert.equal(getRegulatedRegion(null), null);
  assert.equal(getRegulatedRegion({}), null);
  assert.equal(getRegulatedRegion({ country: null }), null);
});

test('returns null for unknown or invalid Cloudflare country codes', () => {
  assert.equal(getRegulatedRegion({ country: 'XX' }), null);
  assert.equal(getRegulatedRegion({ country: 'T1' }), null);
  assert.equal(getRegulatedRegion({ country: 'unknown' }), null);
});
