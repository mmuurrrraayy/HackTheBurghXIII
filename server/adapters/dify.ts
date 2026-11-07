import { HttpError } from '../errors.js';

export interface DifyConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

export interface DifyReply {
  answer: string;
  conversationId: string;
}

type FetchLike = typeof fetch;
type DifyEvent = Record<string, unknown> & { event?: string };

export class DifyAdapter {
  constructor(
    private readonly config: DifyConfig,
    private readonly fetchImplementation: FetchLike = fetch,
  ) {}

  private get headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async testConnection(): Promise<{ name: string; mode: string }> {
    const response = await this.request(`${this.config.baseUrl}/info`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: 'application/json' },
    });
    const body: unknown = await response.json().catch(() => undefined);
    if (!isRecord(body) || typeof body.name !== 'string' || typeof body.mode !== 'string') {
      throw new HttpError(502, 'Dify returned an invalid application info response.', 'DIFY_INVALID_RESPONSE');
    }
    return { name: body.name, mode: body.mode };
  }

  async chat(input: {
    query: string;
    user: string;
    conversationId?: string;
  }): Promise<DifyReply> {
    const requestBody: Record<string, unknown> = {
      inputs: {},
      query: input.query,
      response_mode: 'streaming',
      user: input.user,
    };
    if (input.conversationId) {
      requestBody.conversation_id = input.conversationId;
    }
    const response = await this.request(`${this.config.baseUrl}/chat-messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(requestBody),
    });
    if (!response.body) {
      throw new HttpError(502, 'Dify returned no streaming response.', 'DIFY_EMPTY_STREAM');
    }
    return readDifyStream(response.body);
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        ...init,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new HttpError(504, 'Dify did not respond before the request timed out.', 'DIFY_TIMEOUT');
      }
      throw new HttpError(502, 'Could not reach the configured Dify service.', 'DIFY_UNAVAILABLE');
    }
    if (!response.ok) {
      const status = response.status === 401 || response.status === 403
        ? 502
        : response.status === 429
          ? 503
          : response.status >= 500
            ? 502
            : 502;
      const code = response.status === 401 || response.status === 403
        ? 'DIFY_AUTHENTICATION_FAILED'
        : response.status === 429
          ? 'DIFY_RATE_LIMITED'
          : 'DIFY_REQUEST_FAILED';
      const message = response.status === 401 || response.status === 403
        ? 'Dify rejected the server API key. Check DIFY_API_KEY.'
        : response.status === 429
          ? 'Dify rate limit reached. Try again later.'
          : `Dify returned an unsuccessful response (${response.status}).`;
      throw new HttpError(status, message, code);
    }
    return response;
  }
}

async function readDifyStream(body: ReadableStream<Uint8Array>): Promise<DifyReply> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let conversationId = '';
  let streamError: HttpError | undefined;
  let gotEndEvent = false;
  let bytesRead = 0;

  function processEvent(block: string): void {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (!data || data === '[DONE]') return;

    let event: DifyEvent;
    try {
      const parsed: unknown = JSON.parse(data);
      if (!isRecord(parsed)) throw new Error('Expected event object.');
      event = parsed;
    } catch {
      streamError = new HttpError(502, 'Dify returned a malformed streaming event.', 'DIFY_MALFORMED_STREAM');
      return;
    }

    if (typeof event.conversation_id === 'string') {
      conversationId = event.conversation_id;
    }
    if (event.event === 'agent_message' && typeof event.answer === 'string') {
      answer += event.answer;
    } else if (event.event === 'message' && typeof event.answer === 'string') {
      answer = event.answer;
    } else if (event.event === 'message_end') {
      gotEndEvent = true;
    } else if (event.event === 'error') {
      streamError = new HttpError(502, 'Dify reported an error while generating a response.', 'DIFY_STREAM_ERROR');
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      bytesRead += value?.byteLength ?? 0;
      if (bytesRead > 64 * 1024) {
        await reader.cancel();
        throw new HttpError(502, 'Dify response exceeded the allowed size.', 'DIFY_RESPONSE_TOO_LARGE');
      }
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) processEvent(block);
      if (done) break;
    }
    if (buffer.trim()) processEvent(buffer);
  } finally {
    reader.releaseLock();
  }

  if (streamError) throw streamError;
  if (!gotEndEvent || !answer.trim() || !conversationId) {
    throw new HttpError(502, 'Dify ended the stream without a complete usable reply.', 'DIFY_INCOMPLETE_STREAM');
  }
  return { answer: answer.trim(), conversationId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
