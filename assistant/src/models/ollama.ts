import type {
  LLMClient,
  ModelInvocation,
} from '../runner.js';

type OllamaChatResponse = {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string;
    };
  }>;
  error?: string;
};

/**
 * Simple Ollama client that calls the local HTTP API.
 */
export class OllamaClient implements LLMClient {
  constructor(private readonly baseUrl = 'http://127.0.0.1:11434') {}

  public async sendPrompt(invocation: ModelInvocation): Promise<string> {
    const messages = this.buildMessages(invocation);
    if (messages.length === 0) {
      throw new Error('OllamaClient requires at least one message');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: invocation.model,
        messages,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Ollama request failed (${response.status} ${response.statusText}): ${detail}`,
      );
    }

    const payload = (await response.json()) as OllamaChatResponse;
    const message = payload.choices?.[0]?.message?.content;

    if (!message) {
      throw new Error('Ollama returned no assistant response');
    }

    return message;
  }

  private buildMessages(invocation: ModelInvocation): {
    role: 'system' | 'user';
    content: string;
  }[] {
    const messages: { role: 'system' | 'user'; content: string }[] = [];

    if (invocation.systemPrompt) {
      messages.push({ role: 'system', content: invocation.systemPrompt });
    }

    if (invocation.userPrompt) {
      messages.push({ role: 'user', content: invocation.userPrompt });
    }

    return messages;
  }
}
