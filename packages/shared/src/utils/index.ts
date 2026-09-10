import { PRICING, COMMISSION } from '../constants/index';
import type { VehicleType } from '../types/index';

/**
 * Calculate suggested price for a ride based on distance and vehicle type.
 * PRD FR-004.1
 */
export function calculateSuggestedPrice(
  distanceKm: number,
  vehicleType: VehicleType,
  options?: {
    helpLoading?: boolean;
    isNightTime?: boolean;
  }
): number {
  let price: number;

  if (vehicleType === 'moto') {
    // Moto uses dedicated formula: BASE_FEE_MOTO + distance * PER_KM_MOTO
    const effectiveDistance = Math.max(distanceKm, PRICING.MIN_DISTANCE_MOTO);
    price = PRICING.BASE_FEE_MOTO + effectiveDistance * PRICING.PER_KM_MOTO;
  } else {
    // Standard formula with tiered distance pricing
    price = PRICING.BASE_FEE;

    // Distance-based pricing (tiered)
    if (distanceKm <= 10) {
      price += distanceKm * PRICING.PER_KM_SHORT;
    } else if (distanceKm <= 30) {
      price += 10 * PRICING.PER_KM_SHORT;
      price += (distanceKm - 10) * PRICING.PER_KM_MEDIUM;
    } else {
      price += 10 * PRICING.PER_KM_SHORT;
      price += 20 * PRICING.PER_KM_MEDIUM;
      price += (distanceKm - 30) * PRICING.PER_KM_LONG;
    }

    // Vehicle multiplier
    price *= PRICING.VEHICLE_MULTIPLIER[vehicleType];
  }

  // Help loading fee
  if (options?.helpLoading) {
    price += PRICING.HELP_LOADING_FEE;
  }

  // Night surcharge
  if (options?.isNightTime) {
    price *= (1 + PRICING.NIGHT_SURCHARGE);
  }

  // Round to 2 decimal places
  return Math.round(price * 100) / 100;
}

/**
 * Calculate commission amount for a ride.
 */
export function calculateCommission(ridePrice: number): number {
  const commission = ridePrice * COMMISSION.RATE;
  return Math.max(commission, COMMISSION.MINIMUM);
}

/**
 * Check if current time is night time (22h-6h).
 */
export function isNightTime(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= PRICING.NIGHT_START_HOUR || hour < PRICING.NIGHT_END_HOUR;
}
