"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateSuggestedPrice = calculateSuggestedPrice;
exports.calculateCommission = calculateCommission;
exports.isNightTime = isNightTime;
const index_1 = require("../constants/index");
/**
 * Calculate suggested price for a ride based on distance and vehicle type.
 * PRD FR-004.1
 */
function calculateSuggestedPrice(distanceKm, vehicleType, options) {
    let price;
    if (vehicleType === 'moto') {
        // Moto uses dedicated formula: BASE_FEE_MOTO + distance * PER_KM_MOTO
        const effectiveDistance = Math.max(distanceKm, index_1.PRICING.MIN_DISTANCE_MOTO);
        price = index_1.PRICING.BASE_FEE_MOTO + effectiveDistance * index_1.PRICING.PER_KM_MOTO;
    }
    else {
        // Standard formula with tiered distance pricing
        price = index_1.PRICING.BASE_FEE;
        // Distance-based pricing (tiered)
        if (distanceKm <= 10) {
            price += distanceKm * index_1.PRICING.PER_KM_SHORT;
        }
        else if (distanceKm <= 30) {
            price += 10 * index_1.PRICING.PER_KM_SHORT;
            price += (distanceKm - 10) * index_1.PRICING.PER_KM_MEDIUM;
        }
        else {
            price += 10 * index_1.PRICING.PER_KM_SHORT;
            price += 20 * index_1.PRICING.PER_KM_MEDIUM;
            price += (distanceKm - 30) * index_1.PRICING.PER_KM_LONG;
        }
        // Vehicle multiplier
        price *= index_1.PRICING.VEHICLE_MULTIPLIER[vehicleType];
    }
    // Help loading fee
    if (options?.helpLoading) {
        price += index_1.PRICING.HELP_LOADING_FEE;
    }
    // Night surcharge
    if (options?.isNightTime) {
        price *= (1 + index_1.PRICING.NIGHT_SURCHARGE);
    }
    // Round to 2 decimal places
    return Math.round(price * 100) / 100;
}
/**
 * Calculate commission amount for a ride.
 */
function calculateCommission(ridePrice) {
    const commission = ridePrice * index_1.COMMISSION.RATE;
    return Math.max(commission, index_1.COMMISSION.MINIMUM);
}
/**
 * Check if current time is night time (22h-6h).
 */
function isNightTime(date = new Date()) {
    const hour = date.getHours();
    return hour >= index_1.PRICING.NIGHT_START_HOUR || hour < index_1.PRICING.NIGHT_END_HOUR;
}
//# sourceMappingURL=index.js.map