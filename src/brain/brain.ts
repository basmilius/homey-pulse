import { Shortcuts } from '@basmilius/homey-common';
import type { PulseApp } from '../types';
import PulseDatabase from './database';
import Summarizer from './summarizer';
import Tracker from './tracker';

/** Purge old data once every 24 hours. */
const PURGE_INTERVAL_MS = 86_400_000;

/**
 * Orchestrates all brain modules for the Pulse app.
 *
 * Manages the lifecycle of the database, device tracker, and AI summarizer.
 * Also schedules automatic data purging based on the configured retention period.
 */
export default class Brain extends Shortcuts<PulseApp> {
    /** Persistent event and summary storage. */
    get database(): PulseDatabase {
        return this.#database;
    }

    /** AI-powered summary generator. */
    get summarizer(): Summarizer {
        return this.#summarizer;
    }

    /** Device capability change tracker. */
    get tracker(): Tracker {
        return this.#tracker;
    }

    readonly #database: PulseDatabase;
    readonly #summarizer: Summarizer;
    readonly #tracker: Tracker;
    #purgeTimer: NodeJS.Timeout | null = null;

    constructor(app: PulseApp) {
        super(app);

        this.#database = new PulseDatabase(app);
        this.#summarizer = new Summarizer(app);
        this.#tracker = new Tracker(app);
    }

    /**
     * Starts the automatic data purge schedule.
     * Runs immediately once (to clean up on startup) and then every 24 hours.
     */
    startPurgeSchedule(): void {
        this.#database.purgeOldData();

        this.#purgeTimer = setInterval(() => {
            this.#database.purgeOldData();
        }, PURGE_INTERVAL_MS);
    }

    /**
     * Stops the automatic data purge schedule.
     */
    stopPurgeSchedule(): void {
        if (this.#purgeTimer) {
            clearInterval(this.#purgeTimer);
            this.#purgeTimer = null;
        }
    }
}
