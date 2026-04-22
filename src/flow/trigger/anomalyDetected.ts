import { FlowTriggerEntity, trigger } from '@basmilius/homey-common';
import type { PulseApp } from '../../types';

/**
 * Trigger: Fires when the AI detects unusual activity in the home events.
 */
@trigger('anomaly_detected')
export default class extends FlowTriggerEntity<PulseApp, unknown, unknown, Tokens> {
    async onRun(): Promise<boolean> {
        return true;
    }
}

type Tokens = {
    readonly description: string;
    readonly severity: string;
};
