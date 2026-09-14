export const SIM_UI = String.raw`<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Alexa+ simulator — Alexa Language Bridge</title>
<style>
  :root {
    --bg:#0d1117; --panel:#161b22; --line:#262c36; --ink:#e6edf3; --muted:#8b949e;
    --accent:#58a6ff; --glow:#1f6feb;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  .shell { max-width:1080px; margin:0 auto; padding:24px 20px 40px; }
  header { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
  h1 { font-size:17px; margin:0; font-weight:650; }
  .sub { color:var(--muted); font-size:13px; }
  .who { margin-left:auto; display:flex; gap:6px; }
  .who button { background:var(--panel); border:1px solid var(--line); color:var(--muted);
                padding:6px 12px; border-radius:999px; cursor:pointer; font:inherit; font-size:13px; }
  .who button[aria-pressed="true"] { border-color:var(--accent); color:var(--ink); box-shadow:0 0 0 1px var(--glow) inset; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  @media (max-width:900px) { .grid { grid-template-columns:1fr; } }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:16px; overflow:hidden; }
  .panel h2 { margin:0; padding:12px 16px; font-size:11px; letter-spacing:.08em; text-transform:uppercase;
              color:var(--muted); border-bottom:1px solid var(--line); font-weight:600; }
  #log { height:440px; overflow-y:auto; padding:14px 16px; }
  .turn { margin-bottom:14px; }
  .turn .said { font-size:15px; }
  .turn .said b { color:var(--accent); }
  .turn .reply { margin-top:5px; padding-left:12px; border-left:2px solid var(--line);
                 white-space:pre-wrap; color:var(--ink); }
  .turn.err .reply { border-left-color:#f85149; color:#ffa198; }
  .tool { display:inline-block; margin-top:5px; font-size:11px; color:var(--muted);
          font-family:ui-monospace,SFMono-Regular,monospace; }
  form { display:flex; gap:8px; padding:12px 16px; border-top:1px solid var(--line); }
  input[type=text] { flex:1; background:#0d1117; border:1px solid var(--line); color:var(--ink);
                     padding:10px 12px; border-radius:10px; font:inherit; }
  input[type=text]:focus { outline:none; border-color:var(--accent); }
  button.send { background:var(--glow); border:0; color:#fff; padding:10px 16px; border-radius:10px;
                font:inherit; font-weight:600; cursor:pointer; }
  #screen { height:440px; background:#000; display:flex; align-items:center; justify-content:center; }
  #screen iframe { width:100%; height:100%; border:0; }
  #screen .idle { color:var(--muted); font-size:13px; }
  .hints { padding:10px 16px; border-top:1px solid var(--line); display:flex; flex-wrap:wrap; gap:6px; }
  .hints button { background:transparent; border:1px solid var(--line); color:var(--muted);
                  padding:5px 10px; border-radius:8px; font:inherit; font-size:12px; cursor:pointer; }
  .hints button:hover { color:var(--ink); border-color:var(--accent); }
</style>
<div class="shell">
  <header>
    <h1>Alexa+ simulator</h1>
    <span class="sub">Alexa Language Bridge · MCP 2025-11-25 · OAuth 2.1</span>
    <div class="who" id="who"></div>
  </header>

  <div class="grid">
    <div class="panel">
      <h2>Conversation</h2>
      <div id="log"></div>
      <div class="hints" id="hints"></div>
      <form id="form">
        <input type="text" id="utterance" autocomplete="off" placeholder="Say something…">
        <button class="send" type="submit">Say</button>
      </form>
    </div>

    <div class="panel">
      <h2>Device screen</h2>
      <div id="screen"><span class="idle">The card appears here.</span></div>
    </div>
  </div>
</div>
<script>
  const log = document.getElementById('log');
  const screen = document.getElementById('screen');
  const whoBar = document.getElementById('who');
  const hints = document.getElementById('hints');
  let speaker = 'Ma';
  let members = [];

  const HINTS = {
    Ma: ['chal add koro', 'list ta porho', 'bati nibhiye dao', 'Rafi ke bolo khabar ready'],
    Rafi: ["what's on the list", 'add milk to the list', 'my messages', 'turn on the lamp'],
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function renderWho() {
    whoBar.innerHTML = members.map(m =>
      '<button data-name="' + esc(m.name) + '" aria-pressed="' + (m.name === speaker) + '">' +
      esc(m.name) + ' · ' + esc(m.language) + '</button>').join('');
    whoBar.querySelectorAll('button').forEach(b => b.onclick = () => {
      speaker = b.dataset.name; renderWho(); renderHints();
    });
  }

  function renderHints() {
    const list = HINTS[speaker] || [];
    hints.innerHTML = list.map(h => '<button>' + esc(h) + '</button>').join('');
    hints.querySelectorAll('button').forEach(b => b.onclick = () => say(b.textContent));
  }

  function addTurn(said, turn) {
    const el = document.createElement('div');
    el.className = 'turn' + (turn.isError ? ' err' : '');
    el.innerHTML = '<div class="said"><b>' + esc(speaker) + ':</b> ' + esc(said) + '</div>' +
      '<div class="reply">' + esc(turn.speech) + '</div>' +
      (turn.tool ? '<span class="tool">' + esc(turn.tool) + '</span>' : '');
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function showCard(turn) {
    if (!turn.cardHtml) return;
    // Both closing-tag strings below are split deliberately. Writing that tag as a
    // literal anywhere inside an inline script — code or comment — ends the block
    // early, and the rest of the file renders as text on the page.
    const doc = turn.cardHtml.replace('</' + 'script>',
      '\nglobalThis.mcpAppData = ' + JSON.stringify(turn.structuredContent) +
      ';\nrender(globalThis.mcpAppData);\n</' + 'script>');
    screen.innerHTML = '';
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.srcdoc = doc;
    screen.appendChild(frame);
  }

  async function say(utterance) {
    if (!utterance) return;
    const res = await fetch('/api/say', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ speaker, utterance })
    });
    const turn = await res.json();
    addTurn(utterance, turn);
    showCard(turn);
  }

  document.getElementById('form').onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById('utterance');
    const value = input.value.trim();
    input.value = '';
    say(value);
  };

  (async () => {
    members = await (await fetch('/api/members')).json();
    if (members.length) speaker = members[0].name;
    renderWho(); renderHints();
  })();
</script>`;
