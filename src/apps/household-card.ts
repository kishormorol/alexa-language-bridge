import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { APP_MIME_TYPE } from './contract.js';

export const HOUSEHOLD_CARD_URI = 'ui://household/card.html';

/**
 * The card the household sees on screen: what was said, and what everyone else
 * hears. Two columns, never one translated into the other — that framing is the
 * whole point of the product and the card is where it becomes visible.
 *
 * Self-contained: no network, no fonts, no script sources. Hosts render this in a
 * sandboxed iframe with a restrictive CSP, so anything external simply would not load.
 */
const HTML = String.raw`<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Household</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #faf9f7;
    --card: #ffffff;
    --ink: #1a1a1a;
    --muted: #6b6b6b;
    --line: #e6e3de;
    --accent: #b45309;
    --accent-soft: #fef3c7;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #17161a;
      --card: #201f24;
      --ink: #f2f0ed;
      --muted: #9b9792;
      --line: #33313a;
      --accent: #fbbf24;
      --accent-soft: #3b2f14;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    background: var(--bg);
    color: var(--ink);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .wrap { max-width: 640px; margin: 0 auto; }
  h1 {
    margin: 0 0 12px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  @media (max-width: 460px) { .pair { grid-template-columns: 1fr; } }
  .side { background: var(--card); padding: 14px 16px; min-width: 0; }
  .who {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;
  }
  .name { font-weight: 600; font-size: 14px; }
  .lang {
    font-size: 11px;
    color: var(--muted);
    background: var(--accent-soft);
    color: var(--accent);
    padding: 2px 7px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .said { font-size: 17px; overflow-wrap: anywhere; }
  ol { margin: 0; padding-left: 20px; }
  li { padding: 3px 0; overflow-wrap: anywhere; }
  li.done { color: var(--muted); text-decoration: line-through; }
  .empty { color: var(--muted); font-style: italic; padding: 20px; text-align: center; }
</style>
<div class="wrap" id="root"><p class="empty">Waiting for the household…</p></div>
<script>
  const root = document.getElementById('root');

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));

  function side(person) {
    return '<div class="side">' +
      '<div class="who"><span class="name">' + esc(person.name) + '</span>' +
      '<span class="lang">' + esc(person.languageName || person.language) + '</span></div>' +
      '<div class="said">' + esc(person.text) + '</div></div>';
  }

  function render(data) {
    if (!data || !data.kind) return;

    if (data.kind === 'exchange') {
      root.innerHTML = '<h1>' + esc(data.title || 'In the room') + '</h1>' +
        '<div class="pair">' + side(data.spoken) + side(data.heard) + '</div>';
      return;
    }

    if (data.kind === 'list') {
      const items = (data.items || []).map((i) =>
        '<li class="' + (i.done ? 'done' : '') + '">' + esc(i.text) + '</li>').join('');
      root.innerHTML = '<h1>' + esc(data.title || 'List') + '</h1>' +
        (items
          ? '<div class="pair" style="grid-template-columns:1fr"><div class="side">' +
            '<div class="who"><span class="name">' + esc(data.reader.name) + '</span>' +
            '<span class="lang">' + esc(data.reader.languageName || data.reader.language) +
            '</span></div><ol>' + items + '</ol></div></div>'
          : '<p class="empty">Nothing on it.</p>');
    }
  }

  // Hosts deliver tool output to the view; accept the shapes in the wild rather
  // than insisting on one, since host implementations still vary.
  addEventListener('message', (event) => {
    const d = event.data;
    if (!d || typeof d !== 'object') return;
    render(d.structuredContent ?? d.data ?? d.params?.structuredContent ?? d);
  });

  if (globalThis.mcpAppData) render(globalThis.mcpAppData);
</script>`;

export function registerHouseholdCard(server: McpServer): void {
  server.registerResource(
    'Household card',
    HOUSEHOLD_CARD_URI,
    {
      title: 'Household card',
      description:
        'Shows what was said and what the other person hears, side by side, so the room can follow.',
      mimeType: APP_MIME_TYPE,
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: APP_MIME_TYPE, text: HTML }],
    }),
  );
}
