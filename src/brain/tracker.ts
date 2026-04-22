import { Shortcuts } from '@basmilius/homey-common';
import { HomeyAPI, HomeyAPIV3Local } from 'homey-api';
import { DEBUG_MODE, DEFAULT_SAMPLE_INTERVAL_MINUTES, SETTING_EXCLUDED_CAPABILITIES, SETTING_EXCLUDED_ZONES, SETTING_SAMPLE_INTERVAL } from '../const';
import type { CapabilityCategory, PulseApp } from '../types';

type HomeyDevice = HomeyAPIV3Local.ManagerDevices.Device;
type HomeyZone = HomeyAPIV3Local.ManagerZones.Zone;
type DeviceCapabilityInstance = { destroy(): void };

type AppHomeyAPI = HomeyAPIV3Local & {
    readonly devices: {
        getDevices(): Promise<Record<string, HomeyDevice>>;
        getDevice(opts: { id: string }): Promise<HomeyDevice>;
        on(event: 'device.create', listener: (device: HomeyDevice) => void): unknown;
        on(event: 'device.update', listener: (device: HomeyDevice) => void): unknown;
        on(event: 'device.delete', listener: (event: { id: string }) => void): unknown;
    };
    readonly zones: {
        getZones(): Promise<Record<string, HomeyZone>>;
        on(event: 'zone.create', listener: (zone: HomeyZone) => void): unknown;
        on(event: 'zone.update', listener: (zone: HomeyZone) => void): unknown;
        on(event: 'zone.delete', listener: (event: { id: string }) => void): unknown;
    };
};

/**
 * Tracks device capability changes across all Homey devices.
 *
 * Automatically classifies capabilities into categories and applies
 * appropriate logging strategies (every change vs. sampled interval).
 */
export default class Tracker extends Shortcuts<PulseApp> {
    /** Stores the last sampled value per device+capability to avoid duplicate measure logs. */
    readonly #lastSampled: Map<string, MeasureSample>;

    /** Device info cache keyed by device ID. */
    readonly #deviceCache: Map<string, DeviceInfo>;

    /** Zone name cache keyed by zone ID. */
    readonly #zoneNames: Map<string, string>;

    /** Active capability listener instances, keyed by device ID. */
    readonly #capabilityInstances: Map<string, DeviceCapabilityInstance[]>;

    #api: AppHomeyAPI | null = null;
    #sampleTimer: NodeJS.Timeout | null = null;
    #initialized = false;

    constructor(app: PulseApp) {
        super(app);
        this.#lastSampled = new Map();
        this.#deviceCache = new Map();
        this.#zoneNames = new Map();
        this.#capabilityInstances = new Map();
    }

