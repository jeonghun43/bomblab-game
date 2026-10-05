// In-world computer: gdb terminal + registers + disassembly, shown inside the monitor overlay.
// Also runs tutorial lessons: task list, command unlocks, staged panels, predictions.
import { assemble, hex } from './engine/cpu.js';
import { Gdb } from './engine/gdb.js';
import { TOOLS } from './levels.js';

const $ = (id) => document.getElementById(id);
const ALL_REGS = ['rax', 'rbx', 'rcx', 'rdx', 'rsi', 'rdi', 'rbp', 'rsp', 'rip'];
export const PENALTY = { explode: 100, hint: 50, wrong: 30 };

// ---------- command names ----------
const ALIASES = {
  r: 'run', run: 'run', b: 'break', br: 'break', break: 'break', c: 'continue', continue: 'continue',
  si: 'stepi', stepi: 'stepi', ni: 'nexti', nexti: 'nexti', p: 'print', print: 'print',
  i: 'info', info: 'info', x: 'x', disas: 'disassemble', disassemble: 'disassemble',
  d: 'delete', delete: 'delete', k: 'kill', kill: 'kill',
};
const ALWAYS = new Set(['help', 'h', 'hint', 'answer', 'clear']);
// Toolbox text comes from scripts/puzzles.md ("## 도구함").
export { TOOLS };
export function canonical(line) {
  const m = line.trim().match(/^([^\s/]+)/);
  if (!m) return null;
  return ALIASES[m[1]] || m[1];
}

// Pure: does this command/result satisfy a task's `until`? (all given keys must hold)
export function checkUntil(u, { line = '', out = '', events = [], gdb, answered = false }) {
  if (u && u.out && !new RegExp(u.out, 'm').test(out)) return false;
  if (!u) return false;
  if (u.event && !events.includes(u.event)) return false;
  if (u.at) {
    const cpu = gdb.cpu;
    const f = cpu && gdb.prog.funcAt(cpu.rip);
    if (!f || f.name !== u.at) return false;
  }
  if (u.reg) {
    const cpu = gdb.cpu;
    if (!cpu || cpu.getReg(u.reg) !== BigInt(u.eq)) return false;
  }
  if (u.cmd && !new RegExp(u.cmd).test(line.trim())) return false;
  if (u.running && !gdb.cpu) return false;
  if (u.answer && !answered) return false;
  return true;
}

let ctx = null;             // { level, theme, hooks, opts, s }
const sessions = new Map(); // session key -> state
let history = [], histIdx = 0, lastCmd = '', prevRegs = {}, timerId = null;

export function resetTerminals() {
  sessions.clear();
  history = []; histIdx = 0; lastCmd = '';
  stopTimer();
}

/**
 * hooks: { addScore(n), fx(kind, shake), react(text, mood), rich(el, text),
 *          onClear(levelId, bonus), onLessonDone(result), onClose() }
 * opts:  { lesson, learned: Set|null, ui: { regs, shownRegs, code }|null }
 */
