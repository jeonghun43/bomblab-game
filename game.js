// Boot, theme select, and the script director (scene / say / investigate / quiz).
import { SCENES, drawPortrait } from './art.js';
import { setupCanvas, W, H } from './pixel.js';
import { getLevel } from './levels.js';
import { STORIES } from './story.js';
import { renderDecoder, decodePercent, CONCEPT_NAMES } from './decoder.js';
import { openTerminal, closeTerminal, initTerminal, resetTerminals, terminalOpen } from './terminal.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));

const state = {
  story: null, runId: 0, sceneId: null, flags: {}, frame: 0,
  seen: new Set(), clues: [], cards: [], cleared: new Set(), score: 1000, inv: null,
  learned: null, ui: null, concepts: new Set(), lessonsDone: new Set(),
};

// ---------- rendering loop ----------
const sceneCtx = setupCanvas($('scene-canvas'));
const thumbs = [];
function drawAll() {
  if (!$('game').hidden && state.sceneId) SCENES[state.sceneId].draw(sceneCtx, state.frame, state.flags);
  if (!$('select').hidden) for (const t of thumbs) SCENES[t.scene].draw(t.ctx, state.frame, {});
}
setInterval(() => { if (!reduceMotion) state.frame++; drawAll(); }, 125);

// ---------- select screen ----------
function renderSelect() {
  const box = $('theme-cards');
  box.innerHTML = '';
  thumbs.length = 0;
  for (const s of Object.values(STORIES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'skin-card';
    b.dataset.skin = s.id;
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    thumbs.push({ ctx: setupCanvas(cv), scene: s.cover });
    b.appendChild(cv);
    const badge = s.tutorial
      ? '<span class="badge on">처음이라면 여기부터 · 튜토리얼 포함</span>'
      : '<span class="badge off">튜토리얼 준비 중 · gdb를 조금 아는 사람용</span>';
    b.insertAdjacentHTML('beforeend', `${badge}<span class="kicker"></span><h2></h2><p></p><span class="go">이 이야기로 시작 →</span>`);
    b.querySelector('.kicker').textContent = s.kicker;
    b.querySelector('h2').textContent = s.name;
    b.querySelector('p').textContent = s.tagline;
    b.addEventListener('click', () => startStory(s.id));
    box.appendChild(b);
  }
  drawAll();
}

function showSelect() {
  state.runId++;
  closeTerminal({ silent: true });
  resetTerminals();
  dlg.resolve = null;
  app.dataset.skin = 'lab';
  $('game').hidden = true;
  $('modal').hidden = true;
  $('select').hidden = false;
  window.scrollTo(0, 0);
  drawAll();
}

// ---------- story run ----------
function startStory(id) {
  const s = STORIES[id];
  resetTerminals();
  Object.assign(state, {
    story: s, sceneId: null, flags: {}, seen: new Set(), clues: [], cards: [], cleared: new Set(), score: 1000, inv: null,
    learned: s.tutorial ? new Set() : null,
    ui: s.tutorial ? { regs: false, shownRegs: [], code: false } : null,
    concepts: new Set(['hook']), lessonsDone: new Set(),
  });
  $('btn-decoder').hidden = !s.tutorial;
  app.dataset.skin = s.id;
  $('select').hidden = true;
  $('game').hidden = false;
  $('hud-kicker').textContent = s.kicker;
  $('hud-name').textContent = s.name;
  $('score-label').textContent = s.vocab.score;
  renderHud();
  window.scrollTo(0, 0);
  run(++state.runId);
}

async function run(myRun) {
  const script = state.story.script;
  for (const step of script) {
    if (myRun !== state.runId) return;
    if (step.scene) await changeScene(step.scene);
    else if ('say' in step) await say(step.say, step.text);
    else if (step.set) { state.flags[step.set] = true; drawAll(); }
    else if (step.unset) { delete state.flags[step.unset]; drawAll(); await wait(500); }
    else if (step.investigate) await investigate(step.investigate);
    else if (step.quiz) await quiz(step.quiz);
    else if (step.decoder) await showDecoder(step.decoder, step.line);
    else if (step.ending) showEnding();
  }
}

async function changeScene(id) {
  const sc = SCENES[id];
  state.sceneId = id;
  $('place').textContent = sc.name;
  $('spots').innerHTML = '';
  $('objective').hidden = true;
  const card = $('title-card');
  $('title-card-text').textContent = sc.name;
  card.hidden = false;
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
  drawAll();
  setDialog(null, '');
  await wait(1100);
  setTimeout(() => { card.hidden = true; }, reduceMotion ? 0 : 600);
}

// ---------- dialogue ----------
const dlg = { resolve: null, typing: false, full: '', timer: null };

function setSpeaker(who) {
  const box = $('dialog');
  const ch = who ? state.story.chars[who] : null;
  box.classList.toggle('narration', !ch);
  $('dlg-name').textContent = ch ? ch.name : '';
  const pc = $('dlg-portrait');
  pc.classList.toggle('none', !(ch && ch.sprite));
  if (ch && ch.sprite) drawPortrait(pc, ch.sprite);
}

// ---------- glossary terms: "[[레지스터]]" -> clickable ----------
const glossary = () => (state.story && state.story.glossary) || {};
const plainText = (t) => t.replace(/\[\[(.+?)\]\]/g, '$1');
function rich(el, text) {
  el.textContent = '';
  const parts = text.split(/\[\[(.+?)\]\]/);
  parts.forEach((part, i) => {
    if (i % 2 === 0) { if (part) el.appendChild(document.createTextNode(part)); return; }
    if (!glossary()[part]) { el.appendChild(document.createTextNode(part)); return; }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'term';
    b.textContent = part;
    b.addEventListener('click', (e) => { e.stopPropagation(); showGloss(part, b); });
    el.appendChild(b);
  });
}
function showGloss(term, anchor) {
  const g = $('gloss');
  $('gloss-term').textContent = term;
  $('gloss-def').textContent = glossary()[term];
  g.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = g.offsetWidth, h = g.offsetHeight;
  const left = Math.max(16, Math.min(window.innerWidth - w - 16, r.left + r.width / 2 - w / 2));
  const top = r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8;
  g.style.left = `${left}px`;
  g.style.top = `${top}px`;
}
document.addEventListener('click', () => { $('gloss').hidden = true; });

function typeText(text) {
  clearInterval(dlg.timer);
  const el = $('dlg-text');
  dlg.full = text;
  const shown = plainText(text);
  if (reduceMotion) { rich(el, text); dlg.typing = false; return; }
  let i = 0;
  dlg.typing = true;
  el.textContent = '';
  dlg.timer = setInterval(() => {
    i += 1;
    el.textContent = shown.slice(0, i);
    if (i >= shown.length) finishTyping();
  }, 24);
}
function finishTyping() {
  clearInterval(dlg.timer);
  dlg.typing = false;
  rich($('dlg-text'), dlg.full);
}

function setDialog(who, text, { idle = false } = {}) {
  setSpeaker(who);
  $('dlg-choices').innerHTML = '';
  typeText(text);
  $('dialog').classList.toggle('idle', idle);
  $('dlg-next').hidden = idle;
}

function say(who, text) {
  return new Promise((resolve) => {
    setDialog(who, text);
    dlg.resolve = resolve;
  });
}
async function sayLines(lines = []) { for (const l of lines) await say(l.say, l.text); }

function advance() {
  if (dlg.typing) return finishTyping();
  if (dlg.resolve) { const r = dlg.resolve; dlg.resolve = null; r(); }
}

// ---------- investigation ----------
function investigate(inv) {
  return new Promise((resolve) => {
    state.inv = { inv, resolve, busy: false };
    showObjective();
    renderSpots();
    idlePrompt();
  });
}

const spotKey = (spot) => spot.id || spot.at;
function spotDone(key) { return state.seen.has(key); }
function spotLocked(spot) { return !!(spot.requires && !spot.requires.every(spotDone)); }

function showObjective() {
  const { inv } = state.inv;
  const looks = inv.spots.filter((s) => s.kind === 'look');
  const seen = looks.filter((s) => spotDone(spotKey(s))).length;
  const el = $('objective');
  el.hidden = false;
  el.textContent = `${inv.objective}${looks.length > 1 ? `  (${seen}/${looks.length})` : ''}`;
}

function idlePrompt() {
  setDialog(null, '장면 속 사물을 눌러 조사해 보세요. ▶ 표시가 붙은 것은 컴퓨터예요.', { idle: true });
}

function renderSpots() {
  const box = $('spots');
  box.innerHTML = '';
  box.style.pointerEvents = '';
  if (!state.inv) return;
  const rects = SCENES[state.sceneId].spots;
  for (const spot of state.inv.inv.spots) {
    const r = rects[spot.at];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'spot';
    if (spot.kind === 'terminal') b.classList.add('term');
    if (spot.kind === 'look' && spotDone(spotKey(spot))) b.classList.add('seen');
    if (spotLocked(spot)) b.classList.add('lockedspot');
    b.style.left = `${(r[0] / W) * 100}%`;
    b.style.top = `${(r[1] / H) * 100}%`;
    b.style.width = `${(r[2] / W) * 100}%`;
    b.style.height = `${(r[3] / H) * 100}%`;
    b.setAttribute('aria-label', spot.label);
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = spot.label;
    b.appendChild(lbl);
    b.addEventListener('click', (e) => { e.stopPropagation(); onSpot(spot); });
    box.appendChild(b);
  }
}

async function onSpot(spot) {
  const ctx = state.inv;
  if (!ctx || ctx.busy) return;
  ctx.busy = true;
  $('spots').style.pointerEvents = 'none';
  const myRun = state.runId;
  let finished = false;
  if (spotLocked(spot)) {
    await sayLines(spot.locked);
  } else if (spot.kind === 'look') {
    const first = !spotDone(spotKey(spot));
    await sayLines(first || !spot.clue ? spot.lines : [spot.lines[spot.lines.length - 1]]);
    state.seen.add(spotKey(spot));
    if (spot.clue && first) addClue(spot.clue);
    finished = !!spot.ends;
  } else if (spot.kind === 'exit') {
    await sayLines(spot.lines);
    finished = true;
  } else if (spot.kind === 'terminal' && spot.lesson) {
    if (state.lessonsDone.has(spot.lesson.id)) {
      await say(state.story.tutorial ? state.story.guide : null, state.story.tutorial ? '이 연습은 벌써 끝냈잖아. 다음으로 가 보자.' : '이 연습은 이미 끝냈다.');
    } else {
      const res = await openLevel(spot.level, spot.lesson);
      if (myRun !== state.runId) return;
      if (res.done) {
        state.lessonsDone.add(spot.lesson.id);
        if (res.cleared) {
          addScore(res.bonus || 0);
          state.cleared.add(spot.level);
          if (!state.cards.includes(spot.level)) state.cards.push(spot.level);
          renderHud();
          await showCard(spot.level);
        }
        await sayLines(spot.after);
        finished = true;
      }
    }
  } else if (spot.kind === 'terminal') {
    if (state.cleared.has(spot.level)) {
      await say(state.story.tutorial ? state.story.guide : null, state.story.tutorial ? '그건 이미 해제했잖아.' : '이미 해제했다.');
    } else {
      const res = await openLevel(spot.level);
      if (myRun !== state.runId) return;
      if (res.clear) {
        await showCard(spot.level);
        await sayLines(spot.after);
        finished = true;
      }
    }
  }
  if (myRun !== state.runId) return;
  $('spots').style.pointerEvents = '';
  ctx.busy = false;
  if (finished) {
    state.inv = null;
    $('spots').innerHTML = '';
    $('objective').hidden = true;
    ctx.resolve();
  } else {
    showObjective();
    renderSpots();
    idlePrompt();
  }
}

function addClue(clue) {
  state.clues.push(clue);
  renderHud();
  toast(`${state.story.vocab.clue}에 추가: ${clue.title}`);
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'place-tag';
  t.style.top = 'auto';
  t.style.bottom = '10px';
  t.textContent = '✎ ' + text;
  $('scene').appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- terminal ----------
function openLevel(levelId, lesson = null) {
  const s = state.story;
  const guide = s.chars[s.guide];
  $('mon-name').textContent = guide.name;
  drawPortrait($('mon-portrait'), guide.sprite, { alpha: 0.95 });
  return new Promise((resolve) => {
    openTerminal(getLevel(levelId), s, {
      addScore,
      fx,
      rich,
      react: (text, mood) => {
        if (mood === 'angry') { const p = $('mon-portrait'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); }
      },
      onClear: (id, bonus) => {
        addScore(bonus);
        state.cleared.add(id);
        if (!state.cards.includes(id)) state.cards.push(id);
        renderHud();
        resolve({ clear: true });
      },
      onLessonDone: (r) => resolve({ done: true, ...r }),
      onClose: () => resolve({ closed: true }),
    }, { lesson, learned: state.learned, ui: state.ui });
  });
}

// ---------- decoder ----------
function showDecoder(learn = [], line = null) {
  const fresh = new Set(learn.filter((c) => !state.concepts.has(c)));
  for (const c of learn) state.concepts.add(c);
  renderHud();
  return new Promise((resolve) => {
    const pct = decodePercent(state.concepts);
    modal({
      kicker: '해독기 · phase_1',
      title: `해독률 ${pct}%`,
      story: line || (fresh.size ? '새로 읽을 수 있게 된 부분이 반짝입니다. 눌러서 뜻을 확인해 보세요.' : '가려진 부분은 아직 배우지 않은 내용입니다.'),
      body: '<div class="decoder"><div class="dec-meter"><i style="width:0%"></i></div><div id="dec-root"></div><p id="dec-note" class="dec-note">읽을 수 있는 단어를 누르면 뜻이 나옵니다.</p><div id="dec-learned" class="dec-learned"></div></div>',
      wide: true,
      actions: [{ label: pct === 100 ? '해독 완료' : '닫기', fn: () => { closeModal(); resolve(); } }],
      esc: () => { closeModal(); resolve(); },
    });
    renderDecoder($('dec-root'), state.concepts, fresh, (text, note) => {
      const el = $('dec-note');
      el.innerHTML = '<b></b> ';
      el.firstChild.textContent = text;
      el.appendChild(document.createTextNode(note));
    }, state.story.decoderNotes);
    const learned = $('dec-learned');
    for (const c of Object.keys(CONCEPT_NAMES)) {
      if (!state.concepts.has(c)) continue;
      const sp = document.createElement('span');
      sp.textContent = CONCEPT_NAMES[c];
      if (fresh.has(c)) sp.className = 'new';
      learned.appendChild(sp);
    }
    requestAnimationFrame(() => { const bar = document.querySelector('.dec-meter i'); if (bar) bar.style.width = `${pct}%`; });
  });
}

// ---------- quiz ----------
function quiz(q) {
  return new Promise((resolve) => {
    const ask = () => {
      setDialog(q.say, q.question, { idle: true });
      const box = $('dlg-choices');
      q.options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice';
        b.textContent = opt;
        b.addEventListener('click', async (e) => {
          e.stopPropagation();
          box.innerHTML = '';
          const ok = i === q.answer;
          await say(q.say, ok ? q.right : q.wrong);
          if (ok) resolve(); else ask();
        });
        box.appendChild(b);
      });
    };
    ask();
  });
}

