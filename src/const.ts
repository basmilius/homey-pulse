export const SETTING_PROVIDER = 'pulse-provider';
export const SETTING_API_KEY_ANTHROPIC = 'pulse-api-key-anthropic';
export const SETTING_API_KEY_OPENAI = 'pulse-api-key-openai';
export const SETTING_API_KEY_GEMINI = 'pulse-api-key-gemini';
export const SETTING_DEFAULT_MODEL = 'pulse-default-model';
export const SETTING_EXCLUDED_ZONES = 'pulse-excluded-zones';
export const SETTING_EXCLUDED_CAPABILITIES = 'pulse-excluded-capabilities';
export const SETTING_SAMPLE_INTERVAL = 'pulse-sample-interval';
export const SETTING_RETENTION_DAYS = 'pulse-retention-days';

/** @deprecated Use provider-specific API key settings instead. */
export const SETTING_API_KEY = 'pulse-api-key';

export const DEFAULT_PROVIDER: ProviderType = 'anthropic';
export const DEFAULT_SAMPLE_INTERVAL_MINUTES = 15;
export const DEFAULT_RETENTION_DAYS = 30;

export const DATABASE_PATH = '/userdata/pulse.db';

export const DEBUG_MODE = true;

export type ProviderType = 'anthropic' | 'openai' | 'gemini';

export const PROVIDERS: Record<ProviderType, ProviderDefinition> = {
    anthropic: {
        name: 'Anthropic (Claude)',
        defaultModel: 'claude-haiku-4-5-20251001',
        models: [
            {id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5'},
            {id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6'},
            {id: 'claude-opus-4-6', name: 'Claude Opus 4.6'}
        ]
    },
    openai: {
        name: 'OpenAI (ChatGPT)',
        defaultModel: 'gpt-4.1-mini',
        models: [
            {id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano'},
            {id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini'},
            {id: 'gpt-4.1', name: 'GPT-4.1'}
        ]
    },
    gemini: {
        name: 'Google (Gemini)',
        defaultModel: 'gemini-2.5-flash',
        models: [
            {id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite'},
            {id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash'},
            {id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro'}
        ]
    }
};

export type ProviderDefinition = {
    readonly name: string;
    readonly defaultModel: string;
    readonly models: ReadonlyArray<{ readonly id: string; readonly name: string }>;
};