export function openTerminal(level, theme, hooks, opts = {}) {
  const lesson = opts.lesson || null;
  const key = (lesson && lesson.session) || level.id;
  let s = sessions.get(key);
  const out = $('term-out');
  out.innerHTML = '';
  if (!s) {
    const prog = assemble(level.asm, level.rodata);
    s = { gdb: new Gdb(prog, level), prog, hintIdx: 0, cleared: false, answered: false, explodes: 0, bonus: 0,
      timeLeft: theme.countdown || 0, log: null, taskIdx: 0, lessonId: null, lessonDone: false };
    sessions.set(key, s);
    print('GNU gdb (Bomblab 훈련소) 12.1 — 게임용 축소판. "help"로 명령 목록, "hint"로 도움 요청.', 'l-sys');
    print('Reading symbols from ./bomb...', 'l-sys');
  } else if (s.log) {
    out.appendChild(s.log);
  }
  if (lesson && s.lessonId !== lesson.id) {
    Object.assign(s, { lessonId: lesson.id, taskIdx: 0, lessonDone: false, answered: false });
    if (s.cleared) s.cleared = false;
    print('', 'l-sys');
  }
  ctx = { level, theme, hooks, opts, lesson, s };
  $('monitor').hidden = false;
  $('mon-goal-title').textContent = lesson ? '지금 할 일' : `목표 · ${theme.vocab.stage}`;
  $('mon-hint').textContent = lesson ? '힌트' : '힌트 (감점)';
  if (lesson && !s.lessonDone) startTask();
  else {
    $('mon-goal').innerHTML = level.goal;
    renderChips(level.walkthrough);
    setLine(theme.stages?.[level.id] || '');
    $('term-in').placeholder = '';
  }
  renderTools();
  prevRegs = {};
  afterCommand();
  startTimer();
  out.scrollTop = out.scrollHeight;
  setTimeout(() => $('term-in').focus({ preventScroll: true }), 30);
}

export function closeTerminal({ silent = false } = {}) {
  if (!ctx) return;
  const frag = document.createDocumentFragment();
  const out = $('term-out');
  while (out.firstChild) frag.appendChild(out.firstChild);
  ctx.s.log = frag;
  stopTimer();
  clearTimeout(attendTimer);
  document.querySelector('.monitor-frame').classList.remove('focus-say', 'focus-input');
  $('mon-choices').innerHTML = '';
  $('monitor').hidden = true;
  const hooks = ctx.hooks;
  ctx = null;
  if (!silent && hooks.onClose) hooks.onClose();
}

export const terminalOpen = () => !!ctx;

function setLine(text, mood = 'talk') {
  const el = $('mon-line');
  if (ctx.hooks.rich) ctx.hooks.rich(el, text); else el.textContent = text;
  ctx.hooks.react && ctx.hooks.react(text, mood);
  if (ctx.lesson && text) attend('say', plain(text).length);
}

// ---------- attention highlight (lessons only) ----------
// 'say'  : the character's line glows and the terminal dims, so the student reads it.
// 'input': the command line glows, so the student knows it's time to type.
let attendTimer = null;
function attend(mode, textLen = 0) {
  const frame = document.querySelector('.monitor-frame');
  clearTimeout(attendTimer);
  frame.classList.remove('focus-say', 'focus-input');
  if (!ctx || !ctx.lesson || ctx.s.lessonDone) return;
  const task = curTask();
  const needsInput = task && task.until && !task.predict && !task.ack;
  if (mode === 'say') {
    frame.classList.add('focus-say');
    if (needsInput) {
      const ms = Math.max(1400, Math.min(4500, textLen * 45));
      attendTimer = setTimeout(() => attend('input'), ms);
    }
  } else if (needsInput) {
    frame.classList.add('focus-input');
  }
}
const plain = (t) => t.replace(/\[\[(.+?)\]\]/g, '$1');

// ---------- lesson tasks ----------
const curTask = () => ctx && ctx.lesson && !ctx.s.lessonDone ? ctx.lesson.tasks[ctx.s.taskIdx] : null;

