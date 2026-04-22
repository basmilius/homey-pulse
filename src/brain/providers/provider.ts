/**
 * Result of a text generation request to any AI provider.
 */
export type GenerateResult = {
    readonly text: string;
    readonly model: string;
};

/**
 * Abstract interface for AI providers.
 * Each provider (Claude, OpenAI, Gemini) implements this to normalize
 * how the summarizer interacts with different AI APIs.
 */
export interface AiProvider {
    /**
     * Generates a text response given a prompt and system instruction.
     * The provider should request JSON output when possible.
     *
     * @param prompt - The user prompt.
     * @param systemPrompt - The system instruction.
     * @param model - The model ID to use.
     * @param maxTokens - The maximum number of output tokens.
     */
    generateText(prompt: string, systemPrompt: string, model: string, maxTokens: number): Promise<GenerateResult>;

    /**
     * Tests the connection to the provider's API.
     * Should throw an error if the API key is invalid or the connection fails.
     *
     * @param model - The model ID to use for the test request.
     */
    testConnection(model: string): Promise<void>;
}
