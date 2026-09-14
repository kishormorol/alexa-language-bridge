import { describe, expect, it, vi } from 'vitest';
import { BedrockLanguageProvider, type MessagesClient } from '../src/lang/bedrock.js';

function stub(blocks: unknown[]) {
  const create = vi.fn().mockResolvedValue({ content: blocks });
  return { client: { messages: { create } } as unknown as MessagesClient, create };
}

const provider = (client: MessagesClient) =>
  new BedrockLanguageProvider({ region: 'us-west-2', model: 'us.anthropic.claude-opus-5', client });

describe('BedrockLanguageProvider', () => {
  it('does not call the model when source and target already match', async () => {
    const { client, create } = stub([]);
    const result = await provider(client).translate({ text: 'rice', from: 'en-US', to: 'en-US' });

    expect(result.text).toBe('rice');
    expect(create).not.toHaveBeenCalled();
  });

  it('returns the translated text and reports the source language', async () => {
    const { client } = stub([{ type: 'text', text: '  rice  ' }]);
    const result = await provider(client).translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });

    expect(result.text).toBe('rice');
    expect(result.detectedLanguage).toBe('bn-BD');
  });

  it('sends a cached system prompt and low effort, for the latency budget', async () => {
    const { client, create } = stub([{ type: 'text', text: 'rice' }]);
    await provider(client).translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });

    const request = create.mock.calls[0]?.[0] as {
      model: string;
      output_config?: { effort?: string };
      system: { cache_control?: { type: string } }[];
    };
    // On-demand requires an inference-profile id; a bare `anthropic.` id is rejected.
    expect(request.model).toBe('us.anthropic.claude-opus-5');
    expect(request.output_config?.effort).toBe('low');
    expect(request.system[0]?.cache_control?.type).toBe('ephemeral');
  });

  it('names both languages in the request so the model knows the direction', async () => {
    const { client, create } = stub([{ type: 'text', text: 'rice' }]);
    await provider(client).translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });

    const request = create.mock.calls[0]?.[0] as { messages: { content: string }[] };
    expect(request.messages[0]?.content).toContain('Bangla');
    expect(request.messages[0]?.content).toContain('English');
    expect(request.messages[0]?.content).toContain('chal');
  });

  it('ignores non-text blocks rather than stringifying them into the output', async () => {
    const { client } = stub([
      { type: 'thinking', thinking: 'considering' },
      { type: 'text', text: 'rice' },
    ]);
    const result = await provider(client).translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });
    expect(result.text).toBe('rice');
  });

  it('throws rather than handing back the untranslated original', async () => {
    const { client } = stub([{ type: 'text', text: '   ' }]);
    await expect(
      provider(client).translate({ text: 'chal', from: 'bn-BD', to: 'en-US' }),
    ).rejects.toThrow(/no text/i);
  });
});