function startTask() {
  const { lesson, s, opts } = ctx;
  const task = lesson.tasks[s.taskIdx];
  if (!task) return finishLesson();
  for (const cmd of task.unlock || []) {
    if (opts.learned && !opts.learned.has(cmd)) {
      opts.learned.add(cmd);
      const [usage, desc] = TOOLS[cmd] || [cmd, ''];
      print(`🔧 새 도구 획득: ${usage} — ${desc}`, 'l-ok');
    }
  }
  if (task.reveal && opts.ui) {
    if (task.reveal.regs) { opts.ui.regs = true; opts.ui.shownRegs = task.reveal.regs; }
    if (task.reveal.code) opts.ui.code = true;
  }
  const choices = $('mon-choices');
  choices.innerHTML = '';
  if (task.predict) {
    setLine(task.predict.q);
    task.predict.options.forEach((opt, i) => choiceButton(opt, () => {
      const ok = i === task.predict.answer;
      choices.innerHTML = '';
      setLine(ok ? task.predict.right : task.predict.wrong, ok ? 'talk' : 'angry');
      print(`예측: ${opt} ${ok ? '✔' : '✘'}`, ok ? 'l-ok' : 'l-err');
      choiceButton('계속 →', nextTask);
    }));
  } else if (task.ack) {
    setLine(task.say || '');
    choiceButton(task.ack, nextTask);
  } else {
    setLine(task.say || '');
    if (!task.say) attend('input');
  }
  $('mon-goal').innerHTML = task.goal ? escapeHtml(task.goal) : '위의 질문에 답하세요.';
  $('term-in').placeholder = task.ghost ? task.ghost : '';
  renderChips(task.ghost ? [task.ghost] : []);
  renderTools();
  if (ctx) renderInspect();
}

function choiceButton(label, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'choice';
  b.textContent = label;
  b.addEventListener('click', fn);
  $('mon-choices').appendChild(b);
  if ($('mon-choices').children.length === 1) setTimeout(() => b.focus({ preventScroll: true }), 30);
}

function nextTask() {
  if (!ctx) return;
  ctx.s.taskIdx++;
  startTask();
  if (ctx && !curTask()?.predict && !curTask()?.ack) $('term-in').focus({ preventScroll: true });
}

function checkTask(line, events, out = '') {
  const task = curTask();
  if (!task || !task.until) return;
  if (checkUntil(task.until, { line, out, events, gdb: ctx.s.gdb, answered: ctx.s.answered })) {
    const myCtx = ctx;
    setTimeout(() => { if (ctx === myCtx) nextTask(); }, 450);
  }
}

function finishLesson() {
  const { s, hooks, level } = ctx;
  s.lessonDone = true;
  $('mon-choices').innerHTML = '';
  print('✔ 레슨 완료', 'l-ok');
  stopTimer();
  const result = { levelId: level.id, cleared: s.cleared, bonus: s.bonus };
  setTimeout(() => {
    closeTerminal({ silent: true });
    hooks.onLessonDone && hooks.onLessonDone(result);
  }, 900);
}

// ---------- output ----------
function print(text, cls = 'l-out') {
  const out = $('term-out');
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
  return div;
}
function printCmd(prompt, cmd) {
  const div = print('', 'l-cmd');
  if (prompt) {
    const p = document.createElement('span');
    p.className = 'p';
    p.textContent = prompt + ' ';
    div.appendChild(p);
  }
  div.appendChild(document.createTextNode(cmd));
}
const printStory = (text) => print(plain(text), 'l-story');
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function printGdbOut(out) {
  if (!out) return;
  for (const line of out.split('\n')) {
    let cls = 'l-out';
    if (line.startsWith('BOOM') || line.includes('blown up')) cls = 'l-boom';
    else if (line.startsWith('Phase defused')) cls = 'l-ok';
    else if (/^(Undefined|The program (is not|has no)|No |Cannot|Function ".*" not defined|Invalid|Argument required)/.test(line)) cls = 'l-err';
    print(line, cls);
  }
}

function renderChips(cmds) {
  const box = $('mon-chips');
  box.innerHTML = '';
  $('mon-chips-box').hidden = !cmds.length;
  for (const c of cmds) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = c;
    b.addEventListener('click', () => { const inp = $('term-in'); inp.value = c; inp.focus(); });
    box.appendChild(b);
  }
}

