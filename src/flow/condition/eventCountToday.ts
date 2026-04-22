import { condition, FlowConditionEntity } from '@basmilius/homey-common';
import type { PulseApp } from '../../types';
import { getLocalDateString, getLocalDayRange } from '../../util';

/**
 * Condition: Checks if the number of events for a specific capability today exceeds a threshold.
 */
@condition('event_count_today')
export default class extends FlowConditionEntity<PulseApp, Args> {
    async onRun(args: Args): Promise<boolean> {
        const timeZone = this.homey.clock.getTimezone();
        const today = getLocalDateString(timeZone);
        const {start} = getLocalDayRange(today, timeZone);

        const count = this.app.brain.database.getCapabilityEventCountFor(
            start,
            args.capability
        );

        return count > args.count;
    }
}

type Args = {
    readonly capability: string;
    readonly count: number;
};
