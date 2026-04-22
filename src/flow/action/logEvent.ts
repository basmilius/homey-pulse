import { action, FlowActionEntity } from '@basmilius/homey-common';
import type { PulseApp } from '../../types';

/**
 * Action: Log a custom event.
 */
@action('log_event')
export default class extends FlowActionEntity<PulseApp, Args> {
    async onRun(args: Args): Promise<void> {
        this.app.brain.database.insertCustomEvent(
            args.category,
            args.message
        );
    }
}

type Args = {
    readonly category: string;
    readonly message: string;
};