function renderTools() {
  const learned = ctx && ctx.opts.learned;
  const box = $('mon-tools-box');
  box.hidden = !learned;
  if (!learned) return;
  const ul = $('mon-tools');
  ul.innerHTML = '';
  for (const cmd of Object.keys(TOOLS)) {
    if (!learned.has(cmd)) continue;
    const li = document.createElement('li');
    const [usage, desc] = TOOLS[cmd];
    li.innerHTML = '<code></code><span></span>';
    li.firstChild.textContent = usage;
    li.lastChild.textContent = desc;
    ul.appendChild(li);
  }
  if (!ul.children.length) ul.innerHTML = '<li class="empty">아직 없음</li>';
}

// ---------- input ----------
function onSubmit(e) {
  e.preventDefault();
  if (!ctx) return;
  const inp = $('term-in');
  let line = inp.value;
  inp.value = '';
  const g = ctx.s.gdb;
  const task = curTask();

  if (g.waitingForInput) {
    printCmd('', line);
    const r = g.exec(line);
    printGdbOut(r.out);
    handleEvents(r.events);
    if (ctx) { checkTask('', r.events, r.out); afterCommand(); }
    return;
  }

  if (!line.trim()) line = lastCmd;
  printCmd('(gdb)', line);
  if (!line.trim()) return;
  history.push(line);
  histIdx = history.length;
  lastCmd = line;
  for (const c of document.querySelectorAll('#mon-chips .chip')) if (c.textContent === line.trim()) c.classList.add('used');

  if (task && (task.predict || task.ack)) return print('먼저 위쪽 버튼으로 답해 주세요.', 'l-sys');

  const [cmd, ...rest] = line.trim().split(/\s+/);
  const arg = rest.join(' ');
  if (cmd === 'hint') return doHint();
  if (cmd === 'answer') { doAnswer(arg); if (ctx) checkTask(line, []); return; }
  if (cmd === 'clear') { $('term-out').innerHTML = ''; return; }
  const learned = ctx.opts.learned;
  if (learned && (cmd === 'help' || cmd === 'h')) return tutorialHelp();
  if (learned && !ALWAYS.has(cmd) && !learned.has(canonical(line))) {
    if (!ALIASES[cmd]) { printGdbOut(`Undefined command: "${cmd}".  Try "help".`); return; }
    printStory(ctx.theme.lockedTool || '그건 아직 안 배운 도구야. 필요해지면 그때 알려 줄게.');
    return tutorialHelp();
  }

  prevRegs = snapshotRegs();
  const r = g.exec(line);
  printGdbOut(r.out);
  handleEvents(r.events);
  if (ctx) { checkTask(line, r.events, r.out); afterCommand(); }
}

function tutorialHelp() {
  const learned = [...ctx.opts.learned].filter((c) => TOOLS[c]);
  print('지금 쓸 수 있는 명령:', 'l-sys');
  for (const c of learned) print(`  ${TOOLS[c][0].padEnd(12)} ${TOOLS[c][1]}`, 'l-sys');
  print('  hint         도움 요청', 'l-sys');
}

function afterCommand() {
  if (!ctx) return;
  const g = ctx.s.gdb;
  $('term-form').classList.toggle('waiting', g.waitingForInput);
  $('prompt').textContent = g.waitingForInput ? '입력 >' : '(gdb)';
  renderInspect();
}

function penalize() {
  return !ctx.lesson || !!ctx.lesson.penalty;
}

function handleEvents(events) {
  const { theme, level, s } = ctx;
  if (events.includes('input')) print('(프로그램이 입력을 기다립니다. 한 줄을 입력하고 Enter)', 'l-sys');
  if (events.includes('exploded')) {
    const free = !penalize() || curTask()?.free;
    if (!free) ctx.hooks.addScore(-PENALTY.explode);
    const line = theme.explode[Math.min(s.explodes, theme.explode.length - 1)];
    s.explodes++;
    if (!ctx.lesson || !curTask()?.until || curTask().until.event !== 'exploded') {
      printStory(line + (free ? '' : `  (${theme.vocab.score} -${PENALTY.explode})`));
      setLine(line, 'angry');
    }
    ctx.hooks.fx('boom', true);
  }
  if (events.includes('defused') && level.mode === 'input') clear();
}

