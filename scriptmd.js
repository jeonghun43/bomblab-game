// Parser for the script markdown files in scripts/*.md (see scripts/README.md).
// Read sections: "## 설정", "## 캐릭터", "## 용어", "## 해독기 풀이", "## 대본".
// Every other section is notes for humans.

const TRUE = new Set(['예', 'yes', 'true', 'o']);
const SPOT_KINDS = { 살펴보기: 'look', 컴퓨터: 'terminal', 출구: 'exit' };
const SETTING_KEYS = {
  id: 'id', 이름: 'name', 키커: 'kicker', 소개: 'tagline', 표지: 'cover', 안내역: 'guide',
  카운트다운: 'countdown', 오답: 'wrongAnswer', 힌트머리: 'hintLead', 잠긴도구: 'lockedTool', 엔딩제목: 'endingTitle',
  엔딩문구: 'endingText',
};
const VOCAB_KEYS = { 카드: 'card', 단서: 'clue', 점수: 'score', 단계: 'stage' };

const num = (s) => (/^-?\d+$/.test(s) ? Number(s) : s);
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

// "event=break at=phase_1 cmd=`^x/s` running" -> { event, at, cmd, running: true }
export function parseUntil(s) {
  const out = {};
  const re = /(\w+)(?:=(`[^`]*`|\S+))?/g;
  let m;
  while ((m = re.exec(s))) {
    let v = m[2] === undefined ? true : m[2];
    if (typeof v === 'string') v = v.startsWith('`') ? v.slice(1, -1) : num(v);
    out[m[1]] = v;
  }
  return out;
}

// "3 | *8 | 53" -> { options: ['3','8','53'], answer: 1 }
function parseOptions(s) {
  const parts = s.split('|').map((x) => x.trim());
  const answer = parts.findIndex((p) => p.startsWith('*'));
  return { options: parts.map((p) => p.replace(/^\*/, '')), answer };
}

// "레지스터 rax rdi, 코드" -> { regs: ['rax','rdi'], code: true }
function parseReveal(s) {
  const r = {};
  for (const part of list(s)) {
    const [head, ...rest] = part.split(/\s+/);
    if (head === '레지스터') r.regs = rest;
    if (head === '코드') r.code = true;
  }
  return r;
}

