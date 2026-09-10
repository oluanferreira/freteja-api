export declare const PRICING: {
    readonly BASE_FEE: 15;
    readonly PER_KM_SHORT: 2.5;
    readonly PER_KM_MEDIUM: 2;
    readonly PER_KM_LONG: 1.5;
    readonly VEHICLE_MULTIPLIER: {
        readonly moto: 0.4;
        readonly carro: 1;
        readonly utilitario: 1.3;
        readonly van: 1.5;
        readonly caminhao: 2;
    };
    readonly HELP_LOADING_FEE: 20;
    readonly NIGHT_SURCHARGE: 0.3;
    readonly NIGHT_START_HOUR: 22;
    readonly NIGHT_END_HOUR: 6;
    readonly BASE_FEE_MOTO: 3;
    readonly PER_KM_MOTO: 1.2;
    readonly MIN_DISTANCE_MOTO: 2;
};
export declare const COMMISSION: {
    readonly RATE: 0.12;
    readonly MINIMUM: 3;
};
export declare const MATCHING: {
    readonly INITIAL_RADIUS_KM: 10;
    readonly EXPANDED_RADIUS_KM: 20;
    readonly MAX_RADIUS_KM: 30;
    readonly EXPAND_AFTER_MINUTES: 5;
    readonly MAX_EXPAND_AFTER_MINUTES: 10;
    readonly TIMEOUT_MINUTES: 15;
};
export declare const TRACKING: {
    readonly UPDATE_INTERVAL_MS: 5000;
};
export declare const PAYMENT: {
    readonly CASH_DEBT_LIMIT: 100;
    readonly CASH_DEBT_DAYS_LIMIT: 15;
    readonly CASH_CONSOLIDATE_AFTER: 5;
    readonly MIN_WITHDRAWAL: 20;
    readonly ABACATEPAY_FEE: 0.8;
};
export declare const RIDE_STATUS_FLOW: {
    readonly pending: readonly ["accepted", "cancelled"];
    readonly accepted: readonly ["collecting", "cancelled"];
    readonly collecting: readonly ["in_transit", "cancelled"];
    readonly in_transit: readonly ["delivering"];
    readonly delivering: readonly ["completed"];
    readonly completed: readonly [];
    readonly cancelled: readonly [];
};
//# sourceMappingURL=index.d.ts.map