function doHint() {
  const { level, theme, s } = ctx;
  const task = curTask();
  if (task) {
    const tip = task.hint || (task.ghost ? `이렇게 쳐 봐: ${task.ghost}` : task.goal);
    printStory(theme.hintLead + plain(tip));
    return;
  }
  if (s.hintIdx >= level.hints.length) return print('더 줄 힌트가 없습니다. 왼쪽 추천 명령을 순서대로 눌러 보세요.', 'l-sys');
  const tmp = document.createElement('div');
  tmp.innerHTML = level.hints[s.hintIdx++];
  ctx.hooks.addScore(-PENALTY.hint);
  printStory(`${theme.hintLead}${tmp.textContent}  (${theme.vocab.score} -${PENALTY.hint})`);
  setLine(tmp.textContent);
}

function doAnswer(arg) {
  const { level, theme, s } = ctx;
  if (s.cleared) return print('이미 해제했습니다.', 'l-sys');
  if (level.mode !== 'answer') return print('이 폭탄은 run 후에 프로그램이 입력을 받습니다. run을 치고, 입력을 기다릴 때 문자열을 입력하세요.', 'l-sys');
  if (!arg) return print('사용법: answer <값>   예) answer 10', 'l-err');
  if (level.check(arg)) return clear();
  if (penalize()) ctx.hooks.addScore(-PENALTY.wrong);
  printStory(theme.wrongAnswer + (penalize() ? `  (${theme.vocab.score} -${PENALTY.wrong})` : ''));
  setLine(theme.wrongAnswer, 'angry');
  ctx.hooks.fx('boom', false);
}

function clear() {
  const { level, theme, s, hooks } = ctx;
  s.cleared = true;
  s.answered = true;
  stopTimer();
  s.bonus = 0;
  if (timerActive() && s.timeLeft > 0) {
    s.bonus = Math.floor(s.timeLeft / 6);
    print(`남은 시간 보너스 +${s.bonus}`, 'l-ok');
  }
  print(`✔ ${level.title} 해제`, 'l-ok');
  hooks.fx('win', false);
  if (ctx.lesson) return; // the lesson's task list decides when to close
  setTimeout(() => {
    closeTerminal({ silent: true });
    hooks.onClear(level.id, s.bonus);
  }, 900);
}

// ---------- inspect ----------
function visibleRegs() {
  const ui = ctx.opts.ui;
  return ui ? ui.shownRegs || [] : ALL_REGS;
}

function snapshotRegs() {
  const cpu = ctx && ctx.s.gdb.cpu;
  if (!cpu) return {};
  return Object.fromEntries(ALL_REGS.map((r) => [r, cpu.getReg(r)]));
}

