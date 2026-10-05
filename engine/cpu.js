// Mini x86-64 (AT&T syntax) assembler + interpreter for the Bomblab taster.
// DOM-free so it can be tested anywhere.

export const hex = (v) => '0x' + BigInt.asUintN(64, BigInt(v)).toString(16);
export const hex16 = (v) => '0x' + BigInt.asUintN(64, BigInt(v)).toString(16).padStart(16, '0');

const mask = (bits) => (1n << BigInt(bits)) - 1n;
export const toSigned = (v, bits = 64) => BigInt.asIntN(bits, BigInt(v));

// ---------- registers ----------
export const REGS64 = ['rax', 'rbx', 'rcx', 'rdx', 'rsi', 'rdi', 'rbp', 'rsp',
  'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15'];
const ALIAS = {};
const legacy = { rax: ['eax', 'ax', 'al'], rbx: ['ebx', 'bx', 'bl'], rcx: ['ecx', 'cx', 'cl'],
  rdx: ['edx', 'dx', 'dl'], rsi: ['esi', 'si', 'sil'], rdi: ['edi', 'di', 'dil'],
  rbp: ['ebp', 'bp', 'bpl'], rsp: ['esp', 'sp', 'spl'] };
for (const r of REGS64) {
  ALIAS[r] = { reg: r, bits: 64 };
  const names = legacy[r] || [r + 'd', r + 'w', r + 'b'];
  ALIAS[names[0]] = { reg: r, bits: 32 };
  ALIAS[names[1]] = { reg: r, bits: 16 };
  ALIAS[names[2]] = { reg: r, bits: 8 };
}
ALIAS.rip = { reg: 'rip', bits: 64 };
export const regAlias = (name) => ALIAS[name.replace(/^[%$]/, '')];

// ---------- memory layout ----------
export const LAYOUT = {
  codeBase: 0x400da0,
  inputBuf: 0x603780,
  stackTop: 0x7fffffffe3c8,
  exitAddr: 0x7ffff7a2d830, // fake __libc_start_main+240
};
const REGIONS = [
  [0x400000n, 0x405000n],
  [0x603000n, 0x605000n],
  [0x7fffffff0000n, 0x7ffffffff000n],
];

// Built-in library functions: real Bomblab-ish addresses.
export const BUILTINS = {
  string_length: 0x40131b,
  strings_not_equal: 0x401338,
  explode_bomb: 0x40143a,
  read_line: 0x40149e,
  phase_defused: 0x4015c4,
};

// ---------- assembler ----------
const JUMPS = new Set(['jmp', 'je', 'jz', 'jne', 'jnz', 'jg', 'jge', 'jl', 'jle',
  'ja', 'jae', 'jb', 'jbe', 'js', 'jns']);
const SUFFIXED = new Set(['mov', 'add', 'sub', 'cmp', 'test', 'push', 'pop', 'lea',
  'imul', 'and', 'or', 'xor', 'call', 'ret']);
const SUFFIX_BITS = { b: 8, w: 16, l: 32, q: 64 };

