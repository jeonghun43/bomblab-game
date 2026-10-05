// Fake gdb front-end: text command in, gdb-looking text out.
import { CPU, REGS64, BUILTINS, MemError, hex, hex16, toSigned, regAlias } from './cpu.js';

const HELP = `사용 가능한 gdb 명령 (실제 gdb와 같은 문법):
  break <함수|*주소>   (b)   breakpoint 설정          delete [번호]   breakpoint 삭제
  info break                breakpoint 목록
  run (r)                   프로그램 시작            continue (c)    다음 breakpoint까지 실행
  stepi [n] (si)            명령 1개 실행            nexti (ni)      call은 통째로 실행
  disas [함수]              디스어셈블               info registers [reg] (i r)
  x/s <주소>                문자열 보기              x/<n>x, x/<n>d, x/<n>gx  메모리 보기
  print[/x] <식> (p)        예: p $rax, p/x $rsp, p (char*)$rsi
게임 명령:
  hint    힌트 보기 (감점)    answer <값>   정답 제출    cards   개념 카드 보기
  빈 줄 Enter = 직전 명령 반복,  ↑/↓ = 명령 히스토리`;

export class Gdb {
  constructor(prog, level) {
    this.prog = prog;
    this.level = level;
    this.cpu = null;
    this.static = new CPU(prog); // for reading .rodata before `run`
    this.bps = [];
    this.bpNum = 1;
    this.valNum = 1;
    this.pid = 4242;
    this.awaiting = null; // pending resume while program waits for stdin
    this.events = [];
  }

  get running() { return !!this.cpu; }
  get waitingForInput() { return !!this.awaiting; }

  exec(line) {
    this.events = [];
    const out = [];
    const say = (s) => out.push(s);
    if (this.awaiting) {
      const resume = this.awaiting;
      this.awaiting = null;
      this.cpu.provideInput(line);
      resume(say);
      return { out: out.join('\n'), events: this.events };
    }
    try {
      this.dispatch(line.trim(), say);
    } catch (e) {
      if (e instanceof MemError) say(e.message);
      else say(String(e.message || e));
    }
    return { out: out.join('\n'), events: this.events };
  }

  dispatch(line, say) {
    if (!line) return;
    const m = line.match(/^(\S+?)(\/\S+)?(?:\s+(.*))?$/);
    const cmd = m[1], fmt = (m[2] || '').slice(1), arg = (m[3] || '').trim();
    const is = (...names) => names.includes(cmd);
    if (is('help', 'h')) return say(HELP);
    if (is('break', 'b', 'br')) return this.cmdBreak(arg, say);
    if (is('delete', 'd')) return this.cmdDelete(arg, say);
    if (is('run', 'r')) return this.cmdRun(say);
    if (is('continue', 'c')) return this.need(say) && (say('Continuing.'), this.resume(say, 'continue'));
    if (is('stepi', 'si')) return this.need(say) && this.cmdStep(say, parseInt(arg || '1', 10));
    if (is('nexti', 'ni')) return this.need(say) && this.cmdNext(say);
    if (is('disas', 'disassemble')) return this.cmdDisas(arg, say);
    if (is('x')) return this.cmdX(fmt, arg, say);
    if (is('print', 'p')) return this.cmdPrint(fmt, arg, say);
    if (is('info', 'i')) {
      const [sub, ...rest] = arg.split(/\s+/);
      if (/^(r|reg|registers?)$/.test(sub)) return this.cmdRegs(rest, say);
      if (/^(b|br|break|breakpoints?)$/.test(sub)) return this.cmdInfoBreak(say);
      return say(`Undefined info command: "${arg}".  Try "help info".`);
    }
    if (is('kill', 'k')) { if (this.need(say)) { this.cpu = null; say(`[Inferior 1 (process ${this.pid}) killed]`); } return; }
    say(`Undefined command: "${cmd}".  Try "help".`);
  }

  need(say) {
    if (!this.cpu) { say('The program is not being run.'); return false; }
    return true;
  }

  // ----- execution control -----
  cmdBreak(arg, say) {
    if (!arg) return say('Argument required (function name or *address).');
    let addr;
    if (arg.startsWith('*')) addr = Number(this.evalExpr(arg.slice(1)));
    else if (arg in this.prog.symbols) addr = this.prog.symbols[arg];
    else return say(`Function "${arg}" not defined.`);
    const bp = { num: this.bpNum++, addr, hits: 0 };
    this.bps.push(bp);
    say(`Breakpoint ${bp.num} at ${hex(addr)}`);
  }

  cmdDelete(arg, say) {
    if (!arg) { this.bps = []; return; }
    const n = parseInt(arg, 10);
    const before = this.bps.length;
    this.bps = this.bps.filter((b) => b.num !== n);
    if (this.bps.length === before) say(`No breakpoint number ${arg}.`);
  }

