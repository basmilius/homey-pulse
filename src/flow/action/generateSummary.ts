import { action, FlowActionEntity } from '@basmilius/homey-common';
import { Triggers } from '../../flow';
import type { PulseApp } from '../../types';
import { getLocalDateString } from '../../util';

/**
 * Action: Generate an AI-powered summary of today's home activity.
 */
@action('generate_summary')
export default class extends FlowActionEntity<PulseApp, never, never, Result> {
    async onRun(): Promise<Result> {
        const today = getLocalDateString(this.homey.clock.getTimezone());
        const result = await this.app.brain.summarizer.generateSummary(today);

        // Fire the summary_ready trigger.
        const trigger = this.app.registry.findTrigger(Triggers.SummaryReady);

        await trigger?.trigger({}, {
            summary: result.summary,
            date: today,
            event_count: result.eventCount
        });

        return {summary: result.summary};
    }
}

type Result = {
    readonly summary: string;
};