export function parseScript(md) {
  const story = { vocab: {}, stages: {}, explode: [], chars: {}, script: [] };
  const names = { 내레이션: null };
  let section = null;
  let step = null;     // current investigate / quiz / decoder step being filled
  let spot = null;     // current spot
  let task = null;     // current lesson task
  let bucket = null;   // where speaker lines go inside a spot: 'lines' | 'locked' | 'after'

  const speaker = (line) => {
    const m = line.match(/^([^:]+?):\s?(.*)$/);
    if (!m || !(m[1] in names)) return null;
    return { say: names[m[1]], text: m[2] };
  };
  const keyval = (line) => {
    const m = line.match(/^([^:]+?):\s?(.*)$/);
    return m ? [m[1].trim(), m[2].trim()] : null;
  };
  const closeSpot = () => { spot = null; task = null; bucket = null; };

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('>') || line.startsWith('<!--') || line.startsWith('|') || line.startsWith('---')) continue;

    let h;
    if ((h = line.match(/^##\s+(.+)$/)) && !line.startsWith('###')) {
      section = { 설정: 'settings', 캐릭터: 'chars', 대본: 'script', 용어: 'glossary', '해독기 풀이': 'notes' }[h[1].trim()] || null;
      step = null; closeSpot();
      continue;
    }
    if (line.startsWith('# ')) continue;
    if (!section) continue;

    if (section === 'settings') {
      const kv = keyval(line.replace(/^-\s*/, ''));
      if (!kv) continue;
      const [k, v] = kv;
      if (k === '힌트머리') story.hintLead = v.endsWith(':') ? v + ' ' : v;
      else if (k in SETTING_KEYS) story[SETTING_KEYS[k]] = SETTING_KEYS[k] === 'countdown' ? Number(v) : v;
      else if (k === '튜토리얼') story.tutorial = TRUE.has(v);
      else if (k === '레벨') story.levels = list(v).map(num);
      else if (k === '폭발') story.explode.push(v);
      else if (k.startsWith('용어.')) story.vocab[VOCAB_KEYS[k.slice(3)]] = v;
      else if (k.startsWith('브리핑.')) story.stages[num(k.slice(4))] = v;
      continue;
    }

    if (section === 'glossary' || section === 'notes') {
      const m = line.match(/^-\s*(.+?):\s*(.+)$/);
      if (!m) continue;
      const key = section === 'glossary' ? 'glossary' : 'decoderNotes';
      (story[key] ||= {})[m[1].trim()] = m[2].trim();
      continue;
    }

    if (section === 'chars') {
      const m = line.match(/^-\s*(\w+):\s*(.+?)(?:\s*\(초상화\s+(\w+)\))?$/);
      if (!m) continue;
      story.chars[m[1]] = { name: m[2], sprite: m[3] || null };
      names[m[2]] = m[1];
      continue;
    }

    // ---- script ----
    if ((h = line.match(/^###\s+(.+)$/)) && !line.startsWith('####')) {
      closeSpot();
      step = null;
      const head = h[1].trim();
      let m;
      if ((m = head.match(/^장면:\s*(\w+)$/))) story.script.push({ scene: m[1] });
      else if ((m = head.match(/^조사:\s*(.+)$/))) { step = { investigate: { objective: m[1], spots: [] } }; story.script.push(step); }
      else if (head === '퀴즈') { step = { quiz: {} }; story.script.push(step); }
      else if ((m = head.match(/^해독기(?::\s*(.*))?$/))) { step = { decoder: list(m[1] || '') }; story.script.push(step); }
      else if ((m = head.match(/^플래그 켜기:\s*(\w+)$/))) story.script.push({ set: m[1] });
      else if ((m = head.match(/^플래그 끄기:\s*(\w+)$/))) story.script.push({ unset: m[1] });
      else if (head === '엔딩') story.script.push({ ending: true });
      else if (head === '대사') { /* plain dialogue block */ }
      else throw new Error(`알 수 없는 대본 단계: ### ${head}`);
      continue;
    }

    if ((h = line.match(/^####\s+(\S+)\s+([\w@]+):\s*(.+)$/)) && !line.startsWith('#####')) {
      if (!step || !step.investigate) throw new Error(`#### ${h[1]}는 ### 조사 아래에만 올 수 있습니다`);
      const kind = SPOT_KINDS[h[1]];
      if (!kind) throw new Error(`알 수 없는 사물 종류: ${h[1]}`);
      const [id, at] = h[2].includes('@') ? h[2].split('@') : [null, h[2]];
      spot = { at, label: h[3].trim(), kind };
      if (id) spot.id = id;
      spot.lines = [];
      step.investigate.spots.push(spot);
      task = null; bucket = 'lines';
      continue;
    }

    if ((h = line.match(/^#####\s+(과제|예측|확인)(?::\s*(.+))?$/))) {
      if (!spot || !spot.lesson) throw new Error('##### 과제는 레슨이 있는 #### 컴퓨터 아래에만 올 수 있습니다');
      task = {};
      if (h[1] === '예측') task.predict = {};
      if (h[1] === '확인') task.ack = h[2] ? h[2].trim() : '계속';
      spot.lesson.tasks.push(task);
      continue;
    }

    // --- content lines ---
    if (spot && (line === '잠김:' || line === '해제 후:' || line === '대사:')) {
      task = null;
      bucket = { '잠김:': 'locked', '해제 후:': 'after', '대사:': 'lines' }[line];
      spot[bucket] = spot[bucket] || [];
      continue;
    }
    const sp = speaker(line);
    if (task) {
      if (sp) { task.say = sp.text; continue; }
      const kv = keyval(line);
      if (!kv) continue;
      const [k, v] = kv;
      if (task.predict && k === '질문') task.predict.q = v;
      else if (task.predict && k === '보기') Object.assign(task.predict, parseOptions(v));
      else if (task.predict && k === '정답') task.predict.right = v;
      else if (task.predict && k === '오답') task.predict.wrong = v;
      else if (k === '도구') task.unlock = list(v);
      else if (k === '보이기') task.reveal = parseReveal(v);
      else if (k === '목표') task.goal = v;
      else if (k === '예시') task.ghost = v;
      else if (k === '힌트') task.hint = v;
      else if (k === '완료') task.until = parseUntil(v);
      else throw new Error(`과제에서 알 수 없는 항목: ${k}`);
      continue;
    }

    if (spot) {
      if (sp) { (spot[bucket] ||= []).push(sp); continue; }
      const kv = keyval(line);
      if (!kv) continue;
      const [k, v] = kv;
      if (k === '레벨') spot.level = num(v);
      else if (k === '필요') spot.requires = list(v);
      else if (k === '끝') spot.ends = TRUE.has(v);
      else if (k === '단서') { const [title, ...rest] = v.split('|'); spot.clue = { title: title.trim(), text: rest.join('|').trim() }; }
      else if (k === '레슨') spot.lesson = { id: v, tasks: [] };
      else if (k === '세션') spot.lesson.session = v;
      else if (k === '타이머') spot.lesson.timer = TRUE.has(v);
      else if (k === '벌점') spot.lesson.penalty = TRUE.has(v);
      else throw new Error(`사물에서 알 수 없는 항목: ${k}`);
      continue;
    }

    if (step && step.quiz && !sp) {
      const kv = keyval(line);
      if (!kv) continue;
      const [k, v] = kv;
      if (k === '화자') step.quiz.say = names[v];
      else if (k === '질문') step.quiz.question = v;
      else if (k === '보기') Object.assign(step.quiz, parseOptions(v));
      else if (k === '정답') step.quiz.right = v;
      else if (k === '오답') step.quiz.wrong = v;
      continue;
    }
    if (step && step.decoder && !sp) {
      const kv = keyval(line);
      if (kv && kv[0] === '설명') { step.line = kv[1]; continue; }
    }
    if (sp) { story.script.push({ say: sp.say, text: sp.text }); step = null; continue; }
    throw new Error(`해석할 수 없는 줄: ${line}`);
  }

  // Terminal spots without explicit lines don't need an empty array.
  for (const st of story.script) {
    if (!st.investigate) continue;
    for (const s of st.investigate.spots) if (s.kind === 'terminal' && !s.lines.length) delete s.lines;
  }
  return story;
}

// ---------- scripts/puzzles.md ----------

const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// Inline markdown for puzzle text: `code` and **bold** only.
export function inlineMd(s) {
  return s.split('`').map((part, i) => (i % 2
    ? `<code>${escapeHtml(part)}</code>`
    : escapeHtml(part).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'))).join('');
}

/**
 * parsePuzzles(md) -> { tools: { cmd: [usage, desc] }, levels: { id: { title, goal, walkthrough, hints, card } } }
 * Sections: "## 도구함" and "## 퍼즐: <id>" (with a "### 카드: <title>" bullet list).
 */
export function parsePuzzles(md) {
  const out = { tools: {}, levels: {} };
  let section = null, level = null, inCard = false;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('>') || line.startsWith('# ')) continue;
    let m;
    if ((m = line.match(/^##\s+(.+)$/)) && !line.startsWith('###')) {
      const head = m[1].trim();
      inCard = false; level = null;
      if (head === '도구함') section = 'tools';
      else if ((m = head.match(/^퍼즐:\s*(\S+)$/))) {
        section = 'level';
        const id = /^\d+$/.test(m[1]) ? Number(m[1]) : m[1];
        level = out.levels[id] = { hints: [], walkthrough: [] };
      } else section = null;
      continue;
    }
    if (section === 'tools') {
      if ((m = line.match(/^-\s*(\w+):\s*(.+?)\s*\|\s*(.+)$/))) out.tools[m[1]] = [m[2], m[3]];
      continue;
    }
    if (section !== 'level') continue;
    if ((m = line.match(/^###\s+카드:\s*(.+)$/))) { level.card = { title: m[1].trim(), items: [] }; inCard = true; continue; }
    if (inCard && (m = line.match(/^-\s+(.+)$/))) { level.card.items.push(inlineMd(m[1])); continue; }
    if ((m = line.match(/^([^:]+?):\s*(.+)$/))) {
      const [, k, v] = m;
      if (k === '제목') level.title = v;
      else if (k === '목표') level.goal = inlineMd(v);
      else if (k === '추천 명령') level.walkthrough = list(v);
      else if (k === '힌트') level.hints.push(inlineMd(v));
      else throw new Error(`퍼즐에서 알 수 없는 항목: ${k}`);
    }
  }
  for (const lv of Object.values(out.levels)) {
    if (lv.card) lv.card.body = `<ul>${lv.card.items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  }
  return out;
}
