import type { LLMClient, ModelInvocation } from '../types.js';

type OllamaChatMessage = {
  role?: string;
  content?: string;
  images?: string[];
};

type OllamaChatResponse = {
  message?: OllamaChatMessage;
  done?: boolean;
  error?: string;
};

type OllamaGenerateResponse = {
  response?: string;
  done?: boolean;
  error?: string;
};

/**
 * Simple Ollama client that calls the local HTTP API.
 */
export class OllamaClient implements LLMClient {
  constructor(private readonly baseUrl = 'http://127.0.0.1:11434') {}

  public async sendPrompt(invocation: ModelInvocation): Promise<string> {
    if (invocation.mode === 'raw') {
      return this.sendRawPrompt(invocation);
    }

    return this.sendChatPrompt(invocation);
  }

  private async sendChatPrompt(invocation: ModelInvocation): Promise<string> {
    const messages = this.buildMessages(invocation);
    if (messages.length === 0) {
      throw new Error('OllamaClient requires at least one message');
    }

    // Add assistant message with "{" prefill to force JSON output (only for JSON contracts)
    const prefillJson = invocation.expectsJson === true;
    if (prefillJson) {
      messages.push({ role: 'assistant', content: '{' });
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: invocation.model,
        messages,
        stream: false,
      }),
      signal: invocation.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Ollama request failed (${response.status} ${response.statusText}): ${detail}`,
      );
    }

    const payloadText = await response.text();
    const message = this.extractMessageContent(payloadText);

    if (message.length === 0) {
      throw new Error('Ollama returned no assistant response');
    }

    // Prepend the prefill "{" since it's not included in the response (only for JSON contracts)
    if (prefillJson) {
      return `{${message}`;
    }
    return message;
  }

  private async sendRawPrompt(invocation: ModelInvocation): Promise<string> {
    const prompt = invocation.rawPrompt?.trim();
    if (!prompt) {
      throw new Error('OllamaClient raw mode requires a prompt string');
    }

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: invocation.model,
        prompt,
        stream: false,
      }),
      signal: invocation.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Ollama request failed (${response.status} ${response.statusText}): ${detail}`,
      );
    }

    const payloadText = await response.text();
    const message = this.extractGeneratedContent(payloadText);

    if (message.length === 0) {
      throw new Error('Ollama returned no assistant response');
    }

    return message;
  }

  /**
   * Extracts message content from Ollama payloads, including streamed chunks.
   */
  private extractMessageContent(payloadText: string): string {
    const chunks = this.parseChatResponses(payloadText);
    let content = '';

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      if (!chunk) {
        continue;
      }

      if (chunk.error) {
        throw new Error(`Ollama response error: ${chunk.error}`);
      }

      if (chunk.message?.content) {
        content += chunk.message.content;
      }
    }

    return content;
  }

  /**
   * Extracts generated content from Ollama /api/generate payloads.
   */
  private extractGeneratedContent(payloadText: string): string {
    const chunks = this.parseGenerateResponses(payloadText);
    let content = '';

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      if (!chunk) {
        continue;
      }

      if (chunk.error) {
        throw new Error(`Ollama response error: ${chunk.error}`);
      }

      if (chunk.response) {
        content += chunk.response;
      }
    }

    return content;
  }

  /**
   * Parses the response body into one or more chat response objects.
   */
  private parseChatResponses(payloadText: string): OllamaChatResponse[] {
    const trimmed = payloadText.trim();
    if (!trimmed) {
      return [];
    }

    try {
      return [JSON.parse(trimmed) as OllamaChatResponse];
    } catch {
      // Fall through to streaming/concatenated payload parsing.
    }

    const lineChunks: OllamaChatResponse[] = [];
    const lines = trimmed.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) {
        continue;
      }
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      try {
        lineChunks.push(JSON.parse(trimmedLine) as OllamaChatResponse);
      } catch {
        lineChunks.length = 0;
        break;
      }
    }

    if (lineChunks.length > 0) {
      return lineChunks;
    }

    return this.splitConcatenatedJson(trimmed);
  }

  /**
   * Parses the response body into one or more generate response objects.
   */
  private parseGenerateResponses(payloadText: string): OllamaGenerateResponse[] {
    const trimmed = payloadText.trim();
    if (!trimmed) {
      return [];
    }

    try {
      return [JSON.parse(trimmed) as OllamaGenerateResponse];
    } catch {
      // Fall through to streaming/concatenated payload parsing.
    }

    const lineChunks: OllamaGenerateResponse[] = [];
    const lines = trimmed.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) {
        continue;
      }
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      try {
        lineChunks.push(JSON.parse(trimmedLine) as OllamaGenerateResponse);
      } catch {
        lineChunks.length = 0;
        break;
      }
    }

    if (lineChunks.length > 0) {
      return lineChunks;
    }

    return this.splitConcatenatedJson(trimmed) as OllamaGenerateResponse[];
  }

  /**
   * Splits concatenated JSON objects by tracking brace depth.
   */
  private splitConcatenatedJson(payloadText: string): OllamaChatResponse[] {
    const chunks: OllamaChatResponse[] = [];
    let depth = 0;
    let startIndex = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < payloadText.length; index += 1) {
      const char = payloadText[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        if (depth === 0) {
          startIndex = index;
        }
        depth += 1;
        continue;
      }

      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const slice = payloadText.slice(startIndex, index + 1);
          try {
            chunks.push(JSON.parse(slice) as OllamaChatResponse);
          } catch {
            return [];
          }
        }
      }
    }

    return chunks;
  }

  private buildMessages(invocation: ModelInvocation): {
    role: 'system' | 'user' | 'assistant';
    content: string;
    images?: string[];
  }[] {
    const messages: {
      role: 'system' | 'user' | 'assistant';
      content: string;
      images?: string[];
    }[] = [];

    if (invocation.systemPrompt) {
      messages.push({ role: 'system', content: invocation.systemPrompt });
    }

    const hasImages = !!invocation.images && invocation.images.length > 0;
    if (invocation.userPrompt || hasImages) {
      messages.push({
        role: 'user',
        content: invocation.userPrompt ?? '',
        images: hasImages ? invocation.images : undefined,
      });
    }

    return messages;
  }
}
