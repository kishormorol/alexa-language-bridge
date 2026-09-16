import { describe, expect, it, vi } from 'vitest';
import {
  BedrockRouter,
  HybridRouter,
  RuleRouter,
  type MessagesClient,
  type ToolDescriptor,
} from '../src/sim/router.js';

const router = new RuleRouter();
const route = (u: string, who = 'Ma') => router.route(u, who, 'h');

describe('RuleRouter', () => {
  it('extracts the item when the verb trails, as it does in Bangla', async () => {
    const intent = await route('chal add koro');
    expect(intent?.tool).toBe('add_to_list');
    expect(intent?.arguments['item']).toBe('chal');
  });

  it('extracts the item when the verb leads, as it does in English', async () => {
    const intent = await route('add milk to the list', 'Rafi');
    expect(intent?.tool).toBe('add_to_list');
    expect(intent?.arguments['item']).toBe('milk');
  });

  it('extracts the device name out of a trailing-verb command', async () => {
    const intent = await route('bati nibhiye dao');
    expect(intent?.tool).toBe('set_device_state');
    expect(intent?.arguments['device']).toBe('bati');
    expect(intent?.arguments['state']).toBe('off');
  });

  it('strips the whole Bangla verb, not just its stem', async () => {
    // "bondho kor" matched inside "bondho koro" and left the "o" behind: the device
    // came out as "fan o", which matches nothing in the house.
    expect((await route('fan ta bondho koro'))?.arguments['device']).toBe('fan');
    expect((await route('chal jog koro'))?.arguments['item']).toBe('chal');
  });

  it('reads state off turn on / turn off', async () => {
    expect((await route('turn on the lamp', 'Rafi'))?.arguments['state']).toBe('on');
    expect((await route('turn off the lamp', 'Rafi'))?.arguments['state']).toBe('off');
  });

  it('routes a message to the named recipient with the rest as the body', async () => {
    const intent = await route('tell Rafi that dinner is ready');
    expect(intent?.tool).toBe('leave_message');
    expect(intent?.arguments['to']).toBe('Rafi');
    expect(intent?.arguments['message']).toBe('dinner is ready');
  });

  it('routes list reads in either language', async () => {
    expect((await route("what's on the list", 'Rafi'))?.tool).toBe('read_list');
    expect((await route('list ta porho'))?.tool).toBe('read_list');
  });

  it('gives an ISO timestamp to set_reminder, which the tool requires', async () => {
    const intent = await route('remind me to call the doctor');
    expect(intent?.tool).toBe('set_reminder');
    expect(Number.isNaN(Date.parse(String(intent?.arguments['dueAt'])))).toBe(false);
  });

  it('returns null rather than guessing at something it does not understand', async () => {
    expect(await route('what is the capital of France')).toBeNull();
  });
});

describe('RuleRouter article handling', () => {
  it('drops the article so the device name matches what was registered', async () => {
    const intent = await route('turn off the lamp', 'Rafi');
    expect(intent?.arguments['device']).toBe('lamp');
  });
});

describe('RuleRouter word order', () => {
  it('finds the recipient when the name precedes the verb, as in Bangla', async () => {
    const intent = await route('Rafi ke bolo khabar ready');
    expect(intent?.tool).toBe('leave_message');
    expect(intent?.arguments['to']).toBe('Rafi');
    expect(intent?.arguments['message']).toBe('khabar ready');
  });

  it('still finds it when the name follows the verb, as in English', async () => {
    const intent = await route('tell Rafi that dinner is ready', 'Ma');
    expect(intent?.arguments['to']).toBe('Rafi');
    expect(intent?.arguments['message']).toBe('dinner is ready');
  });
});

describe('RuleRouter addressed speech', () => {
  it('carries a message whose words are also a command', async () => {
    // "hoye geche" is how the demo ticks something off a list, so this used to
    // answer 'Nothing on the shopping list matches "tell Rafi that ranna"'.
    const intent = await route('tell Rafi that ranna hoye geche');
    expect(intent?.tool).toBe('leave_message');
    expect(intent?.arguments['to']).toBe('Rafi');
    expect(intent?.arguments['message']).toBe('ranna hoye geche');
  });

  it('does not act on a command quoted inside a message', async () => {
    const intent = await route('Rafi ke bolo je bati nibhiye dao');
    expect(intent?.tool).toBe('leave_message');
    expect(intent?.arguments['message']).toBe('bati nibhiye dao');
  });

  it('treats "tell me" as asking the house, not messaging anyone', async () => {
    const intent = await route('tell me the milk is done');
    expect(intent?.tool).toBe('complete_list_item');
  });
});

