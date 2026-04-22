import Anthropic from '@anthropic-ai/sdk';
import type { AiProvider, GenerateResult } from './provider';

/**
 * AI provider implementation for Anthropic Claude.
 */
export default class AnthropicProvider implements AiProvider {
    readonly #apiKey: string;

    constructor(apiKey: string) {
        this.#apiKey = apiKey;
    }

    async generateText(prompt: string, systemPrompt: string, model: string, maxTokens: number): Promise<GenerateResult> {
        const client = new Anthropic({apiKey: this.#apiKey});

        const response = await client.messages.create({
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{role: 'user', content: prompt}]
        });

        const content = response.content[0];

        if (content.type !== 'text') {
            throw new Error('Unexpected response type from Claude.');
        }

        return {text: content.text, model: response.model};
    }

    async testConnection(model: string): Promise<void> {
        const client = new Anthropic({apiKey: this.#apiKey});

        try {
            await client.messages.create({
                model,
                max_tokens: 16,
                messages: [{role: 'user', content: 'Hi'}]
            });
        } catch (err) {
            if (err instanceof Anthropic.AuthenticationError) {
                throw new Error('Invalid Anthropic API key.');
            }

            throw err;
        }
    }
}
