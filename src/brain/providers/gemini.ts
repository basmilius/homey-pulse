import { GoogleGenAI } from '@google/genai';
import type { AiProvider, GenerateResult } from './provider';

/**
 * AI provider implementation for Google Gemini.
 */
export default class GeminiProvider implements AiProvider {
    readonly #apiKey: string;

    constructor(apiKey: string) {
        this.#apiKey = apiKey;
    }

    async generateText(prompt: string, systemPrompt: string, model: string, maxTokens: number): Promise<GenerateResult> {
        const ai = new GoogleGenAI({apiKey: this.#apiKey});

        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: 'application/json',
                maxOutputTokens: maxTokens
            }
        });

        const text = response.text;

        if (!text) {
            throw new Error('Empty response from Gemini.');
        }

        return {text, model};
    }

    async testConnection(model: string): Promise<void> {
        const ai = new GoogleGenAI({apiKey: this.#apiKey});

        try {
            await ai.models.generateContent({
                model,
                contents: 'Hi',
                config: {maxOutputTokens: 16}
            });
        } catch (err: unknown) {
            const status = (err as { status?: number })?.status;
            const message = err instanceof Error ? err.message : '';

            if (status === 401 || status === 403 || message.includes('API key')) {
                throw new Error('Invalid Google AI API key.');
            }

            throw err;
        }
    }
}
