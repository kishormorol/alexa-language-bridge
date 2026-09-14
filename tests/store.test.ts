import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HouseholdStore } from '../src/state/store.js';

let dir: string;
let store: HouseholdStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alb-'));
  store = new HouseholdStore(join(dir, 'state.json'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('HouseholdStore', () => {
  it('persists members across a reload, which is the whole point of the store', async () => {
    await store.addMember('h1', 'Ma', 'bn-BD');
    await store.flush();

    store.reset();
    const found = await store.findMember('h1', 'ma');
    expect(found?.name).toBe('Ma');
    expect(found?.language).toBe('bn-BD');
  });

  it('updates language instead of duplicating on re-registration', async () => {
    await store.addMember('h1', 'Ma', 'bn-BD');
    await store.addMember('h1', 'ma', 'hi-IN');

    const house = await store.household('h1');
    expect(house.members).toHaveLength(1);
    expect(house.members[0]?.language).toBe('hi-IN');
  });

  it('keeps households isolated from each other', async () => {
    await store.addMember('h1', 'Ma', 'bn-BD');
    await store.addMember('h2', 'Ma', 'es-US');

    expect((await store.findMember('h1', 'Ma'))?.language).toBe('bn-BD');
    expect((await store.findMember('h2', 'Ma'))?.language).toBe('es-US');
  });

  it('returns only unread messages unless asked for all', async () => {
    const ma = await store.addMember('h1', 'Ma', 'bn-BD');
    const son = await store.addMember('h1', 'Rafi', 'en-US');
    const base = {
      fromMemberId: ma.id,
      toMemberId: son.id,
      createdAt: new Date().toISOString(),
      readAt: null,
      original: { language: 'bn-BD' as const, text: 'hello' },
      renderings: [{ language: 'bn-BD' as const, text: 'hello' }],
    };
    await store.addMessage('h1', { ...base, id: 'm1' });
    await store.addMessage('h1', { ...base, id: 'm2' });

    await store.markRead('h1', ['m1']);

    expect(await store.messagesFor('h1', son.id, false)).toHaveLength(1);
    expect(await store.messagesFor('h1', son.id, true)).toHaveLength(2);
  });
});
