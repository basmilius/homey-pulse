import { App } from '@basmilius/homey-common';
import { Brain } from './brain';
import { Actions, Conditions, Triggers } from './flow';
import type { PulseApp } from './types';

export default class Pulse extends App<PulseApp> {
    get brain(): Brain {
        return this.#brain;
    }

    readonly #brain: Brain;

    constructor(...args: any[]) {
        super(...args);

        this.#brain = new Brain(this as unknown as PulseApp);
    }

    async onInit(): Promise<void> {
        try {
            this.#brain.database.open();

            this.#registerActions();
            this.#registerConditions();
            this.#registerTriggers();

            await this.#brain.tracker.start();
            this.#brain.startPurgeSchedule();

            this.log('Pulse has been initialized!');
        } catch (err) {
            this.error('Failed initializing Pulse.', err);
        }
    }

    async onUninit(): Promise<void> {
        try {
            this.#brain.stopPurgeSchedule();
            this.#brain.tracker.stop();
        } catch (err) {
            this.error('Failed to stop tracker.', err);
        }

        try {
            this.#brain.database.close();
        } catch (err) {
            this.error('Failed to close database.', err);
        }
    }

    #registerActions(): void {
        this.registry.action(Actions.LogEvent);
        this.registry.action(Actions.GenerateSummary);
    }

    #registerConditions(): void {
        this.registry.condition(Conditions.EventCountToday);
    }

    #registerTriggers(): void {
        this.registry.trigger(Triggers.SummaryReady);
        this.registry.trigger(Triggers.AnomalyDetected);
    }
}
