import type { ApiRequest } from '@basmilius/homey-common';
import { DEFAULT_PROVIDER, DEFAULT_RETENTION_DAYS, DEFAULT_SAMPLE_INTERVAL_MINUTES, PROVIDERS, SETTING_API_KEY_ANTHROPIC, SETTING_API_KEY_GEMINI, SETTING_API_KEY_OPENAI, SETTING_DEFAULT_MODEL, SETTING_EXCLUDED_CAPABILITIES, SETTING_EXCLUDED_ZONES, SETTING_PROVIDER, SETTING_RETENTION_DAYS, SETTING_SAMPLE_INTERVAL } from './src/const';
import type { ProviderType } from './src/const';
import type { PulseApp } from './src/types';

type AppRequest<TBody = never> = ApiRequest<PulseApp, TBody>;

/** All setting keys that may be written through the API. */
const ALLOWED_SETTING_KEYS = new Set([
    SETTING_PROVIDER,
    SETTING_API_KEY_ANTHROPIC,
    SETTING_API_KEY_OPENAI,
    SETTING_API_KEY_GEMINI,
    SETTING_DEFAULT_MODEL,
    SETTING_EXCLUDED_ZONES,
    SETTING_EXCLUDED_CAPABILITIES,
    SETTING_SAMPLE_INTERVAL,
    SETTING_RETENTION_DAYS
]);

module.exports = {
    getSettings({homey}: AppRequest) {
        const provider = (homey.settings.get(SETTING_PROVIDER) as ProviderType | null) ?? DEFAULT_PROVIDER;

        return {
            provider,
            apiKeyAnthropic: homey.settings.get(SETTING_API_KEY_ANTHROPIC) ?? null,
            apiKeyOpenai: homey.settings.get(SETTING_API_KEY_OPENAI) ?? null,
            apiKeyGemini: homey.settings.get(SETTING_API_KEY_GEMINI) ?? null,
            defaultModel: homey.settings.get(SETTING_DEFAULT_MODEL) ?? PROVIDERS[provider].defaultModel,
            excludedZones: homey.settings.get(SETTING_EXCLUDED_ZONES) ?? [],
            excludedCapabilities: homey.settings.get(SETTING_EXCLUDED_CAPABILITIES) ?? [],
            sampleInterval: homey.settings.get(SETTING_SAMPLE_INTERVAL) ?? DEFAULT_SAMPLE_INTERVAL_MINUTES,
            retentionDays: homey.settings.get(SETTING_RETENTION_DAYS) ?? DEFAULT_RETENTION_DAYS,
            providers: PROVIDERS
        };
    },

    saveSettings({homey, body}: AppRequest<Record<string, unknown>>) {
        for (const [key, value] of Object.entries(body)) {
            if (!ALLOWED_SETTING_KEYS.has(key)) {
                throw new Error(`Unknown setting key: ${key}`);
            }

            homey.settings.set(key, value);
        }
    },

    async testConnection({homey}: AppRequest) {
        const app = homey.app as unknown as PulseApp;
        const provider = app.brain.summarizer.createProvider();
        const testModel = app.brain.summarizer.getTestModel();

        await provider.testConnection(testModel);
    },

    getStats({homey}: AppRequest) {
        const app = homey.app as unknown as PulseApp;
        const db = app.brain.database;

        return {
            capabilityEvents: db.getCapabilityEventCount(),
            customEvents: db.getCustomEventCount(),
            summaries: db.getSummaryCount()
        };
    },

    getZones({homey}: AppRequest) {
        const app = homey.app as unknown as PulseApp;
        return app.brain.tracker.getZones();
    }
};
