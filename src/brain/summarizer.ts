import { Shortcuts } from '@basmilius/homey-common';
import { DEFAULT_PROVIDER, PROVIDERS, SETTING_API_KEY, SETTING_API_KEY_ANTHROPIC, SETTING_API_KEY_GEMINI, SETTING_API_KEY_OPENAI, SETTING_DEFAULT_MODEL, SETTING_PROVIDER } from '../const';
import type { ProviderType } from '../const';
import { Triggers } from '../flow';
import type { PulseApp } from '../types';
import { formatLocalTime, getLocalDateString, getLocalDayRange, withRetry } from '../util';
import { AnthropicProvider, GeminiProvider, OpenAiProvider } from './providers';
import type { AiProvider } from './providers';

const SYSTEM_PROMPT = `You are a smart home analyst. You analyze daily home activity data and produce a JSON response with a summary and any detected anomalies.

An anomaly is any unusual or noteworthy pattern, such as:
- Activity at unusual times (e.g. motion at 3 AM)
- Significant deviations from recent patterns visible in the provided summaries
- Unexpected sensor readings (e.g. sudden temperature spikes)
- Activity in zones that are typically quiet at that time
- Devices left on for unusually long periods
- Safety-related events (smoke, water, CO alarms)

Write the summary in the same language as the user's device and zone names. Keep it to 3-5 sentences unless there are notable anomalies.

You MUST respond with ONLY a JSON object in this exact format, no other text:
{"summary": "...", "anomalies": [{"description": "...", "severity": "info|warning|critical"}]}

Use an empty array if there are no anomalies. Use "critical" for safety events, "warning" for unusual patterns, and "info" for minor observations.`;

/**
 * Generates AI-powered summaries of home events.
 * Supports multiple AI providers (Anthropic Claude, OpenAI ChatGPT, Google Gemini).
 * Also detects anomalies and fires the anomaly_detected trigger.
 */
export default class Summarizer extends Shortcuts<PulseApp> {
    constructor(app: PulseApp) {
        super(app);
    }

    /**
     * Creates the appropriate AI provider based on the user's settings.
     */
    createProvider(): AiProvider {
        const providerType = this.#getProviderType();
        const apiKey = this.#getApiKey(providerType);

        switch (providerType) {
            case 'anthropic':
                return new AnthropicProvider(apiKey);
            case 'openai':
                return new OpenAiProvider(apiKey);
            case 'gemini':
                return new GeminiProvider(apiKey);
        }
    }

    /**
     * Returns the cheapest model ID for the current provider, used for connection tests.
     */
    getTestModel(): string {
        const providerType = this.#getProviderType();
        return PROVIDERS[providerType].models[0].id;
    }

    /**
     * Generates a summary for the given date.
     * Collects all events from that day, feeds them to the configured AI provider
     * along with recent summaries for context, stores the result, and fires anomaly triggers.
     *
     * @param date - The date to summarize (YYYY-MM-DD). Defaults to today.
     * @returns The generated summary result with text and anomalies.
     */
    async generateSummary(date?: string): Promise<SummaryResult> {
        const timeZone = this.homey.clock.getTimezone();
        const targetDate = date ?? getLocalDateString(timeZone);
        const {start: dayStart, end: dayEnd} = getLocalDayRange(targetDate, timeZone);

        const db = this.app.brain.database;

        // Gather events for the target day.
        const capabilityEvents = db.getCapabilityEvents(dayStart, dayEnd);
        const customEvents = db.getCustomEvents(dayStart, dayEnd);
        const totalEvents = capabilityEvents.length + customEvents.length;

        if (totalEvents === 0) {
            const emptySummary = 'No events recorded for this day.';
            db.saveSummary(targetDate, emptySummary, 0);
            return {summary: emptySummary, anomalies: [], eventCount: 0};
        }

        // Get recent summaries for context.
        const recentSummaries = db.getRecentSummaries(7);

        // Build the prompt and call the AI provider.
        const prompt = this.#buildPrompt(timeZone, targetDate, capabilityEvents, customEvents, recentSummaries);
        const provider = this.createProvider();
        const model = this.#getModel();

        const response = await withRetry(
            () => provider.generateText(prompt, SYSTEM_PROMPT, model, 1024)
        );

        // Parse the structured response.
        const result = this.#parseResponse(response.text);

        // Store the summary.
        db.saveSummary(targetDate, result.summary, totalEvents);

        // Fire anomaly triggers.
        if (result.anomalies.length > 0) {
            await this.#fireAnomalyTriggers(result.anomalies);
        }

        this.app.log(`Generated summary for ${targetDate} (${totalEvents} events, ${result.anomalies.length} anomalies).`);

        return {...result, eventCount: totalEvents};
    }

