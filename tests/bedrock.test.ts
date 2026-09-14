import { describe, expect, it, vi } from 'vitest';
import { BedrockLanguageProvider, type MessagesClient } from '../src/lang/bedrock.js';

function stub(blocks: unknown[]) {
  const create = vi.fn().mockResolvedValue({ content: blocks });
  return { client: { messages: { create } } as unknown as MessagesClient, create };
}

const provider = (client: MessagesClient) =>
  new BedrockLanguageProvider({ region: 'us-west-2', model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', client });

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

  it('sends a cached system prompt and omits effort, which Haiku 4.5 rejects', async () => {
    const { client, create } = stub([{ type: 'text', text: 'rice' }]);
    await provider(client).translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });

    const request = create.mock.calls[0]?.[0] as {
      model: string;
      output_config?: { effort?: string };
      system: { cache_control?: { type: string } }[];
    };
    // bedrock-runtime takes the inference-profile id; Mantle takes a bare one.
    expect(request.model).toBe('us.anthropic.claude-haiku-4-5-20251001-v1:0');
    expect(request.output_config).toBeUndefined();
    expect(request.system[0]?.cache_control?.type).toBe('ephemeral');
  });

  it('sends effort only when one is configured', async () => {
    const { client, create } = stub([{ type: 'text', text: 'rice' }]);
    const withEffort = new BedrockLanguageProvider({
      region: 'us-west-2',
      model: 'us.anthropic.claude-opus-5',
      effort: 'low',
      client,
    });
    await withEffort.translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });

    const request = create.mock.calls[0]?.[0] as { output_config?: { effort?: string } };
    expect(request.output_config?.effort).toBe('low');
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

  it('keeps only what is inside the tags when the model keeps talking', async () => {
    // What Haiku 4.5 actually did on "dinner is ready" — English text under Ma's
    // bn-BD label. It answered, noticed it had broken the rule it was given, and
    // reconsidered out loud. All of it reached the household as the message.
    const { client } = stub([
      {
        type: 'text',
        text: 'dinner is ready</t>\n\nWait, I need to reconsider. You have given me English text',
      },
    ]);
    const result = await provider(client).translate({
      text: 'dinner is ready',
      from: 'bn-BD',
      to: 'en-US',
    });

    expect(result.text).toBe('dinner is ready');
  });

  it('strips the opening tag if the model echoes it back', async () => {
    const { client } = stub([{ type: 'text', text: '<t>rice</t>' }]);
    const result = await provider(client).translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });

    expect(result.text).toBe('rice');
  });

  it('refuses a rendering the model never finished, rather than speaking it aloud', async () => {
    const { client } = stub([
      { type: 'text', text: 'রান্না হয়ে গেছে\n\nWait, I need to reconsider.' },
    ]);
    await expect(
      provider(client).translate({ text: 'dinner is ready', from: 'bn-BD', to: 'en-US' }),
    ).rejects.toThrow(/did not close its reply/i);
  });

  it('prefills the opening tag and stops at the closing one', async () => {
    const { client, create } = stub([{ type: 'text', text: 'rice' }]);
    await provider(client).translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });

    const request = create.mock.calls[0]?.[0] as {
      stop_sequences: string[];
      messages: { role: string; content: string }[];
    };
    expect(request.stop_sequences).toEqual(['</t>']);
    expect(request.messages.at(-1)).toEqual({ role: 'assistant', content: '<t>' });
  });

  it('offers the source language as a guess, not as an instruction to translate', async () => {
    // Telling it to carry English "dinner is ready" *from Bangla* is what set the
    // model arguing in the first place.
    const { client, create } = stub([{ type: 'text', text: 'rice' }]);
    await provider(client).translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });

    const request = create.mock.calls[0]?.[0] as { messages: { content: string }[] };
    expect(request.messages[0]?.content).toContain('guess');
    expect(request.messages[0]?.content).toContain('unchanged');
  });

  it('throws rather than handing back the untranslated original', async () => {
    const { client } = stub([{ type: 'text', text: '   ' }]);
    await expect(
      provider(client).translate({ text: 'chal', from: 'bn-BD', to: 'en-US' }),
    ).rejects.toThrow(/no text/i);
  });
});
