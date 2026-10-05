// Puzzle machinery shared by every story: assembly, memory strings, answer checks, program output.
// The text people read (title, goal, hints, recommended commands, concept card, tool list)
// lives in scripts/puzzles.md and is merged in at load time. Story dialogue lives in scripts/<story>.md.
import { parsePuzzles } from './scriptmd.js';

const MACHINES = [
  {
    id: 1,
    mode: 'input',
    banner: 'Welcome to my fiendish little bomb. You have 1 phase with\nwhich to blow yourself up. Have a nice day!\n',
    asm: `
main:
  push   %rbx
  call   read_line
  mov    %rax,%rdi
  call   phase_1
  call   phase_defused
  mov    $0x0,%eax
  pop    %rbx
  ret

phase_1:
  sub    $0x8,%rsp
  mov    $0x402400,%esi
  call   strings_not_equal
  test   %eax,%eax
  je     .L1
  call   explode_bomb
.L1:
  add    $0x8,%rsp
  ret
`,
    rodata: {
      0x4023d0: 'So you think you can stop the bomb with ctrl-c, do you?',
      0x402400: 'Registers never lie, but pointers sometimes do.',
      0x402440: 'Nice try. That is not the string you are looking for.',
    },
    answer: 'Registers never lie, but pointers sometimes do.',
  },
  {
    // Beginner tutorial calculator: only mov/add/sub and 64-bit register names.
    id: 'calc',
    mode: 'answer',
    banner: 'Training calculator loaded.\n',
    asm: `
main:
  sub    $0x8,%rsp
  call   calc
  add    $0x8,%rsp
  ret

calc:
  mov    $0x5,%rax
  add    $0x3,%rax
  mov    %rax,%rdi
  sub    $0x2,%rdi
  ret
`,
    rodata: {},
    answer: '6',
    check: (s) => s.trim() === '6' || s.trim().toLowerCase() === '0x6',
  },
];

const res = await fetch(new URL('./scripts/puzzles.md', import.meta.url));
if (!res.ok) throw new Error(`퍼즐 글 파일을 읽지 못했습니다: scripts/puzzles.md (${res.status})`);
const TEXT = parsePuzzles(await res.text());

export const LEVELS = MACHINES.map((m) => {
  const t = TEXT.levels[m.id];
  if (!t) throw new Error(`scripts/puzzles.md에 "## 퍼즐: ${m.id}" 섹션이 없습니다`);
  const { title, goal, walkthrough, hints, card } = t;
  return { ...m, title, goal, walkthrough, hints, card: { title: card.title, body: card.body } };
});

// Tool list for the tutorial toolbox: { cmd: [usage, description] }
export const TOOLS = TEXT.tools;

export const getLevel = (id) => LEVELS.find((l) => l.id === id);