function splitOperands(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const parseNum = (s) => {
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const v = BigInt(body);
  return neg ? -v : v;
};

function parseOperand(s, isBranch) {
  if (s.startsWith('%')) {
    const a = regAlias(s);
    if (!a) throw new Error('bad register ' + s);
    return { kind: 'reg', name: s.slice(1), ...a };
  }
  if (s.startsWith('$')) return { kind: 'imm', value: parseNum(s.slice(1)) };
  if (isBranch) {
    if (/^(0x[0-9a-f]+|\d+)$/i.test(s)) return { kind: 'target', addr: Number(s) };
    return { kind: 'target', name: s };
  }
  const m = s.match(/^(-?(?:0x[0-9a-f]+|\d+))?\((%\w+)?(?:,(%\w+)(?:,(\d))?)?\)$/i);
  if (m) {
    return { kind: 'mem', disp: m[1] ? parseNum(m[1]) : 0n,
      base: m[2] ? regAlias(m[2]).reg : null, index: m[3] ? regAlias(m[3]).reg : null,
      scale: m[4] ? BigInt(m[4]) : 1n };
  }
  if (/^-?(0x[0-9a-f]+|\d+)$/i.test(s)) return { kind: 'mem', disp: parseNum(s), base: null, index: null, scale: 1n };
  throw new Error('bad operand ' + s);
}

function normalizeMnemonic(m) {
  if (JUMPS.has(m) || m === 'nop' || m === 'hlt') return { op: m, bits: null };
  if (SUFFIXED.has(m)) return { op: m, bits: null };
  const base = m.slice(0, -1), suf = m.slice(-1);
  if (SUFFIXED.has(base) && SUFFIX_BITS[suf]) return { op: base, bits: SUFFIX_BITS[suf] };
  throw new Error('unknown instruction ' + m);
}

// Plausible (not exact) encoding sizes so addresses/offsets look real.
function estimateSize(ins) {
  const [a, b] = ins.ops;
  const hasMem = ins.ops.some((o) => o.kind === 'mem');
  const hasExt = ins.ops.some((o) => o.kind === 'reg' && /^r(8|9|1[0-5])/.test(o.reg));
  const rex = (ins.width === 64 || hasExt) ? 1 : 0;
  switch (ins.op) {
    case 'push': case 'pop': return 1 + (hasExt ? 1 : 0);
    case 'ret': case 'nop': case 'hlt': return 1;
    case 'call': return 5;
    case 'jmp': return 2;
    default:
      if (JUMPS.has(ins.op)) return 2;
      if (ins.op === 'mov' && a.kind === 'imm' && b.kind === 'reg') return b.bits === 64 ? 7 : 5;
      if (a && a.kind === 'imm') return 3 + rex + (hasMem ? 1 : 0);
      if (ins.op === 'lea') return 3 + rex;
      return 2 + rex + (hasMem ? 2 : 0);
  }
}

function widthOf(ops, sufBits) {
  const reg = [...ops].reverse().find((o) => o.kind === 'reg');
  if (reg) return reg.bits;
  return sufBits || 64;
}

export function fmtOperand(o, sym) {
  switch (o.kind) {
    case 'reg': return '%' + o.name;
    case 'imm': return '$' + (o.value < 0n ? '-' + hex(-o.value) : hex(o.value));
    case 'target': return hex(o.addr) + ' <' + sym(o.addr) + '>';
    case 'mem': {
      const d = o.disp === 0n ? '' : (o.disp < 0n ? '-' + hex(-o.disp) : hex(o.disp));
      if (!o.base && !o.index) return hex(o.disp);
      const idx = o.index ? `,%${o.index},${o.scale}` : '';
      return `${d}(${o.base ? '%' + o.base : ''}${idx})`;
    }
  }
}

/**
 * assemble(src, rodata) -> program
 * src: lines like "phase_1:", "  sub $0x8,%rsp", ".L1:", "# comment"
 */
export function assemble(src, rodata = {}) {
  const instrs = [];
  const labels = {};
  const funcs = [];
  let func = null;
  let addr = LAYOUT.codeBase;
  let pendingLocal = [];
  for (let raw of src.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const lm = line.match(/^([.\w]+):$/);
    if (lm) {
      if (!lm[1].startsWith('.')) {
        if (func) func.end = addr;
        addr = Math.ceil(addr / 16) * 16;
        func = { name: lm[1], start: addr, end: addr };
        funcs.push(func);
        labels[lm[1]] = addr;
      } else pendingLocal.push(lm[1]);
      continue;
    }
    for (const l of pendingLocal) labels[l] = addr;
    pendingLocal = [];
    const sp = line.search(/\s/);
    const mnem = sp < 0 ? line : line.slice(0, sp);
    const rest = sp < 0 ? '' : line.slice(sp).trim();
    const { op, bits } = normalizeMnemonic(mnem.toLowerCase());
    const isBranch = JUMPS.has(op) || op === 'call';
    const ops = splitOperands(rest).map((s) => parseOperand(s, isBranch));
    const ins = { addr, op, ops, width: widthOf(ops, bits), func: func.name, offset: addr - func.start };
    ins.size = estimateSize(ins);
    instrs.push(ins);
    addr += ins.size;
  }
  if (func) func.end = addr;

  const symbols = { ...labels };
  for (const [name, a] of Object.entries(BUILTINS)) symbols[name] = a;
  for (const f of Object.keys(BUILTINS)) funcs.push({ name: f, start: BUILTINS[f], end: BUILTINS[f] + 16, builtin: true });

  for (const ins of instrs) {
    for (const o of ins.ops) {
      if (o.kind === 'target' && o.name) {
        if (!(o.name in symbols)) throw new Error('undefined symbol ' + o.name);
        o.addr = symbols[o.name];
      }
    }
  }

  const byAddr = new Map(instrs.map((i) => [i.addr, i]));
  const prog = { instrs, byAddr, symbols, funcs, rodata };
  prog.funcAt = (a) => funcs.find((f) => a >= f.start && a < f.end) || null;
  prog.sym = (a) => {
    const f = prog.funcAt(Number(a));
    if (!f) return '';
    const off = Number(a) - f.start;
    return off ? `${f.name}+${off}` : f.name;
  };
  prog.fmt = (ins) => {
    const args = ins.ops.map((o) => fmtOperand(o, prog.sym)).join(',');
    return args ? ins.op.padEnd(7) + args : ins.op;
  };
  return prog;
}

// ---------- CPU ----------
export class MemError extends Error {
  constructor(addr) { super('Cannot access memory at address ' + hex(addr)); this.addr = addr; }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export class CPU {
  constructor(prog, { maxSteps = 10000 } = {}) {
    this.prog = prog;
    this.maxSteps = maxSteps;
    this.mem = new Map();
    this.regs = Object.fromEntries(REGS64.map((r) => [r, 0n]));
    this.flags = { ZF: false, SF: false, CF: false, OF: false };
    this.inputQueue = [];
    this.steps = 0;
    this.halted = false;
    for (const [a, s] of Object.entries(prog.rodata)) this.writeCString(Number(a), s);
    this.regs.rsp = BigInt(LAYOUT.stackTop);
    this.push(BigInt(LAYOUT.exitAddr));
    this.rip = prog.symbols.main;
  }

  // memory
  checkAddr(a) {
    const b = BigInt.asUintN(64, BigInt(a));
    if (!REGIONS.some(([lo, hi]) => b >= lo && b < hi)) throw new MemError(b);
    return b;
  }
  readByte(a) { return this.mem.get(this.checkAddr(a)) ?? 0; }
  writeByte(a, v) { this.mem.set(this.checkAddr(a), Number(v) & 0xff); }
  read(a, n) {
    let v = 0n;
    for (let i = n - 1; i >= 0; i--) v = (v << 8n) | BigInt(this.readByte(BigInt(a) + BigInt(i)));
    return v;
  }
  write(a, n, v) {
    v = BigInt.asUintN(n * 8, BigInt(v));
    for (let i = 0; i < n; i++) { this.writeByte(BigInt(a) + BigInt(i), v & 0xffn); v >>= 8n; }
  }
  readCString(a, limit = 256) {
    const bytes = [];
    for (let i = 0; i < limit; i++) {
      const b = this.readByte(BigInt(a) + BigInt(i));
      if (b === 0) break;
      bytes.push(b);
    }
    return dec.decode(new Uint8Array(bytes));
  }
  writeCString(a, s) {
    const bytes = enc.encode(s);
    bytes.forEach((b, i) => this.writeByte(BigInt(a) + BigInt(i), b));
    this.writeByte(BigInt(a) + BigInt(bytes.length), 0);
  }

  push(v) { this.regs.rsp -= 8n; this.write(this.regs.rsp, 8, v); }
  pop() { const v = this.read(this.regs.rsp, 8); this.regs.rsp += 8n; return v; }

  // registers
  getReg(name) {
    if (name === 'rip' || name === 'pc') return BigInt(this.rip);
    const a = regAlias(name);
    if (!a) return undefined;
    if (a.reg === 'rip') return BigInt(this.rip);
    return this.regs[a.reg] & mask(a.bits);
  }
  setRegPart(reg, bits, v) {
    v = v & mask(bits);
    if (bits === 64 || bits === 32) this.regs[reg] = v; // 32-bit writes zero-extend
    else this.regs[reg] = (this.regs[reg] & ~mask(bits)) | v;
  }

  ea(o) {
    let a = o.disp;
    if (o.base) a += this.regs[o.base];
    if (o.index) a += this.regs[o.index] * o.scale;
    return BigInt.asUintN(64, a);
  }
  get(o, bits) {
    switch (o.kind) {
      case 'reg': return this.regs[o.reg] & mask(o.bits);
      case 'imm': return BigInt.asUintN(bits, o.value);
      case 'mem': return this.read(this.ea(o), bits / 8);
    }
    throw new Error('cannot read operand');
  }
  set(o, bits, v) {
    if (o.kind === 'reg') return this.setRegPart(o.reg, o.bits, v);
    if (o.kind === 'mem') return this.write(this.ea(o), bits / 8, v);
    throw new Error('cannot write operand');
  }

  arith(kind, d, s, bits) {
    const m = mask(bits), top = 1n << BigInt(bits - 1);
    let r;
    if (kind === 'add') {
      r = (d + s) & m;
      this.flags.CF = d + s > m;
      this.flags.OF = ((d & top) === (s & top)) && ((r & top) !== (d & top));
    } else if (kind === 'sub') {
      r = (d - s) & m;
      this.flags.CF = d < s;
      this.flags.OF = ((d & top) !== (s & top)) && ((r & top) !== (d & top));
    } else {
      r = kind === 'and' ? d & s : kind === 'or' ? d | s : kind === 'xor' ? d ^ s
        : BigInt.asUintN(bits, toSigned(d, bits) * toSigned(s, bits));
      this.flags.CF = this.flags.OF = false;
    }
    this.flags.ZF = r === 0n;
    this.flags.SF = (r & top) !== 0n;
    return r;
  }

  cond(op) {
    const { ZF, SF, CF, OF } = this.flags;
    switch (op) {
      case 'jmp': return true;
      case 'je': case 'jz': return ZF;
      case 'jne': case 'jnz': return !ZF;
      case 'jg': return !ZF && SF === OF;
      case 'jge': return SF === OF;
      case 'jl': return SF !== OF;
      case 'jle': return ZF || SF !== OF;
      case 'ja': return !CF && !ZF;
      case 'jae': return !CF;
      case 'jb': return CF;
      case 'jbe': return CF || ZF;
      case 'js': return SF;
      case 'jns': return !SF;
    }
  }

  provideInput(line) { this.inputQueue.push(line); }

  // Returns { status: 'ok'|'exit'|'exploded'|'needInput'|'segv'|'limit', out?, event? }
  step() {
    if (this.halted) return { status: 'exit' };
    if (++this.steps > this.maxSteps) { this.halted = true; return { status: 'limit' }; }
    try {
      if (this.rip === LAYOUT.exitAddr) { this.halted = true; return { status: 'exit' }; }
      const bname = Object.keys(BUILTINS).find((k) => BUILTINS[k] === this.rip);
      if (bname) return this.runBuiltin(bname);
      const ins = this.prog.byAddr.get(this.rip);
      if (!ins) throw new MemError(this.rip);
      return this.exec(ins);
    } catch (e) {
      if (e instanceof MemError) { this.halted = true; return { status: 'segv', addr: e.addr }; }
      throw e;
    }
  }

  exec(ins) {
    const [a, b] = ins.ops, w = ins.width;
    let next = ins.addr + ins.size;
    switch (ins.op) {
      case 'mov': this.set(b, w, this.get(a, w)); break;
      case 'lea': this.set(b, w, this.ea(a)); break;
      case 'add': case 'sub': case 'and': case 'or': case 'xor': case 'imul':
        this.set(b, w, this.arith(ins.op, this.get(b, w), this.get(a, w), w)); break;
      case 'cmp': this.arith('sub', this.get(b, w), this.get(a, w), w); break;
      case 'test': this.arith('and', this.get(b, w), this.get(a, w), w); break;
      case 'push': this.push(this.get(a, 64)); break;
      case 'pop': this.set(a, 64, this.pop()); break;
      case 'call': this.push(BigInt(next)); next = a.addr; break;
      case 'ret': next = Number(this.pop()); break;
      case 'nop': break;
      case 'hlt': this.halted = true; return { status: 'exit' };
      default:
        if (JUMPS.has(ins.op)) { if (this.cond(ins.op)) next = a.addr; break; }
        throw new Error('unimplemented ' + ins.op);
    }
    this.rip = next;
    return { status: 'ok' };
  }

  runBuiltin(name) {
    const r = { status: 'ok' };
    switch (name) {
      case 'read_line': {
        if (!this.inputQueue.length) return { status: 'needInput' };
        const s = this.inputQueue.shift();
        this.writeCString(LAYOUT.inputBuf, s);
        this.regs.rax = BigInt(LAYOUT.inputBuf);
        break;
      }
      case 'string_length':
        this.regs.rax = BigInt(enc.encode(this.readCString(this.regs.rdi)).length); break;
      case 'strings_not_equal':
        this.regs.rax = this.readCString(this.regs.rdi) === this.readCString(this.regs.rsi) ? 0n : 1n; break;
      case 'explode_bomb':
        this.halted = true;
        return { status: 'exploded', out: '\nBOOM!!!\nThe bomb has blown up.\n' };
      case 'phase_defused':
        r.out = 'Phase defused. How about the next one?\n';
        r.event = 'defused';
        break;
    }
    this.rip = Number(this.pop());
    return r;
  }
}