describe('BedrockRouter', () => {
  const tools: ToolDescriptor[] = [
    { name: 'register_household_member', inputSchema: { type: 'object' } },
    { name: 'add_to_list', description: 'Add an item', inputSchema: { type: 'object' } },
    { name: 'leave_message', description: 'Leave a message', inputSchema: { type: 'object' } },
  ];

  function stub(blocks: unknown[]) {
    const create = vi.fn().mockResolvedValue({ content: blocks });
    const client = { messages: { create } } as unknown as MessagesClient;
    const router = new BedrockRouter({ region: 'us-west-2', model: 'haiku', client });
    router.useTools(tools);
    return { router, create };
  }

  it('offers the server tools to the model, minus one-time registration', async () => {
    const { router, create } = stub([]);
    await router.route('chal add koro', 'Ma', 'h');

    const request = create.mock.calls[0]?.[0] as { tools: { name: string }[]; messages: { content: string }[] };
    expect(request.tools.map((t) => t.name)).toEqual(['add_to_list', 'leave_message', 'nothing_to_do']);
    expect(request.messages[0]?.content).toContain('Speaker: Ma');
    expect(request.messages[0]?.content).toContain('chal add koro');
  });

  it('turns the tool call into an intent', async () => {
    const { router } = stub([
      { type: 'tool_use', name: 'add_to_list', input: { householdId: 'h', member: 'Ma', item: 'chal' } },
    ]);
    expect(await router.route('chal add koro', 'Ma', 'h')).toEqual({
      tool: 'add_to_list',
      arguments: { householdId: 'h', member: 'Ma', item: 'chal' },
    });
  });

  it('keeps the household the host chose, whatever the model put there', async () => {
    const { router } = stub([
      { type: 'tool_use', name: 'add_to_list', input: { householdId: 'someone-else', item: 'chal' } },
    ]);
    const intent = await router.route('chal add koro', 'Ma', 'h');
    expect(intent?.arguments['householdId']).toBe('h');
  });

  it('forces a tool call, so a short command cannot be answered with a question', async () => {
    const { router, create } = stub([]);
    await router.route('chal add koro', 'Ma', 'h');

    const request = create.mock.calls[0]?.[0] as { tool_choice: { type: string } };
    expect(request.tool_choice.type).toBe('any');
  });

  it('returns null when the model says nothing fits', async () => {
    const { router } = stub([{ type: 'tool_use', name: 'nothing_to_do', input: {} }]);
    expect(await router.route('what is the capital of France', 'Ma', 'h')).toBeNull();
  });

  it('refuses a tool it was not offered', async () => {
    const { router } = stub([
      { type: 'tool_use', name: 'register_household_member', input: { name: 'Stranger' } },
    ]);
    expect(await router.route('add a stranger to the family', 'Ma', 'h')).toBeNull();
  });
});

describe('HybridRouter', () => {
  it('answers from the rules without calling the model when they match', async () => {
    const create = vi.fn();
    const model = new BedrockRouter({
      region: 'us-west-2',
      model: 'haiku',
      client: { messages: { create } } as unknown as MessagesClient,
    });
    const intent = await new HybridRouter(new RuleRouter(), model).route('chal add koro', 'Ma', 'h');

    expect(intent?.tool).toBe('add_to_list');
    expect(create).not.toHaveBeenCalled();
  });

  it('asks the model when the rules have nothing', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'tool_use', name: 'read_list', input: { member: 'Ma' } }],
    });
    const model = new BedrockRouter({
      region: 'us-west-2',
      model: 'haiku',
      client: { messages: { create } } as unknown as MessagesClient,
    });
    const hybrid = new HybridRouter(new RuleRouter(), model);
    hybrid.useTools([{ name: 'read_list', inputSchema: { type: 'object' } }]);

    const intent = await hybrid.route('bajar e ki ki lagbe', 'Ma', 'h');
    expect(intent).toEqual({ tool: 'read_list', arguments: { member: 'Ma', householdId: 'h' } });
  });
});
