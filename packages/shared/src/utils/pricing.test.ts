import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSuggestedPrice, calculateCommission, isNightTime } from './index';

describe('calculateSuggestedPrice', () => {
  it('should calculate base fee + short distance for carro', () => {
    const price = calculateSuggestedPrice(5, 'carro');
    // Base R$15 + 5km * R$2.50 = R$27.50
    assert.equal(price, 27.50);
  });

  it('should apply medium distance tier correctly', () => {
    const price = calculateSuggestedPrice(20, 'carro');
    // Base R$15 + 10km * R$2.50 + 10km * R$2.00 = R$15 + R$25 + R$20 = R$60
    assert.equal(price, 60.00);
  });

  it('should apply long distance tier correctly', () => {
    const price = calculateSuggestedPrice(40, 'carro');
    // Base R$15 + 10*2.50 + 20*2.00 + 10*1.50 = 15 + 25 + 40 + 15 = R$95
    assert.equal(price, 95.00);
  });

  it('should apply vehicle multiplier for caminhao', () => {
    const price = calculateSuggestedPrice(5, 'caminhao');
    // (15 + 5*2.50) * 2.0 = 27.50 * 2 = R$55
    assert.equal(price, 55.00);
  });

  it('should add help loading fee', () => {
    const price = calculateSuggestedPrice(5, 'carro', { helpLoading: true });
    // 15 + 5*2.50 + 20 = R$47.50
    assert.equal(price, 47.50);
  });

  it('should apply night surcharge (+30%)', () => {
    const price = calculateSuggestedPrice(5, 'carro', { isNightTime: true });
    // (15 + 5*2.50) * 1.30 = 27.50 * 1.30 = R$35.75
    assert.equal(price, 35.75);
  });

  // Moto pricing tests (dedicated formula: 3.00 + km * 1.20)
  it('should calculate moto price for 3 km', () => {
    const price = calculateSuggestedPrice(3, 'moto');
    // 3.00 + 3 * 1.20 = R$6.60
    assert.equal(price, 6.60);
  });

  it('should calculate moto price for 5 km', () => {
    const price = calculateSuggestedPrice(5, 'moto');
    // 3.00 + 5 * 1.20 = R$9.00
    assert.equal(price, 9.00);
  });

  it('should calculate moto price for 10 km', () => {
    const price = calculateSuggestedPrice(10, 'moto');
    // 3.00 + 10 * 1.20 = R$15.00
    assert.equal(price, 15.00);
  });

  it('should apply night surcharge to moto (+30%)', () => {
    const price = calculateSuggestedPrice(5, 'moto', { isNightTime: true });
    // (3.00 + 5 * 1.20) * 1.30 = 9.00 * 1.30 = R$11.70
    assert.equal(price, 11.70);
  });

  it('should apply help loading fee to moto', () => {
    const price = calculateSuggestedPrice(5, 'moto', { helpLoading: true });
    // 3.00 + 5 * 1.20 + 20.00 = R$29.00
    assert.equal(price, 29.00);
  });

  it('should enforce minimum distance of 2 km for moto', () => {
    const price = calculateSuggestedPrice(1, 'moto');
    // 1 km < MIN_DISTANCE_MOTO (2), so charged as 2 km: 3.00 + 2 * 1.20 = R$5.40
    assert.equal(price, 5.40);
  });
});

describe('calculateCommission', () => {
  it('should calculate 12% commission', () => {
    const commission = calculateCommission(100);
    assert.equal(commission, 12.00);
  });

  it('should enforce minimum commission of R$3.00', () => {
    const commission = calculateCommission(10);
    // 10 * 0.12 = 1.20, but minimum is R$3.00
    assert.equal(commission, 3.00);
  });

  it('should return exact commission when above minimum', () => {
    const commission = calculateCommission(50);
    // 50 * 0.12 = R$6.00
    assert.equal(commission, 6.00);
  });
});

describe('isNightTime', () => {
  it('should return true at 22:00', () => {
    const date = new Date('2026-03-14T22:00:00');
    assert.equal(isNightTime(date), true);
  });

  it('should return true at 23:59', () => {
    const date = new Date('2026-03-14T23:59:00');
    assert.equal(isNightTime(date), true);
  });

  it('should return true at 05:00', () => {
    const date = new Date('2026-03-14T05:00:00');
    assert.equal(isNightTime(date), true);
  });

  it('should return false at 06:00', () => {
    const date = new Date('2026-03-14T06:00:00');
    assert.equal(isNightTime(date), false);
  });

  it('should return false at 12:00', () => {
    const date = new Date('2026-03-14T12:00:00');
    assert.equal(isNightTime(date), false);
  });

  it('should return false at 21:59', () => {
    const date = new Date('2026-03-14T21:59:00');
    assert.equal(isNightTime(date), false);
  });
});
