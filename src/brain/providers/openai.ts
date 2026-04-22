import OpenAI from 'openai';
import type { AiProvider, GenerateResult } from './provider';

/**
 * AI provider implementation for OpenAI (ChatGPT).
 */
export default class OpenAiProvider implements AiProvider {
    readonly #apiKey: string;

    constructor(apiKey: string) {
        this.#apiKey = apiKey;
    }

    async generateText(prompt: string, systemPrompt: string, model: string, maxTokens: number): Promise<GenerateResult> {
        const client = new OpenAI({apiKey: this.#apiKey});

        const response = await client.chat.completions.create({
            model,
            max_tokens: maxTokens,
            response_format: {type: 'json_object'},
            messages: [
                {role: 'developer', content: systemPrompt},
                {role: 'user', content: prompt}
            ]
        });

        const content = response.choices[0]?.message?.content;

        if (!content) {
            throw new Error('Empty response from OpenAI.');
        }

        return {text: content, model: response.model};
    }

    async testConnection(model: string): Promise<void> {
        const client = new OpenAI({apiKey: this.#apiKey});

        try {
            await client.chat.completions.create({
                model,
                max_tokens: 16,
                messages: [{role: 'user', content: 'Hi'}]
            });
        } catch (err) {
            if (err instanceof OpenAI.AuthenticationError) {
                throw new Error('Invalid OpenAI API key.');
            }

            throw err;
        }
    }
}