function renderInspect() {
  const { gdb: g, prog } = ctx.s;
  const ui = ctx.opts.ui;
  const showRegs = !ui || ui.regs;
  const showCode = !ui || ui.code;
  $('mon-inspect').hidden = !showRegs && !showCode;
  $('mon-board').classList.toggle('no-inspect', !showRegs && !showCode);
  $('regs-box').hidden = !showRegs;
  $('code-box').hidden = !showCode;
  $('flags').hidden = !!ui;
  const cpu = g.cpu;
  const table = $('regs');
  table.innerHTML = '';
  const cur = snapshotRegs();
  for (const r of visibleRegs()) {
    const tr = document.createElement('tr');
    const v = cur[r];
    if (v !== undefined && prevRegs[r] !== undefined && prevRegs[r] !== v) tr.className = 'changed';
    const natural = v === undefined ? '' : r === 'rip' ? `<${prog.sym(v)}>` : /rsp|rbp/.test(r) ? '' : BigInt.asIntN(64, v).toString();
    tr.innerHTML = `<td>${r}</td><td>${v === undefined ? '—' : hex(v)}</td><td></td>`;
    tr.lastChild.textContent = natural;
    table.appendChild(tr);
  }
  if (ui && !cpu) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="3" class="regs-note">프로그램이 멈춰 있을 때만 칸이 보입니다.</td>';
    table.appendChild(tr);
  }
  const flags = $('flags');
  flags.innerHTML = '';
  for (const f of ['ZF', 'SF', 'CF', 'OF']) {
    const sp = document.createElement('span');
    sp.textContent = f;
    if (cpu && cpu.flags[f]) sp.className = 'on';
    flags.appendChild(sp);
  }
  const code = $('code');
  code.innerHTML = '';
  const note = (text) => { const p = document.createElement('span'); p.className = 'dim'; p.textContent = text; code.appendChild(p); };
  if (!cpu) {
    $('code-title').textContent = '디스어셈블리';
    return note('프로그램이 실행 중이 아닙니다. break를 건 뒤 run 하면 현재 위치가 여기에 표시됩니다.');
  }
  const f = prog.funcAt(cpu.rip);
  $('code-title').textContent = `디스어셈블리 · ${f ? f.name : '??'}`;
  if (!f || f.builtin) return note(`${f ? f.name : '??'}: 라이브러리 함수입니다. si 한 번이면 통째로 실행되고 호출한 곳으로 돌아갑니다.`);
  const bps = new Set(g.bps.map((b) => b.addr));
  for (const ins of prog.instrs.filter((x) => x.func === f.name)) {
    const line = document.createElement('span');
    const isCur = ins.addr === cpu.rip;
    line.className = [isCur ? 'cur' : '', bps.has(ins.addr) ? 'bp' : ''].join(' ').trim();
    line.textContent = `${isCur ? '=>' : '  '} <+${String(ins.offset).padEnd(2)}> ${prog.fmt(ins)}\n`;
    code.appendChild(line);
  }
}

// ---------- countdown ----------
function timerActive() {
  return !!(ctx && ctx.theme.countdown && (!ctx.lesson || ctx.lesson.timer));
}
function startTimer() {
  stopTimer();
  const box = $('timer-box');
  box.hidden = !timerActive() || ctx.s.cleared;
  if (box.hidden) return;
  const s = ctx.s;
  const tick = () => {
    const m = Math.floor(s.timeLeft / 60), sec = s.timeLeft % 60;
    const el = $('timer');
    el.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    el.classList.toggle('low', s.timeLeft <= 60);
    if (s.timeLeft > 0) s.timeLeft--;
  };
  tick();
  timerId = setInterval(tick, 1000);
}
function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  const box = $('timer-box');
  if (box) box.hidden = true;
}

// ---------- wiring ----------
export function initTerminal() {
  $('term-form').addEventListener('submit', onSubmit);
  // Typing or clicking the command line means the student has read the line: move the highlight.
  const toInput = () => { if (document.querySelector('.monitor-frame').classList.contains('focus-say')) attend('input'); };
  $('term-in').addEventListener('input', toInput);
  $('term-in').addEventListener('pointerdown', toInput);
  $('term-in').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && history.length) {
      histIdx = Math.max(0, histIdx - 1);
      e.target.value = history[histIdx];
      e.preventDefault();
    } else if (e.key === 'ArrowDown' && history.length) {
      histIdx = Math.min(history.length, histIdx + 1);
      e.target.value = history[histIdx] || '';
      e.preventDefault();
    } else if (e.key === 'Tab' && !e.target.value && e.target.placeholder) {
      e.target.value = e.target.placeholder;
      e.preventDefault();
    }
  });
  $('mon-close').addEventListener('click', () => closeTerminal());
  $('mon-hint').addEventListener('click', () => { if (ctx) { printCmd('(gdb)', 'hint'); doHint(); } });
}
