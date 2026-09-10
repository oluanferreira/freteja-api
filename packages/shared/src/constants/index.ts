// Pricing constants (PRD FR-004)
export const PRICING = {
  BASE_FEE: 15.00,
  PER_KM_SHORT: 2.50,   // 0-10km
  PER_KM_MEDIUM: 2.00,  // 10-30km
  PER_KM_LONG: 1.50,    // 30km+
  VEHICLE_MULTIPLIER: {
    moto: 0.40,
    carro: 1.0,
    utilitario: 1.3,
    van: 1.5,
    caminhao: 2.0,
  },
  HELP_LOADING_FEE: 20.00,
  NIGHT_SURCHARGE: 0.30, // +30%
  NIGHT_START_HOUR: 22,
  NIGHT_END_HOUR: 6,
  BASE_FEE_MOTO: 3.00,
  PER_KM_MOTO: 1.20,
  MIN_DISTANCE_MOTO: 2,
} as const;

// Commission
export const COMMISSION = {
  RATE: 0.12,           // 12%
  MINIMUM: 3.00,        // R$ 3.00 minimum
} as const;

// Matching
export const MATCHING = {
  INITIAL_RADIUS_KM: 10,
  EXPANDED_RADIUS_KM: 20,
  MAX_RADIUS_KM: 30,
  EXPAND_AFTER_MINUTES: 5,
  MAX_EXPAND_AFTER_MINUTES: 10,
  TIMEOUT_MINUTES: 15,
} as const;

// GPS Tracking
export const TRACKING = {
  UPDATE_INTERVAL_MS: 5000, // 5 seconds
} as const;

// Payment
export const PAYMENT = {
  CASH_DEBT_LIMIT: 100.00,    // R$ 100 max debt
  CASH_DEBT_DAYS_LIMIT: 15,   // 15 days max
  CASH_CONSOLIDATE_AFTER: 5,  // Consolidate after 5 cash rides
  MIN_WITHDRAWAL: 20.00,      // R$ 20 minimum withdrawal
  ABACATEPAY_FEE: 0.80,       // R$ 0.80 per transaction
} as const;

// Ride status flow
export const RIDE_STATUS_FLOW = {
  pending: ['accepted', 'cancelled'],
  accepted: ['collecting', 'cancelled'],
  collecting: ['in_transit', 'cancelled'],
  in_transit: ['delivering'],
  delivering: ['completed'],
  completed: [],
  cancelled: [],
} as const;
