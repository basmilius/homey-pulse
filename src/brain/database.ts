import { Shortcuts } from '@basmilius/homey-common';
import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import { DATABASE_PATH, DEBUG_MODE, DEFAULT_RETENTION_DAYS, SETTING_RETENTION_DAYS } from '../const';
import { getLocalDateString } from '../util';
import type { CapabilityEvent, CustomEvent, PulseApp, Summary } from '../types';

type SqlValue = string | number | null;

/**
 * SQLite database wrapper for persistent event and summary storage.
 *
 * Uses Node's built-in `node:sqlite` (available since Node 22) so we don't
 * have to ship a WASM-based SQLite runtime. Prepared statements are cached
 * per SQL string for repeated calls.
 */
export default class PulseDatabase extends Shortcuts<PulseApp> {
    #db: DatabaseSync | null = null;
    readonly #stmtCache = new Map<string, StatementSync>();

    constructor(app: PulseApp) {
        super(app);
    }

    /**
     * Opens the database and creates the schema if needed.
     */
    open(): void {
        this.#db = new DatabaseSync(DATABASE_PATH);

        this.#db.exec(`
            CREATE TABLE IF NOT EXISTS capability_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                device_name TEXT NOT NULL,
                zone_name TEXT NOT NULL,
                capability TEXT NOT NULL,
                value TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS custom_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                message TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT '',
                timestamp INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL,
                event_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_cap_events_timestamp ON capability_events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_cap_events_device ON capability_events(device_id, capability);
            CREATE INDEX IF NOT EXISTS idx_custom_events_timestamp ON custom_events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_summaries_date ON summaries(date);
        `);

        this.app.log('Database opened.');
    }

    /**
     * Closes the database connection.
     */
    close(): void {
        if (this.#db) {
            this.#stmtCache.clear();
            this.#db.close();
            this.#db = null;
            this.app.log('Database closed.');
        }
    }

    /**
     * Inserts a capability change event.
     *
     * @param deviceId - The Homey device ID.
     * @param deviceName - The human-readable device name.
     * @param zoneName - The zone the device belongs to.
     * @param capability - The capability ID (e.g. "alarm_motion").
     * @param value - The stringified capability value.
     */
    insertCapabilityEvent(deviceId: string, deviceName: string, zoneName: string, capability: string, value: string): void {
        if (DEBUG_MODE) {
            this.app.log(`[DEBUG] DB insert capability_event: ${deviceName} (${zoneName}) / ${capability} = ${value}`);
        }

        this.#prepare(
            'INSERT INTO capability_events (device_id, device_name, zone_name, capability, value, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(deviceId, deviceName, zoneName, capability, value, Date.now());
    }

    /**
     * Inserts a custom (user-logged) event.
     *
     * @param category - The event category.
     * @param message - The event description.
     * @param source - Optional source identifier.
     */
    insertCustomEvent(category: string, message: string, source: string = ''): void {
        if (DEBUG_MODE) {
            this.app.log(`[DEBUG] DB insert custom_event: [${category}] ${message}`);
        }

        this.#prepare(
            'INSERT INTO custom_events (category, message, source, timestamp) VALUES (?, ?, ?, ?)'
        ).run(category, message, source, Date.now());
    }

    /**
     * Returns all capability events within a time range.
     *
     * @param since - Start timestamp (inclusive).
     * @param until - End timestamp (exclusive). Defaults to now.
     */
    getCapabilityEvents(since: number, until: number = Date.now()): CapabilityEvent[] {
        const rows = this.#prepare(
            'SELECT id, device_id, device_name, zone_name, capability, value, timestamp FROM capability_events WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp ASC'
        ).all(since, until) as Array<Record<string, SqlValue>>;

        return rows.map(mapCapabilityEvent);
    }

    /**
     * Returns all custom events within a time range.
     *
     * @param since - Start timestamp (inclusive).
     * @param until - End timestamp (exclusive). Defaults to now.
     */
    getCustomEvents(since: number, until: number = Date.now()): CustomEvent[] {
        const rows = this.#prepare(
            'SELECT id, category, message, source, timestamp FROM custom_events WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp ASC'
        ).all(since, until) as Array<Record<string, SqlValue>>;

        return rows.map(mapCustomEvent);
    }

    /**
     * Saves an AI-generated summary for a specific date.
     *
     * @param date - The date string (YYYY-MM-DD).
     * @param content - The summary content.
     * @param eventCount - The number of events that were summarized.
     */
    saveSummary(date: string, content: string, eventCount: number): void {
        this.#prepare(
            'INSERT OR REPLACE INTO summaries (date, content, event_count, created_at) VALUES (?, ?, ?, ?)'
        ).run(date, content, eventCount, Date.now());
    }

    /**
     * Returns recent summaries, ordered by date descending.
     *
     * @param limit - Maximum number of summaries to return.
     */
    getRecentSummaries(limit: number = 7): Summary[] {
        const rows = this.#prepare(
            'SELECT id, date, content, event_count, created_at FROM summaries ORDER BY date DESC LIMIT ?'
        ).all(limit) as Array<Record<string, SqlValue>>;

        return rows.map(mapSummary);
    }

    /**
     * Returns the total number of capability events in the database.
     */
    getCapabilityEventCount(): number {
        const row = this.#prepare('SELECT COUNT(*) as count FROM capability_events').get() as { count: number };
        return row.count;
    }

    /**
     * Returns the number of capability events for a specific capability since a given timestamp.
     *
     * @param since - Start timestamp (inclusive).
     * @param capability - The capability ID to count.
     */
    getCapabilityEventCountFor(since: number, capability: string): number {
        const row = this.#prepare(
            'SELECT COUNT(*) as count FROM capability_events WHERE timestamp >= ? AND capability = ?'
        ).get(since, capability) as { count: number };
        return row.count;
    }

    /**
     * Returns the total number of custom events in the database.
     */
    getCustomEventCount(): number {
        const row = this.#prepare('SELECT COUNT(*) as count FROM custom_events').get() as { count: number };
        return row.count;
    }

    /**
     * Returns the total number of summaries in the database.
     */
    getSummaryCount(): number {
        const row = this.#prepare('SELECT COUNT(*) as count FROM summaries').get() as { count: number };
        return row.count;
    }

    /**
     * Deletes events older than the configured retention period.
     */
    purgeOldData(): number {
        const retentionDays = (this.settings.get(SETTING_RETENTION_DAYS) as number | null) ?? DEFAULT_RETENTION_DAYS;
        const cutoff = Date.now() - retentionDays * 86_400_000;

        const cutoffDate = getLocalDateString(this.homey.clock.getTimezone(), new Date(cutoff));

        const capResult = this.#prepare('DELETE FROM capability_events WHERE timestamp < ?').run(cutoff);
        const customResult = this.#prepare('DELETE FROM custom_events WHERE timestamp < ?').run(cutoff);
        const summaryResult = this.#prepare('DELETE FROM summaries WHERE date < ?').run(cutoffDate);
        const totalDeleted = Number(capResult.changes) + Number(customResult.changes) + Number(summaryResult.changes);

        if (totalDeleted > 0) {
            this.app.log(`Purged ${totalDeleted} event(s) older than ${retentionDays} day(s).`);
        }

        return totalDeleted;
    }

    /**
     * Returns a cached prepared statement for the given SQL, preparing it once.
     */
    #prepare(sql: string): StatementSync {
        const db = this.#requireDb();
        let stmt = this.#stmtCache.get(sql);

        if (!stmt) {
            stmt = db.prepare(sql);
            this.#stmtCache.set(sql, stmt);
        }

        return stmt;
    }

    #requireDb(): DatabaseSync {
        if (!this.#db) {
            throw new Error('Database is not open.');
        }

        return this.#db;
    }
}

function mapCapabilityEvent(row: Record<string, SqlValue>): CapabilityEvent {
    return {
        id: row.id as number,
        deviceId: row.device_id as string,
        deviceName: row.device_name as string,
        zoneName: row.zone_name as string,
        capability: row.capability as string,
        value: row.value as string,
        timestamp: row.timestamp as number
    };
}

function mapCustomEvent(row: Record<string, SqlValue>): CustomEvent {
    return {
        id: row.id as number,
        category: row.category as string,
        message: row.message as string,
        source: row.source as string,
        timestamp: row.timestamp as number
    };
}

function mapSummary(row: Record<string, SqlValue>): Summary {
    return {
        id: row.id as number,
        date: row.date as string,
        content: row.content as string,
        eventCount: row.event_count as number,
        createdAt: row.created_at as number
    };
}