// ---------- HUD + modals ----------
function addScore(n) { state.score = Math.max(0, state.score + n); renderHud(); }

function renderHud() {
  const s = state.story;
  $('score').textContent = state.score;
  $('btn-clues').innerHTML = `${s.vocab.clue}<span class="n">${state.clues.length}</span>`;
  $('btn-cards').innerHTML = `${s.vocab.card}<span class="n">${state.cards.length}</span>`;
  if (s.tutorial) $('btn-decoder').innerHTML = `해독기<span class="n">${decodePercent(state.concepts)}%</span>`;
  const ol = $('stage-list');
  ol.innerHTML = '';
  s.levels.forEach((id, i) => {
    const li = document.createElement('li');
    li.textContent = `${s.vocab.stage} ${i}${state.cleared.has(id) ? ' ✓' : ''}`;
    if (state.cleared.has(id)) li.className = 'done';
    ol.appendChild(li);
  });
}

function modal({ kicker, title, story = '', body = '', actions, esc = null, wide = false }) {
  state.modalEsc = esc;
  document.querySelector('.modal-box').classList.toggle('wide', wide);
  $('modal-kicker').textContent = kicker;
  $('modal-title').textContent = title;
  $('modal-story').textContent = story;
  $('modal-story').hidden = !story;
  $('modal-body').innerHTML = body;
  const box = $('modal-actions');
  box.innerHTML = '';
  let first;
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn' + (a.secondary ? ' secondary' : '');
    b.textContent = a.label;
    b.addEventListener('click', a.fn);
    box.appendChild(b);
    if (!a.secondary && !first) first = b;
  }
  $('modal').hidden = false;
  (first || box.firstChild).focus();
}
function closeModal() { $('modal').hidden = true; }

