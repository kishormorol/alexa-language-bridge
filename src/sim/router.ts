/**
 * Decides which tool an utterance should call.
 *
 * In the real product Alexa+ does this — it is the MCP host's job, not the server's.
 * The simulator has to stand in for it, so this is deliberately behind an interface:
 * `rules` keeps the demo running offline and deterministically, and a Bedrock-backed
 * router replaces it once model access lands, with nothing else changing.
 */
export interface Intent {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface Router {
  readonly name: string;
  route(utterance: string, speaker: string, householdId: string): Promise<Intent | null>;
}

/** Keyword sets, English plus transliterated Bangla as the demo uses it. */
const VERBS = {
  add: [/\badd\b/i, /\bput\b.*\b(on|to)\b.*\blist\b/i, /\bjog kor/i, /\bkino\b/i],
  readList: [/what('?s| is)? on the .*list/i, /\bread\b.*\blist\b/i, /\bshow\b.*\blist\b/i, /\blist ta\b/i],
  complete: [/\b(tick|check|cross)\b.*\boff\b/i, /\bdone\b/i, /\bgot\b.*\balready\b/i, /\bhoye geche\b/i],
  remind: [/\bremind\b/i, /\bmone koriye\b/i],
  reminders: [/\bmy reminders\b/i, /\bwhat.*remind/i],
  on: [/\bturn on\b/i, /\bswitch on\b/i, /\bjaliye\b/i],
  off: [/\bturn off\b/i, /\bswitch off\b/i, /\bnibhiye\b/i, /\bbondho kor/i],
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

export class RuleRouter implements Router {
  readonly name = 'rules';

  async route(utterance: string, speaker: string, householdId: string): Promise<Intent | null> {
    const base = { householdId, member: speaker };

    if (any(VERBS.messages, utterance)) return { tool: 'get_messages', arguments: { householdId, member: speaker } };
    if (any(VERBS.reminders, utterance)) return { tool: 'get_reminders', arguments: base };
    if (any(VERBS.readList, utterance)) return { tool: 'read_list', arguments: base };

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

    for (const pattern of VERBS.tell) {
      const match = pattern.exec(utterance);
      const to = match?.[1];
      if (match && to) {
        const message = utterance
          .slice(match.index + match[0].length)
          .replace(/^\s*(that|ke)\s*/i, '')
          .trim();
        if (message !== '') {
          return { tool: 'leave_message', arguments: { householdId, from: speaker, to, message } };
        }
      }
    }

    if (any(VERBS.add, utterance)) {
      return { tool: 'add_to_list', arguments: { ...base, item: payload(utterance, VERBS.add) } };
    }

    return null;
  }
}

export function createRouter(kind: string): Router {
  switch (kind) {
    case 'rules':
      return new RuleRouter();
    case 'bedrock':
      throw new Error('ROUTER=bedrock is not implemented yet — blocked on Bedrock model access.');
    default:
      throw new Error(`Unknown ROUTER "${kind}"`);
  }
}
