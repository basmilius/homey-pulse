import { FlowTriggerEntity, trigger } from '@basmilius/homey-common';
import type { PulseApp } from '../../types';

/**
 * Trigger: Fires when an AI summary has been generated.
 */
@trigger('summary_ready')
export default class extends FlowTriggerEntity<PulseApp, unknown, unknown, Tokens> {
    async onRun(): Promise<boolean> {
        return true;
    }
}

type Tokens = {
    readonly summary: string;
    readonly date: string;
    readonly event_count: number;
};