    /**
     * Starts tracking all device capability changes.
     */
    async start(): Promise<void> {
        if (this.#initialized) {
            return;
        }

        this.#initialized = true;

        this.#api = await HomeyAPI.createAppAPI({
            homey: this.homey
        }) as AppHomeyAPI;

        await this.#loadZones();
        await this.#loadDevices();
        this.#registerListeners();
        this.#startSampleTimer();

        this.app.log(`Tracker started. Tracking ${this.#deviceCache.size} device(s) across ${this.#zoneNames.size} zone(s).`);
    }

    /**
     * Returns the currently tracked zones as id/name pairs, sorted by name.
     */
    getZones(): ReadonlyArray<{ readonly id: string; readonly name: string }> {
        return [...this.#zoneNames.entries()]
            .map(([id, name]) => ({id, name}))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Stops tracking, flushes pending samples, and cleans up timers.
     */
    stop(): void {
        this.flush();

        if (this.#sampleTimer) {
            clearInterval(this.#sampleTimer);
            this.#sampleTimer = null;
        }

        for (const instances of this.#capabilityInstances.values()) {
            for (const instance of instances) {
                try {
                    instance.destroy();
                } catch (err) {
                    this.app.error('Failed to destroy capability instance.', err);
                }
            }
        }

        this.#capabilityInstances.clear();
        this.#deviceCache.clear();
        this.#zoneNames.clear();

        this.#api = null;
        this.#initialized = false;
        this.app.log('Tracker stopped.');
    }

    /**
     * Immediately writes all buffered measure samples to the database,
     * regardless of the sample interval. Called during shutdown to prevent data loss.
     */
    flush(): void {
        for (const [, sample] of this.#lastSampled) {
            this.app.brain.database.insertCapabilityEvent(
                sample.deviceId,
                sample.deviceName,
                sample.zoneName,
                sample.capabilityId,
                sample.value
            );
        }

        if (this.#lastSampled.size > 0) {
            this.app.log(`Flushed ${this.#lastSampled.size} buffered measure sample(s).`);
        }

        this.#lastSampled.clear();
    }

    /**
     * Classifies a capability ID into a tracking category.
     *
     * @param capabilityId - The capability ID to classify.
     * @param getable - Whether the capability is getable.
     * @param setable - Whether the capability is setable.
     * @param type - The capability value type.
     */
    classifyCapability(capabilityId: string, getable: boolean, setable: boolean, type: string): CapabilityCategory {
        if (!getable) {
            return 'ignore';
        }

        if (capabilityId.startsWith('meter_')) {
            return 'meter';
        }

        if (capabilityId.startsWith('measure_')) {
            return 'measure';
        }

        if (capabilityId.startsWith('alarm_') || capabilityId === 'docked') {
            return 'event';
        }

        if (type === 'boolean' && setable) {
            return 'toggle';
        }

        if (type === 'enum' || type === 'string') {
            return 'state';
        }

        if (type === 'boolean' && !setable) {
            return 'event';
        }

        if (type === 'number' && setable) {
            return 'state';
        }

        return 'measure';
    }

    #registerListeners(): void {
        if (!this.#api) {
            return;
        }

        this.#api.devices.on('device.create', (device) => {
            this.#attachDevice(device);
        });

        this.#api.devices.on('device.update', (device) => {
            this.#detachDevice(device.id);
            this.#attachDevice(device);
        });

        this.#api.devices.on('device.delete', (event) => {
            this.#detachDevice(event.id);
        });

        this.#api.zones.on('zone.create', (zone) => {
            this.#zoneNames.set(zone.id, zone.name);
        });

        this.#api.zones.on('zone.update', (zone) => {
            this.#zoneNames.set(zone.id, zone.name);
        });

        this.#api.zones.on('zone.delete', (event) => {
            this.#zoneNames.delete(event.id);
        });
    }

    #onCapabilityChange(deviceId: string, capabilityId: string, value: unknown): void {
        if (value === undefined || value === null) {
            return;
        }

        const device = this.#deviceCache.get(deviceId);

        if (!device) {
            return;
        }

        const zoneName = this.#zoneNames.get(device.zoneId) ?? 'Unknown';

        if (DEBUG_MODE) {
            this.app.log(`[DEBUG] Capability change: ${device.name} (${zoneName}) / ${capabilityId} = ${String(value)}`);
        }

        // Check exclusions.
        if (this.#isZoneExcluded(zoneName)) {
            if (DEBUG_MODE) {
                this.app.log(`[DEBUG] Excluded by zone: ${device.name} (${zoneName}) / ${capabilityId}`);
            }
            return;
        }

        if (this.#isCapabilityExcluded(capabilityId)) {
            if (DEBUG_MODE) {
                this.app.log(`[DEBUG] Excluded by capability: ${device.name} / ${capabilityId}`);
            }
            return;
        }

        // Classify the capability.
        const capDef = device.capabilities[capabilityId];
        const category = this.classifyCapability(
            capabilityId,
            capDef?.getable ?? true,
            capDef?.setable ?? false,
            capDef?.type ?? 'string'
        );

        if (category === 'ignore') {
            if (DEBUG_MODE) {
                this.app.log(`[DEBUG] Ignored capability: ${device.name} / ${capabilityId} (not getable or not useful)`);
            }
            return;
        }

        // For measure capabilities, buffer and sample at interval.
        if (category === 'measure') {
            if (DEBUG_MODE) {
                this.app.log(`[DEBUG] Buffered measure sample: ${device.name} (${zoneName}) / ${capabilityId} = ${String(value)}`);
            }
            this.#updateMeasureSample(deviceId, capabilityId, String(value), device.name, zoneName);
            return;
        }

        // For everything else, log immediately.
        if (DEBUG_MODE) {
            this.app.log(`[DEBUG] Logging event [${category}]: ${device.name} (${zoneName}) / ${capabilityId} = ${String(value)}`);
        }

        this.app.brain.database.insertCapabilityEvent(
            deviceId,
            device.name,
            zoneName,
            capabilityId,
            String(value)
        );
    }

    /**
     * Flushes buffered measure samples that are older than the sample interval.
     */
    #flushMeasureSamples(): void {
        const now = Date.now();
        const intervalMs = this.#getSampleIntervalMs();
        let flushedCount = 0;

        for (const [, sample] of this.#lastSampled) {
            if (now - sample.flushedAt < intervalMs) {
                continue;
            }

            if (DEBUG_MODE) {
                this.app.log(`[DEBUG] Flushing measure sample: ${sample.deviceName} (${sample.zoneName}) / ${sample.capabilityId} = ${sample.value}`);
            }

            this.app.brain.database.insertCapabilityEvent(
                sample.deviceId,
                sample.deviceName,
                sample.zoneName,
                sample.capabilityId,
                sample.value
            );

            sample.flushedAt = now;
            flushedCount++;
        }

        if (DEBUG_MODE && flushedCount > 0) {
            this.app.log(`[DEBUG] Flushed ${flushedCount} measure sample(s).`);
        }
    }

    #updateMeasureSample(deviceId: string, capabilityId: string, value: string, deviceName: string, zoneName: string): void {
        const key = `${deviceId}::${capabilityId}`;
        const existing = this.#lastSampled.get(key);

        if (existing) {
            existing.value = value;
            existing.deviceName = deviceName;
            existing.zoneName = zoneName;
        } else {
            this.#lastSampled.set(key, {
                deviceId,
                deviceName,
                zoneName,
                capabilityId,
                value,
                flushedAt: 0
            });
        }
    }

    #startSampleTimer(): void {
        this.#sampleTimer = setInterval(() => {
            this.#flushMeasureSamples();
        }, this.#getSampleIntervalMs());
    }

    #getSampleIntervalMs(): number {
        const minutes = (this.settings.get(SETTING_SAMPLE_INTERVAL) as number | null) ?? DEFAULT_SAMPLE_INTERVAL_MINUTES;
        return minutes * 60_000;
    }

    #isZoneExcluded(zoneName: string): boolean {
        const excluded = (this.settings.get(SETTING_EXCLUDED_ZONES) as string[] | null) ?? [];
        return excluded.includes(zoneName);
    }

    #isCapabilityExcluded(capabilityId: string): boolean {
        const excluded = (this.settings.get(SETTING_EXCLUDED_CAPABILITIES) as string[] | null) ?? [];
        return excluded.some((pattern) => {
            if (pattern.endsWith('*')) {
                return capabilityId.startsWith(pattern.slice(0, -1));
            }
            return capabilityId === pattern;
        });
    }

    async #loadZones(): Promise<void> {
        if (!this.#api) {
            return;
        }

        try {
            const zones = await this.#api.zones.getZones();

            this.#zoneNames.clear();

            for (const zone of Object.values(zones)) {
                this.#zoneNames.set(zone.id, zone.name);
            }
        } catch (err) {
            this.app.error('Failed to load zones.', err);
        }
    }

    async #loadDevices(): Promise<void> {
        if (!this.#api) {
            return;
        }

        try {
            const devices = await this.#api.devices.getDevices();

            // Detach any previously attached devices before reloading.
            for (const deviceId of [...this.#capabilityInstances.keys()]) {
                this.#detachDevice(deviceId);
            }

            this.#deviceCache.clear();

            for (const device of Object.values(devices)) {
                this.#attachDevice(device);
            }
        } catch (err) {
            this.app.error('Failed to load devices.', err);
        }
    }

    #attachDevice(device: HomeyDevice): void {
        const info = this.#cacheDevice(device);
        const instances: DeviceCapabilityInstance[] = [];

        for (const [capabilityId, capDef] of Object.entries(info.capabilities)) {
            const category = this.classifyCapability(capabilityId, capDef.getable, capDef.setable, capDef.type);

            if (category === 'ignore') {
                continue;
            }

            try {
                const instance = device.makeCapabilityInstance(capabilityId, (value) => {
                    this.#onCapabilityChange(device.id, capabilityId, value);
                });
                instances.push(instance);
            } catch (err) {
                this.app.error(`Failed to attach capability listener for ${device.id} / ${capabilityId}.`, err);
            }
        }

        this.#capabilityInstances.set(device.id, instances);
    }

    #detachDevice(deviceId: string): void {
        const instances = this.#capabilityInstances.get(deviceId);

        if (instances) {
            for (const instance of instances) {
                try {
                    instance.destroy();
                } catch (err) {
                    this.app.error(`Failed to destroy capability instance for ${deviceId}.`, err);
                }
            }
            this.#capabilityInstances.delete(deviceId);
        }

        this.#deviceCache.delete(deviceId);

        // Drop any buffered measure samples for this device.
        for (const key of [...this.#lastSampled.keys()]) {
            if (key.startsWith(`${deviceId}::`)) {
                this.#lastSampled.delete(key);
            }
        }
    }

    #cacheDevice(device: HomeyDevice): DeviceInfo {
        const capabilities: Record<string, CapabilityDef> = {};
        const capabilitiesObj = (device as unknown as { capabilitiesObj: Record<string, RawCapabilityDef> | null }).capabilitiesObj;

        if (capabilitiesObj) {
            for (const [capabilityId, capDef] of Object.entries(capabilitiesObj)) {
                capabilities[capabilityId] = {
                    type: capDef.type ?? 'string',
                    getable: capDef.getable ?? true,
                    setable: capDef.setable ?? false
                };
            }
        }

        const info: DeviceInfo = {
            name: (device as unknown as { name: string }).name ?? 'Unknown',
            zoneId: (device as unknown as { zone: string }).zone ?? '',
            capabilities
        };

        this.#deviceCache.set(device.id, info);
        return info;
    }
}

type DeviceInfo = {
    readonly name: string;
    readonly zoneId: string;
    readonly capabilities: Record<string, CapabilityDef>;
};

type CapabilityDef = {
    readonly type: string;
    readonly getable: boolean;
    readonly setable: boolean;
};

type RawCapabilityDef = {
    readonly type?: string;
    readonly getable?: boolean;
    readonly setable?: boolean;
};

type MeasureSample = {
    readonly deviceId: string;
    deviceName: string;
    zoneName: string;
    readonly capabilityId: string;
    value: string;
    flushedAt: number;
};