function showCard(levelId) {
  const lv = getLevel(levelId), s = state.story;
  return new Promise((resolve) => modal({
    kicker: `${s.vocab.card} #${s.levels.indexOf(levelId)} 획득`,
    title: lv.card.title,
    body: lv.card.body,
    actions: [{ label: '계속', fn: () => { closeModal(); resolve(); } }],
  }));
}

function showClues() {
  const s = state.story;
  const body = state.clues.length
    ? state.clues.map((c) => `<div class="clue"><b></b><span></span></div>`).join('')
    : '<p class="empty">아직 모은 단서가 없습니다. 장면 속 사물을 눌러 보세요.</p>';
  modal({ kicker: s.name, title: s.vocab.clue, body, actions: [{ label: '닫기', fn: closeModal }], esc: closeModal });
  document.querySelectorAll('#modal-body .clue').forEach((el, i) => {
    el.querySelector('b').textContent = state.clues[i].title;
    el.querySelector('span').textContent = state.clues[i].text;
  });
}

function showCards() {
  const s = state.story;
  const body = state.cards.length
    ? state.cards.map((id) => `<div class="clue"><b>#${s.levels.indexOf(id)} ${getLevel(id).card.title}</b>${getLevel(id).card.body}</div>`).join('')
    : `<p class="empty">퍼즐을 풀면 ${s.vocab.card}가 열립니다.</p>`;
  modal({ kicker: s.name, title: s.vocab.card, body, actions: [{ label: '닫기', fn: closeModal }], esc: closeModal });
}