  cmdInfoBreak(say) {
    if (!this.bps.length) return say('No breakpoints or watchpoints.');
    say('Num     Type           Disp Enb Address            What');
    for (const b of this.bps) {
      say(`${String(b.num).padEnd(8)}breakpoint     keep y   ${hex16(b.addr)} <${this.prog.sym(b.addr)}>`);
      if (b.hits) say(`\tbreakpoint already hit ${b.hits} time${b.hits > 1 ? 's' : ''}`);
    }
  }

  cmdRun(say) {
    if (this.cpu) say('The program being debugged has been started already. Restarting.');
    this.pid++;
    this.cpu = new CPU(this.prog);
    this.events.push('started');
    say('Starting program: /home/student/bomb');
    if (this.level.banner) say(this.level.banner.replace(/\n$/, ''));
    this.resume(say, 'continue', false);
  }

  cmdStep(say, n) {
    for (let i = 0; i < Math.max(1, n); i++) {
      const stop = this.stepOnce(say, (s) => this.cmdStep(s, n - i));
      if (stop) return;
    }
    this.reportPos(say);
  }

  cmdNext(say) {
    const ins = this.prog.byAddr.get(this.cpu.rip);
    if (ins && ins.op === 'call') return this.resume(say, 'until', true, ins.addr + ins.size);
    this.cmdStep(say, 1);
  }

  // Executes one instruction. Returns true if execution ended/paused.
  stepOnce(say, onResume) {
    const r = this.cpu.step();
    if (r.out) say(r.out.replace(/\n$/, ''));
    if (r.event) this.events.push(r.event);
    return this.handleStatus(r, say, onResume);
  }

  handleStatus(r, say, onResume) {
    switch (r.status) {
      case 'ok': return false;
      case 'needInput':
        this.awaiting = onResume;
        this.events.push('input');
        return true;
      case 'exit':
        say(`[Inferior 1 (process ${this.pid}) exited normally]`);
        this.cpu = null; this.events.push('exited'); return true;
      case 'exploded':
        say(`[Inferior 1 (process ${this.pid}) exited with code 010]`);
        this.cpu = null; this.events.push('exploded'); return true;
      case 'segv':
        say(`\nProgram received signal SIGSEGV, Segmentation fault.\n${this.pos()}`);
        this.cpu = null; this.events.push('exited'); return true;
      case 'limit':
        say('(게임) 실행 횟수 상한 초과 — 무한 루프인가요? 프로그램을 종료합니다.');
        this.cpu = null; this.events.push('exited'); return true;
    }
  }

  // mode: 'continue' | 'until'
  resume(say, mode, skipFirstBp = true, until = null) {
    let skip = skipFirstBp;
    for (;;) {
      const rip = this.cpu.rip;
      if (mode === 'until' && rip === until) return this.reportPos(say);
      const bp = !skip && this.bps.find((b) => b.addr === rip);
      if (bp) {
        bp.hits++;
        this.events.push('break');
        return say(`\nBreakpoint ${bp.num}, ${hex16(rip)} in ${this.funcName(rip)} ()`);
      }
      skip = false;
      const stop = this.stepOnce(say, (s) => this.resume(s, mode, true, until));
      if (stop) return;
    }
  }

  funcName(a) { const f = this.prog.funcAt(a); return f ? f.name : '??'; }
  pos() { return `${hex16(this.cpu.rip)} in ${this.funcName(this.cpu.rip)} ()`; }
  reportPos(say) { if (this.cpu) { say(this.pos()); this.events.push('stopped'); } }

  // ----- inspection -----
  cmdDisas(arg, say) {
    let f;
    if (arg) {
      const a = arg in this.prog.symbols ? this.prog.symbols[arg] : Number(this.evalExpr(arg));
      f = this.prog.funcAt(a);
      if (!f) return say(`No function contains specified address.`);
    } else {
      if (!this.cpu) return say('No frame selected.');
      f = this.prog.funcAt(this.cpu.rip);
    }
    say(`Dump of assembler code for function ${f.name}:`);
    if (f.builtin) {
      say(`   ${hex16(f.start)} <+0>:\t(게임) 라이브러리 함수 — 내부 구현은 생략됩니다.`);
    } else {
      for (const ins of this.prog.instrs.filter((i) => i.func === f.name)) {
        const cur = this.cpu && this.cpu.rip === ins.addr ? '=> ' : '   ';
        say(`${cur}${hex16(ins.addr)} <+${ins.offset}>:\t${this.prog.fmt(ins)}`);
      }
    }
    say('End of assembler dump.');
  }

  mem() { return this.cpu || this.static; }

