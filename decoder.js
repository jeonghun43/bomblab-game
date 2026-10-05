// The decoder: phase_1's disassembly with every token tied to a concept.
// Tokens whose concept hasn't been learned are masked, which is the curiosity gap.
// The explanation text for each token lives in the story script (scripts/*.md, "## 해독기 풀이").

export const CONCEPT_NAMES = {
  hook: '폭발', addr: '명령의 번지와 순서', reg: '레지스터', mov: 'mov (넣어라)', mem: '주소',
  args: '인자 (심부름 주머니)', call: 'call (심부름)', result: '결과 검사와 점프', prep: '준비와 정리',
};

// [text, concept, note key]
const A = (s) => [s, 'addr', 'addr'];
const P = (s) => [s, 'p'];

export const PHASE1 = [
  [A('0x400dc0 <+0>:'), P('\t'), ['sub', 'prep', 'prep'], P('    '), ['$0x8', 'prep', 'prep'], P(','), ['%rsp', 'reg', 'rsp']],
  [A('0x400dc4 <+4>:'), P('\t'), ['mov', 'mov', 'mov'], P('    '), ['$0x402400', 'mem', 'mem'], P(','), ['%esi', 'args', 'esi']],
  [A('0x400dc9 <+9>:'), P('\t'), ['call', 'call', 'call'], P('   '), ['0x401338', 'call', 'callAddr'], P(' '), ['<strings_not_equal>', 'call', 'sne']],
  [A('0x400dce <+14>:'), P('\t'), ['test', 'result', 'test'], P('   '), ['%eax', 'reg', 'eax'], P(','), ['%eax', 'reg', 'eax']],
  [A('0x400dd0 <+16>:'), P('\t'), ['je', 'result', 'je'], P('     '), ['0x400dd7', 'result', 'jt'], P(' '), ['<phase_1+23>', 'result', 'jt']],
  [A('0x400dd2 <+18>:'), P('\t'), ['call', 'call', 'call'], P('   '), ['0x40143a', 'call', 'callAddr'], P(' '), ['<explode_bomb>', 'hook', 'boom']],
  [A('0x400dd7 <+23>:'), P('\t'), ['add', 'prep', 'prep'], P('    '), ['$0x8', 'prep', 'prep'], P(','), ['%rsp', 'reg', 'rsp']],
  [A('0x400ddb <+27>:'), P('\t'), ['ret', 'prep', 'ret']],
];

const tokens = () => PHASE1.flat().filter((t) => t[1] !== 'p');
export const NOTE_KEYS = [...new Set(tokens().map((t) => t[2]))];

export function decodePercent(concepts) {
  const all = tokens();
  const seen = all.filter((t) => concepts.has(t[1])).length;
  return Math.round((seen / all.length) * 100);
}

export const lineText = (line) => line.map((t) => t[0]).join('');

/**
 * Renders into `root`. `fresh` = concepts just learned (their tokens flash).
 * `notes` maps note keys to explanation text. onPick(text, note, concept) fires on click.
 */
export function renderDecoder(root, concepts, fresh, onPick, notes = {}) {
  root.innerHTML = '';
  const pre = document.createElement('pre');
  pre.className = 'decoder-code';
  const head = document.createElement('div');
  head.className = 'dec-line';
  head.textContent = 'Dump of assembler code for function ';
  if (concepts.has('addr')) head.append('phase_1');
  else { const m = document.createElement('span'); m.className = 'dec-mask'; m.style.width = '7ch'; head.append(m); }
  head.append(':');
  pre.appendChild(head);
  for (const line of PHASE1) {
    const div = document.createElement('div');
    div.className = 'dec-line';
    for (const [text, concept, key] of line) {
      if (concept === 'p') { div.appendChild(document.createTextNode(text)); continue; }
      if (!concepts.has(concept)) {
        const s = document.createElement('span');
        s.className = 'dec-mask';
        s.style.width = `${text.length}ch`;
        s.setAttribute('aria-label', '가려짐');
        div.appendChild(s);
        continue;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dec-tok' + (fresh.has(concept) ? ' fresh' : '');
      b.textContent = text;
      b.addEventListener('click', () => onPick(text, notes[key] || '', concept));
      div.appendChild(b);
    }
    pre.appendChild(div);
  }
  root.appendChild(pre);
}