    #getProviderType(): ProviderType {
        return (this.settings.get(SETTING_PROVIDER) as ProviderType | null) ?? DEFAULT_PROVIDER;
    }

    #getApiKey(providerType: ProviderType): string {
        const settingKey = {
            anthropic: SETTING_API_KEY_ANTHROPIC,
            openai: SETTING_API_KEY_OPENAI,
            gemini: SETTING_API_KEY_GEMINI
        }[providerType];

        const apiKey = (this.settings.get(settingKey) as string | null)
            // Fallback to the legacy single API key setting for migration.
            ?? (this.settings.get(SETTING_API_KEY) as string | null);

        if (!apiKey) {
            throw new Error(`API key for ${PROVIDERS[providerType].name} is not configured. Please set it in the app settings.`);
        }

        return apiKey;
    }

    #getModel(): string {
        const providerType = this.#getProviderType();
        const provider = PROVIDERS[providerType];
        const storedModel = this.settings.get(SETTING_DEFAULT_MODEL) as string | null;

        // Validate that the stored model actually belongs to the active provider.
        // This prevents using e.g. a Claude model ID with OpenAI after switching providers.
        if (storedModel && provider.models.some((model) => model.id === storedModel)) {
            return storedModel;
        }

        return provider.defaultModel;
    }

    /**
     * Parses the AI's JSON response into a structured result.
     * Tolerant of markdown code fences and prose wrapping around the JSON object.
     * Falls back to treating the entire response as a plain summary if parsing fails.
     */
    #parseResponse(text: string): ParsedResponse {
        const candidate = extractJsonObject(text);

        if (candidate) {
            try {
                const parsed = JSON.parse(candidate) as { summary?: unknown; anomalies?: unknown };

                if (typeof parsed.summary === 'string') {
                    return {
                        summary: parsed.summary,
                        anomalies: Array.isArray(parsed.anomalies)
                            ? parsed.anomalies.filter(isValidAnomaly)
                            : []
                    };
                }
            } catch {
                // Fall through to raw-text fallback.
            }
        }

        this.app.log('Failed to parse structured response, using raw text as summary.');

        return {
            summary: text.trim(),
            anomalies: []
        };
    }

    async #fireAnomalyTriggers(anomalies: Anomaly[]): Promise<void> {
        const trigger = this.app.registry.findTrigger(Triggers.AnomalyDetected);

        if (!trigger) {
            return;
        }

        for (const anomaly of anomalies) {
            try {
                await trigger.trigger({}, {
                    description: anomaly.description,
                    severity: anomaly.severity
                });
            } catch (err) {
                this.app.error('Failed to fire anomaly trigger.', err);
            }
        }
    }

    #buildPrompt(
        timeZone: string,
        date: string,
        capabilityEvents: Array<{ deviceName: string; zoneName: string; capability: string; value: string; timestamp: number }>,
        customEvents: Array<{ category: string; message: string; timestamp: number }>,
        recentSummaries: Array<{ date: string; content: string }>
    ): string {
        const parts: string[] = [];

        parts.push(`Summarize the home activity for ${date}.`);

        // Add recent summaries as context.
        if (recentSummaries.length > 0) {
            parts.push('\n## Recent summaries for context');

            for (const summary of recentSummaries) {
                if (summary.date === date) {
                    continue;
                }

                parts.push(`**${summary.date}:** ${summary.content}`);
            }
        }

        // Add capability events, grouped by zone.
        if (capabilityEvents.length > 0) {
            parts.push(`\n## Device events (${capabilityEvents.length} total)`);

            const byZone = new Map<string, typeof capabilityEvents>();

            for (const event of capabilityEvents) {
                const zone = byZone.get(event.zoneName) ?? [];
                zone.push(event);
                byZone.set(event.zoneName, zone);
            }

            for (const [zone, events] of byZone) {
                parts.push(`\n### ${zone}`);

                const grouped = new Map<string, string[]>();

                for (const event of events) {
                    const key = `${event.deviceName} — ${event.capability}`;
                    const time = formatLocalTime(timeZone, event.timestamp);
                    const entries = grouped.get(key) ?? [];
                    entries.push(`${time}: ${event.value}`);
                    grouped.set(key, entries);
                }

                for (const [key, values] of grouped) {
                    if (values.length <= 5) {
                        parts.push(`- ${key}: ${values.join(', ')}`);
                    } else {
                        parts.push(`- ${key}: ${values.length} changes (first: ${values[0]}, last: ${values[values.length - 1]})`);
                    }
                }
            }
        }

        // Add custom events.
        if (customEvents.length > 0) {
            parts.push(`\n## Custom events (${customEvents.length} total)`);

            for (const event of customEvents) {
                const time = formatLocalTime(timeZone, event.timestamp);
                parts.push(`- ${time} [${event.category}] ${event.message}`);
            }
        }

        return parts.join('\n');
    }
}

const VALID_SEVERITIES = new Set(['info', 'warning', 'critical']);

/**
 * Extracts a JSON object from a raw AI response.
 * Handles markdown code fences (```json ... ```) and prose before/after the JSON.
 */
function extractJsonObject(text: string): string | null {
    const trimmed = text.trim();

    // Match ```json ... ``` or ``` ... ``` fenced blocks.
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

    if (fenceMatch) {
        return fenceMatch[1].trim();
    }

    // Fall back to extracting from the first `{` to the last `}`.
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start !== -1 && end > start) {
        return trimmed.slice(start, end + 1);
    }

    return null;
}

/**
 * Type guard that validates an AI-generated anomaly object at runtime.
 * Ensures the severity is one of the expected values, preventing
 * invalid data from reaching Flow triggers.
 */
function isValidAnomaly(value: unknown): value is Anomaly {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const obj = value as Record<string, unknown>;

    return typeof obj.description === 'string'
        && typeof obj.severity === 'string'
        && VALID_SEVERITIES.has(obj.severity);
}

export type Anomaly = {
    readonly description: string;
    readonly severity: 'info' | 'warning' | 'critical';
};

type ParsedResponse = {
    readonly summary: string;
    readonly anomalies: Anomaly[];
};

export type SummaryResult = {
    readonly summary: string;
    readonly anomalies: Anomaly[];
    readonly eventCount: number;
};
