import type App from './index';

export type PulseApp = App;

/**
 * A logged capability change event stored in the database.
 */
export type CapabilityEvent = {
    readonly id: number;
    readonly deviceId: string;
    readonly deviceName: string;
    readonly zoneName: string;
    readonly capability: string;
    readonly value: string;
    readonly timestamp: number;
};

/**
 * A manually logged event stored in the database.
 */
export type CustomEvent = {
    readonly id: number;
    readonly category: string;
    readonly message: string;
    readonly source: string;
    readonly timestamp: number;
};

/**
 * An AI-generated summary stored in the database.
 */
export type Summary = {
    readonly id: number;
    readonly date: string;
    readonly content: string;
    readonly eventCount: number;
    readonly createdAt: number;
};

/**
 * Describes a capability's tracking behavior.
 */
export type CapabilityCategory =
    | 'event'     // Boolean sensors/alarms — log every change.
    | 'toggle'    // Settable booleans (onoff, locked) — log every change.
    | 'state'     // Enums (thermostat_mode, etc.) — log every change.
    | 'measure'   // Continuous measurements — sample at interval.
    | 'meter'     // Cumulative counters — log every change.
    | 'ignore';   // Not getable or not useful — skip.
