import type { VehicleType } from '../types/index';
/**
 * Calculate suggested price for a ride based on distance and vehicle type.
 * PRD FR-004.1
 */
export declare function calculateSuggestedPrice(distanceKm: number, vehicleType: VehicleType, options?: {
    helpLoading?: boolean;
    isNightTime?: boolean;
}): number;
/**
 * Calculate commission amount for a ride.
 */
export declare function calculateCommission(ridePrice: number): number;
/**
 * Check if current time is night time (22h-6h).
 */
export declare function isNightTime(date?: Date): boolean;
//# sourceMappingURL=index.d.ts.map