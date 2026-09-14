import { AnthropicBedrock, AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import { languageName, type LanguageTag } from '../domain/languages.js';
import type { LanguageProvider, TranslateRequest, TranslateResult } from './provider.js';

/**
 * Carries an utterance between household languages using Claude on Amazon Bedrock.
 *
 * Two things shape this implementation, both from the 500 ms round-trip budget:
 * the system prompt is frozen and cached so it is not re-billed or re-processed on
 * every turn, and the request is kept to a single short sentence.
 */
const SYSTEM = [
  'You carry short spoken sentences between the languages of one household.',
  '',
  'Rules:',
  '- Reply with the translation alone, wrapped in <t></t>. Nothing outside the tags.',
  '- No preamble, no quotes, no notes, no alternatives, no reasoning about the task.',
  '- Decide before you answer. Do not correct yourself in the reply: what is inside',
  '  the tags is spoken aloud in someone\'s home, and a reconsideration spoken aloud',
  '  is not an answer.',
  '- Keep it as someone would actually say it at home, not formally.',
  '- Keep names, brands and numbers exactly as given.',
  '- If the text is already in the target language, reply with it unchanged.',
  '- Never answer the content. A question stays a question; an instruction stays an instruction.',
  '',
'You will be told which writing system the reader uses, and you must obey it.',
  '"Latin letters" means romanise: Bangla for a lamp is "bati", never "বাতি"; milk is',
  '"dudh", never "দুধ". Many people speak a language they do not read in its own',
  'script, and a reply in the wrong script is one they cannot read at all.',
  '',
  'The source language you are given is a guess and is sometimes wrong. Trust the',
  'text over the label. If the text is already in the target language, reply with it',
  'unchanged rather than translating it into the language it came from.',
  '',
  'Romanised words often collide with English ones. When a word could be read either',
  'as the stated source language or as English, prefer the source language — that is',
  'who is speaking. Romanised Bangla "dim" is an egg, not a dimmed light; "jal" is',
  'water, not a jail; "bag" is a tiger, not a handbag.',
  '',
  'You may be told what kind of thing the text is. Use it: short household phrases',
  'are ambiguous without it. Romanised Bangla "chal" is "rice" on a shopping list',
  'and "come on" in conversation, and guessing wrong puts the wrong thing in the',
  'basket.',
].join('\n');

/**
 * Bedrock exposes two endpoints that are NOT interchangeable — different model id
 * forms, and separate account entitlements:
 *
 *   runtime  `us.anthropic.claude-haiku-4-5-20251001-v1:0`  (inference-profile id)
 *   mantle   `anthropic.claude-haiku-4-5`                   (bare id)
 *
 * `runtime` is the default because it is what the hackathon account is entitled to;
 * Mantle returns 403 there. On Mantle a 404 means the id is wrong and a 403 means
 * the id is right but the account is not entitled — the only way to tell apart.
 * See FL-006.
 */
export type BedrockEndpoint = 'runtime' | 'mantle';

/** The reply is delimited so a model that keeps talking can be cut off cleanly. */
const OPEN = '<t>';
const CLOSE = '</t>';

function indexOrEnd(haystack: string, needle: string): number {
  const at = haystack.indexOf(needle);
  return at === -1 ? haystack.length : at;
}

/** The slice of the client this provider uses, so tests can stand in for it. */
export interface MessagesClient {
  messages: { create(body: Record<string, unknown>): Promise<{ content: unknown[] }> };
}

export interface BedrockOptions {
  region: string;
  model: string;
  endpoint?: BedrockEndpoint | undefined;
  profile?: string | undefined;
  /**
   * `output_config.effort`. Omitted by default: it is rejected outright on
   * Haiku 4.5, which is the model this account can actually reach.
   */
  effort?: string | undefined;
  /** Test seam. Omit in production and a real Bedrock client is constructed. */
  client?: MessagesClient | undefined;
}

export class BedrockLanguageProvider implements LanguageProvider {
  readonly name = 'bedrock';
  readonly #client: MessagesClient;
  readonly #model: string;
  readonly #effort: string | undefined;

  constructor(options: BedrockOptions) {
    const region = options.region;
    const awsProfile = options.profile;
    this.#client =
      options.client ??
      ((options.endpoint ?? 'runtime') === 'mantle'
        ? new AnthropicBedrockMantle({
            awsRegion: region,
            ...(awsProfile ? { awsProfile } : {}),
          })
        : new AnthropicBedrock({
            awsRegion: region,
            ...(awsProfile ? { awsProfile } : {}),
          })) as unknown as MessagesClient;
    this.#model = options.model;
    this.#effort = options.effort;
  }

  async translate({
    text,
    to,
    from,
    context,
    toScript,
  }: TranslateRequest): Promise<TranslateResult> {
    const detected: LanguageTag = from ?? to;
    if (detected === to) return { text, detectedLanguage: detected };

    const what = context ? `This is ${context}.\n` : '';
    const script =
      toScript === 'latin'
        ? 'The reader writes their language in Latin letters, so romanise your reply.\n'
        : '';

    const response = await this.#client.messages.create({
      model: this.#model,
      max_tokens: 1024,
      ...(this.#effort ? { output_config: { effort: this.#effort } } : {}),
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      // Closing the tag ends the turn, so anything the model would have said after
      // its answer is never generated or billed.
      stop_sequences: [CLOSE],
      messages: [
        {
          role: 'user',
          content:
            `${what}${script}The speaker's language is usually ` +
            `${languageName(detected)}, but that label is a guess — trust the text ` +
            `itself. Render it so someone who reads ${languageName(to)} hears what ` +
            `was said. If it is already ${languageName(to)}, reply with it ` +
            `unchanged.\n\n${text}`,
        },
        // Prefilling the opening tag starts the reply inside the answer, so there is
        // nowhere to put a preamble.
        { role: 'assistant', content: OPEN },
      ],
    });

    const raw = (response.content as { type: string; text?: string }[])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    // Keep only what is inside the tags. Asked to carry text that is already in the
    // target language, Haiku 4.5 tends to answer, notice the instruction it just
    // broke, and argue with itself — "রান্না হয়ে গেছে / Wait, I need to reconsider
    // …" — and every word of that used to be handed to the household as the
    // message. The stop sequence prevents it in production; this is the belt to
    // that braces, for a reply that arrives whole.
    const translated = raw.slice(0, indexOrEnd(raw, CLOSE)).replace(OPEN, '').trim();

    // Never silently hand back the untranslated original — a wrong-language
    // rendering that looks plausible is worse than an obvious failure.
    if (translated === '') {
      throw new Error(`Bedrock returned no text when carrying ${detected} into ${to}`);
    }

    // A rendering is one spoken line. More than that means the model never closed
    // the tag and is still talking, and the same rule applies: refuse it rather than
    // speak it aloud and cache it.
    if (translated.includes('\n')) {
      throw new Error(
        `Bedrock did not close its reply when carrying ${detected} into ${to}; ` +
          `refusing a rendering it may still have been arguing with`,
      );
    }

    return { text: translated, detectedLanguage: detected };
  }
}
