/**
 * Decides which tool an utterance should call.
 *
 * In the real product Alexa+ does this — it is the MCP host's job, not the server's.
 * The simulator has to stand in for it, so this is deliberately behind an interface:
 * `rules` keeps the demo running offline and deterministically, `bedrock` routes with
 * Claude, and `hybrid` tries the rules before paying for a model call.
 */
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { config } from '../config.js';

export interface Intent {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface Router {
  readonly name: string;
  route(utterance: string, speaker: string, householdId: string): Promise<Intent | null>;
  /** Receives the server's tools once the host has listed them. */
  useTools?(tools: ToolDescriptor[]): void;
}

/** Keyword sets, English plus transliterated Bangla as the demo uses it. */
const VERBS = {
  add: [/\badd\b/i, /\bput\b.*\b(on|to)\b.*\blist\b/i, /\bjog kor\w*/i, /\bkino\b/i],
  readList: [/what('?s| is)? on the .*list/i, /\bread\b.*\blist\b/i, /\bshow\b.*\blist\b/i, /\blist ta\b/i],
  complete: [/\b(tick|check|cross)\b.*\boff\b/i, /\bdone\b/i, /\bgot\b.*\balready\b/i, /\bhoye geche\b/i],
  remind: [/\bremind\b/i, /\bmone koriye\b/i],
  reminders: [/\bmy reminders\b/i, /\bwhat.*remind/i],
  on: [/\bturn on\b/i, /\bswitch on\b/i, /\bjaliye\b/i],
  off: [/\bturn off\b/i, /\bswitch off\b/i, /\bnibhiye\b/i, /\bbondho kor\w*/i],
  // English puts the recipient after the verb, Bangla before it: "tell Rafi ..."
  // versus "Rafi ke bolo ...". Both shapes capture the name in group 1.
  tell: [
    /\btell\b\s+(\w+)/i,
    /\bmessage\b\s+(?:for|to)\s+(\w+)/i,
    /\b(\w+)\s+ke\s+bolo\b/i,
  ],
  messages: [/\bmy messages\b/i, /\banything for me\b/i, /\bkichu ache\b/i],
} as const;

const any = (patterns: readonly RegExp[], s: string) => patterns.some((p) => p.test(s));

/**
 * Words that carry the command rather than the subject, in both languages the demo
 * uses. Bangla puts its verb at the end ("chal add koro"), so stripping only a
 * leading English verb leaves the Bangla one behind and the wrong noun in hand.
 */
const FILLER = [
  /\b(please|dao|koro|kore|korun|nao|nio|porho|poro|ta|ti|amake|amar)\b/gi,
  /\b(to|on|from|in|the)\s+(the\s+)?(shopping\s+)?list\b/gi,
  /\b(off|on)\b/gi,
  /\b(the|a|an)\b/gi,
];

/** Remove the command words so what remains is the thing being talked about. */
function payload(utterance: string, matched: readonly RegExp[]): string {
  let out = utterance;
  for (const pattern of matched) {
    out = out.replace(new RegExp(pattern.source, 'gi'), ' ');
  }
  for (const pattern of FILLER) out = out.replace(pattern, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * "tell me ..." is not a message to anyone — it is how people ask the house for
 * something, and it must fall through to the command rules.
 */
const SELF = /^(me|amake|ami|nijeke)$/i;

/** A message addressed to another member, or null if this is not one. */
function addressed(utterance: string, speaker: string, householdId: string): Intent | null {
  for (const pattern of VERBS.tell) {
    const match = pattern.exec(utterance);
    const to = match?.[1];
    if (!match || !to || SELF.test(to)) continue;
    const message = utterance
      .slice(match.index + match[0].length)
      .replace(/^\s*(that|ke|je)\s*/i, '')
      .trim();
    if (message !== '') {
      return { tool: 'leave_message', arguments: { householdId, from: speaker, to, message } };
    }
  }
  return null;
}

export class RuleRouter implements Router {
  readonly name = 'rules';

  async route(utterance: string, speaker: string, householdId: string): Promise<Intent | null> {
    const base = { householdId, member: speaker };

    if (any(VERBS.messages, utterance)) return { tool: 'get_messages', arguments: { householdId, member: speaker } };
    if (any(VERBS.reminders, utterance)) return { tool: 'get_reminders', arguments: base };
    if (any(VERBS.readList, utterance)) return { tool: 'read_list', arguments: base };

    // Before any of the command rules. Everything after "tell Rafi" is quoted
    // speech, not an instruction to the house: "tell Rafi that ranna hoye geche" is
    // a message that happens to contain the words for "it's cooked", and testing
    // the command verbs first hears it as ticking something off a list. Whoever the
    // message is about, the addressing is the stronger signal.
    const message = addressed(utterance, speaker, householdId);
    if (message) return message;

    if (any(VERBS.off, utterance) || any(VERBS.on, utterance)) {
      const off = any(VERBS.off, utterance);
      return {
        tool: 'set_device_state',
        arguments: {
          ...base,
          device: payload(utterance, off ? VERBS.off : VERBS.on),
          state: off ? 'off' : 'on',
        },
      };
    }

    if (any(VERBS.complete, utterance)) {
      return { tool: 'complete_list_item', arguments: { ...base, item: payload(utterance, VERBS.complete) } };
    }

    if (any(VERBS.remind, utterance)) {
      const due = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const to = /\bremind\s+(\w+)/i.exec(utterance)?.[1];
      const forMember = to && !/^me$/i.test(to) ? { forMember: to } : {};
      return {
        tool: 'set_reminder',
        arguments: { ...base, ...forMember, reminder: payload(utterance, VERBS.remind), dueAt: due },
      };
    }

    if (any(VERBS.add, utterance)) {
      return { tool: 'add_to_list', arguments: { ...base, item: payload(utterance, VERBS.add) } };
    }

    return null;
  }
}

/** A tool as the host discovered it from `tools/list`. */
export interface ToolDescriptor {
  name: string;
  description?: string | undefined;
  inputSchema: { type: 'object'; [key: string]: unknown };
}

/** The slice of the Bedrock client this router uses, so tests can stand in for it. */
export interface MessagesClient {
  messages: { create(body: Record<string, unknown>): Promise<{ content: unknown[] }> };
}

/**
 * The way out when nothing fits. With `tool_choice: auto`, Haiku 4.5 answered short
 * Bangla commands in prose — "chal add koro" got "What item should I add?" — and the
 * same sentence routed on one call and not the next. Forcing a tool call and giving
 * "nothing fits" a tool of its own leaves no prose to fall into.
 */
const NOTHING = 'nothing_to_do';

const NOTHING_TOOL = {
  name: NOTHING,
  description: 'Call this when what was said is not something any household tool can do.',
  input_schema: { type: 'object', properties: {} },
};

const ROUTER_SYSTEM = [
  'You are the voice assistant of one household. Each turn, one member of the',
  'household says something, and you decide which tool carries it out.',
  '',
  'Rules:',
  `- Always call exactly one tool. If none of the household tools fits, call ${NOTHING}.`,
  '- Never ask a follow-up question. A short command is complete: the words that are',
  '  not the verb are the item, device or message.',
  '- People speak English, Bangla, or Bangla typed in Latin letters ("chal add koro"',
  '  adds rice to the list; "bati nibhiye dao" turns the lamp off). Bangla usually puts',
  '  the verb last.',
  '- Keep items, device names and message text in the words the speaker used. Do not',
  '  translate them; the server renders them for each reader.',
  '- "tell Rafi that ..." or "Rafi ke bolo ..." is a message to Rafi. Everything after',
  '  the addressing is the message, even if it sounds like a command.',
  '- The speaker is the member acting unless they name someone else.',
  '- For a reminder with no time given, set it one hour from now.',
  '',
  'Examples of short romanised Bangla, which is where routing goes wrong:',
  '- "chal add koro" → add_to_list, item "chal" (rice)',
  '- "dim kinte hobe" → add_to_list, item "dim" (eggs)',
  '- "dudh ta hoye geche" → complete_list_item, item "dudh" (milk)',
  '- "list ta porho" → read_list',
  '- "bati jaliye dao" → set_device_state, device "bati" (lamp), state on',
  '- "amar kono message ache?" → get_messages',
].join('\n');

/**
 * The time where the household is, with its offset. Given UTC, the model read
 * "remind Ma at 8pm" as 20:00Z — mid-afternoon in the kitchen it was said in.
 */
function localNow(date = new Date()): string {
  const offset = -date.getTimezoneOffset();
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 19);
  return `${local}${offset >= 0 ? '+' : '-'}${pad(offset / 60)}:${pad(offset % 60)}`;
}

/**
 * Tools the household operates by voice. Registration is setup a family does once,
 * not something a stray sentence should be able to trigger.
 */
const routable = (tool: ToolDescriptor) => !tool.name.startsWith('register_');

/**
 * Routes with Claude on Bedrock, using the tool list the host discovered — so the
 * router and the server cannot drift apart on names or arguments.
 */
export class BedrockRouter implements Router {
  readonly name = 'bedrock';
  readonly #client: MessagesClient;
  readonly #model: string;
  #tools: ToolDescriptor[] = [];

  constructor(options: {
    region: string;
    model: string;
    profile?: string | undefined;
    client?: MessagesClient | undefined;
  }) {
    this.#client =
      options.client ??
      (new AnthropicBedrock({
        awsRegion: options.region,
        ...(options.profile ? { awsProfile: options.profile } : {}),
      }) as unknown as MessagesClient);
    this.#model = options.model;
  }

  useTools(tools: ToolDescriptor[]): void {
    this.#tools = tools.filter(routable);
  }

  async route(utterance: string, speaker: string, householdId: string): Promise<Intent | null> {
    if (this.#tools.length === 0) throw new Error('BedrockRouter has no tools; call useTools first');

    const response = await this.#client.messages.create({
      model: this.#model,
      max_tokens: 1024,
      system: [{ type: 'text', text: ROUTER_SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: [
        ...this.#tools.map((tool) => ({
          name: tool.name,
          description: tool.description ?? '',
          input_schema: tool.inputSchema,
        })),
        NOTHING_TOOL,
      ],
      tool_choice: { type: 'any', disable_parallel_tool_use: true },
      messages: [
        {
          role: 'user',
          content:
            `Household: ${householdId}\nSpeaker: ${speaker}\n` +
            `Now: ${localNow()}\n\n${utterance}`,
        },
      ],
    });

    const call = (response.content as { type: string; name?: string; input?: unknown }[]).find(
      (block) => block.type === 'tool_use',
    );
    if (!call?.name || !this.#tools.some((tool) => tool.name === call.name)) return null;

    // The household is the host's to decide, never the model's: a sentence must not
    // be able to reach into another household.
    const args = { ...(call.input as Record<string, unknown>), householdId };
    return { tool: call.name, arguments: args };
  }
}

/**
 * Rules first, the model only when they have nothing. The phrases a kitchen repeats
 * stay instant and free; the ones nobody wrote a rule for still get understood.
 */
export class HybridRouter implements Router {
  readonly name = 'hybrid';

  constructor(
    private readonly rules: Router,
    private readonly model: BedrockRouter,
  ) {}

  useTools(tools: ToolDescriptor[]): void {
    this.model.useTools(tools);
  }

  async route(utterance: string, speaker: string, householdId: string): Promise<Intent | null> {
    return (
      (await this.rules.route(utterance, speaker, householdId)) ??
      this.model.route(utterance, speaker, householdId)
    );
  }
}

export function createRouter(kind: string): Router {
  const bedrock = () =>
    new BedrockRouter({
      region: config.awsRegion,
      model: config.bedrockModelId,
      profile: config.awsProfile,
    });

  switch (kind) {
    case 'rules':
      return new RuleRouter();
    case 'bedrock':
      return bedrock();
    case 'hybrid':
      return new HybridRouter(new RuleRouter(), bedrock());
    default:
      throw new Error(`Unknown ROUTER "${kind}"`);
  }
}
