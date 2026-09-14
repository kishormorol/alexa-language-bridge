import { describe, expect, it } from 'vitest';
import { RuleRouter } from '../src/sim/router.js';

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