function showEnding() {
  const s = state.story;
  setDialog(null, '— 끝 —', { idle: true });
  modal({
    kicker: '맛보기 완료',
    title: `${s.endingTitle} · ${s.vocab.score} ${state.score}`,
    story: s.endingText || '',
    body: '<p>다른 이야기도 해 보고, 어느 쪽이 가장 재미있었는지 알려 주세요.</p>',
    actions: [
      { label: '처음부터 다시', secondary: true, fn: () => { closeModal(); startStory(s.id); } },
      { label: '다른 이야기 해 보기', fn: showSelect },
    ],
  });
}

// ---------- effects ----------
function fx(kind, shake) {
  const el = $('fx');
  el.className = 'fx';
  void el.offsetWidth;
  el.className = 'fx ' + kind;
  if (shake) {
    const m = document.querySelector('.monitor-frame');
    m.classList.remove('shake');
    void m.offsetWidth;
    m.classList.add('shake');
  }
}

// ---------- wiring ----------
initTerminal();
$('dialog').addEventListener('click', advance);
$('scene').addEventListener('click', () => { if (!state.inv) advance(); });
document.addEventListener('keydown', (e) => {
  if (!$('modal').hidden) {
    if (e.key === 'Escape' && state.modalEsc) state.modalEsc();
    return;
  }
  if (terminalOpen()) { if (e.key === 'Escape') closeTerminal(); return; }
  if ($('game').hidden) return;
  const tag = e.target.tagName;
  if ((e.key === 'Enter' || e.key === ' ') && tag !== 'BUTTON' && tag !== 'INPUT') { e.preventDefault(); advance(); }
});
$('btn-back').addEventListener('click', showSelect);
$('btn-clues').addEventListener('click', showClues);
$('btn-decoder').addEventListener('click', () => showDecoder([]));
$('btn-cards').addEventListener('click', showCards);

renderSelect();