  cmdX(fmt, arg, say) {
    if (!arg) return say('Argument required (starting display address).');
    const fm = fmt.match(/^(\d*)([sxdcu]?)([bhwg]?)([sxdcu]?)$/);
    if (!fm) return say(`Invalid format "${fmt}".`);
    const count = parseInt(fm[1] || '1', 10);
    const f = fm[2] || fm[4] || 'x';
    const size = { b: 1, h: 2, w: 4, g: 8 }[fm[3] || (f === 'c' ? 'b' : 'w')];
    let addr = BigInt.asUintN(64, this.evalExpr(arg));
    const mem = this.mem();
    const label = (a) => { const s = this.prog.sym(a); return s ? `${hex(a)} <${s}>:` : `${hex(a)}:`; };
    if (f === 's') {
      for (let i = 0; i < count; i++) {
        const s = mem.readCString(addr);
        say(`${label(addr)}\t"${s}"`);
        addr += BigInt(new TextEncoder().encode(s).length + 1);
      }
      return;
    }
    const perLine = size === 8 ? 2 : size === 4 ? 4 : 8;
    let line = [];
    let lineAddr = addr;
    for (let i = 0; i < count; i++) {
      const v = mem.read(addr, size);
      line.push(f === 'd' ? toSigned(v, size * 8).toString()
        : f === 'u' ? v.toString()
        : f === 'c' ? `${v} '${String.fromCharCode(Number(v))}'`
        : '0x' + v.toString(16).padStart(size * 2, '0'));
      addr += BigInt(size);
      if (line.length === perLine || i === count - 1) {
        say(`${label(lineAddr)}\t${line.join('\t')}`);
        line = []; lineAddr = addr;
      }
    }
  }

  cmdPrint(fmt, arg, say) {
    if (!arg) return say('Argument required.');
    const cs = arg.match(/^\(\s*char\s*\*\s*\)\s*(.+)$/);
    const n = this.valNum++;
    if (cs) {
      const a = BigInt.asUintN(64, this.evalExpr(cs[1]));
      return say(`$${n} = ${hex(a)} "${this.mem().readCString(a)}"`);
    }
    const v = this.evalExpr(arg);
    const reg = arg.match(/^\$(\w+)$/);
    const bits = reg && regAlias(reg[1]) ? regAlias(reg[1]).bits : 64;
    if (fmt === 'x') return say(`$${n} = ${hex(BigInt.asUintN(bits, v))}`);
    if (reg && /^(rsp|rbp)$/.test(reg[1])) return say(`$${n} = (void *) ${hex(v)}`);
    if (reg && /^(rip|pc)$/.test(reg[1])) return say(`$${n} = (void (*)()) ${hex(v)} <${this.prog.sym(v)}>`);
    say(`$${n} = ${toSigned(v, bits)}`);
  }

  cmdRegs(names, say) {
    if (!this.cpu) return say('The program has no registers now.');
    const list = names.filter(Boolean).length ? names.map((n) => n.replace(/^\$/, '')) : [...REGS64, 'rip', 'eflags'];
    for (const r of list) {
      if (r === 'eflags') {
        const f = this.cpu.flags;
        const set = ['CF', 'ZF', 'SF', 'OF'].filter((k) => f[k]);
        const bits = (f.CF ? 1 : 0) | (f.ZF ? 0x40 : 0) | (f.SF ? 0x80 : 0) | (f.OF ? 0x800 : 0) | 0x202;
        say(`${'eflags'.padEnd(15)}${hex(bits).padEnd(19)}[ ${set.concat('IF').join(' ')} ]`);
        continue;
      }
      const a = regAlias(r);
      if (!a) { say(`Invalid register \`${r}'`); continue; }
      const v = this.cpu.getReg(r);
      let natural = toSigned(v, a.bits).toString();
      if (/^(rsp|rbp)$/.test(r)) natural = hex(v);
      if (r === 'rip') natural = `${hex(v)} <${this.prog.sym(v)}>`;
      say(`${r.padEnd(15)}${hex(v).padEnd(19)}${natural}`);
    }
  }

  // Tiny expression evaluator: terms joined by + or -. Terms: $reg, hex, decimal, symbol.
  evalExpr(expr) {
    const tokens = expr.replace(/\s+/g, '').match(/[+-]|[^+-]+/g) || [];
    let total = 0n, sign = 1n;
    for (const t of tokens) {
      if (t === '+') { sign = 1n; continue; }
      if (t === '-') { sign = -1n; continue; }
      total += sign * this.term(t);
    }
    return total;
  }

  term(t) {
    if (t.startsWith('$')) {
      if (!this.cpu) throw new Error('No registers.');
      const v = this.cpu.getReg(t.slice(1));
      if (v === undefined) throw new Error(`Invalid register \`${t.slice(1)}'`);
      return v;
    }
    if (/^(0x[0-9a-f]+|\d+)$/i.test(t)) return BigInt(t);
    if (t in this.prog.symbols) return BigInt(this.prog.symbols[t]);
    throw new Error(`No symbol "${t}" in current context.`);
  }
}

export { BUILTINS };
