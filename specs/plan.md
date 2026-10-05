# Implementation Plan: Bomblab 훈련소

**Date**: 2026-09-30 ~ 2026-10-01 | **Spec**: [spec.md](./spec.md) | **Tasks**: [tasks.md](./tasks.md)

기능별 폴더(`001`~`006`)의 plan.md를 하나로 합친 것입니다. 005는 plan 없이 spec과 tasks만 있었습니다.

## 실행 방법

ES 모듈과 md 파일을 `fetch`로 읽기 때문에 `index.html`을 더블클릭해서는 열리지 않습니다. 프로젝트 폴더(`bomblab-game/`)에서 로컬 서버를 띄웁니다. (`.claude/launch.json`에도 같은 설정이 있습니다.)

```bash
python -m http.server 8765
```

| 무엇 | 주소 |
|---|---|
| 게임 | http://localhost:8765 |
| 테스트 (전부 PASS인지 확인) | http://localhost:8765/tests/test.html |

- 이 PC에는 `py` 런처가 없으니 `python`을 씁니다.
- md나 js를 고쳤는데 화면이 그대로면 **Ctrl+Shift+R**(강력 새로고침)을 누릅니다.
- 테스트도 브라우저에서 돌립니다(Node 불필요). 빌드 단계는 없습니다.
- 게시본: https://claude.ai/artifact/UfBwKHFwnb1tJj5P4L7fvJ (자세한 내용은 [GUIDE.md](../GUIDE.md) 10절)

## 현재 프로젝트 구조 (006 이후)
```
bomblab-game/
├── index.html      선택 화면 + 게임 화면(장면, 대사창, HUD) + 터미널 오버레이
├── style.css       레이아웃, 장면, 대사창, 모니터 틀, 해독기, 용어 팝오버
├── game.js         부트, 선택 화면, 대본 실행기(scene/say/investigate/quiz/decoder/ending), HUD, 수첩
├── terminal.js     모니터 오버레이 터미널 + 레슨 진행기(과제, 명령 잠금, 패널 공개, 예측/확인, 하이라이트)
├── pixel.js        픽셀 그리기 도구: 팔레트, 문자열 스프라이트, rect/dither/라인
├── art.js          초상화(반장) + 배경(지휘 차량, 서버실)
├── story.js        scripts/*.md를 읽어 STORIES를 만드는 로더 (STORY_FILES = ['defuse'])
├── scriptmd.js     대본 md / puzzles.md 파서
├── levels.js       퍼즐 1(phase_1), calc: 어셈블리, rodata, 정답 판정 (글은 puzzles.md)
├── decoder.js      해독기: phase_1 토큰-개념 표, 해독률, 렌더
├── engine/
│   ├── cpu.js      어셈블러(파서+주소 배치) + CPU 실행기 + 내장 함수
│   └── gdb.js      gdb 명령 해석기 (문자열 입력 → 문자열 출력 + 이벤트)
├── scripts/
│   ├── defuse.md   폭탄 해체반 대본 + 커리큘럼 + 말투 + 용어 + 해독기 풀이
│   ├── puzzles.md  도구함 설명 + 퍼즐 제목·목표·추천 명령·힌트·카드
│   └── README.md   대본 md 작성법
├── tests/test.html 브라우저 테스트 러너
├── GUIDE.md        다른 교육 주제에 재사용하기 위한 가이드
└── specs/{spec,plan,tasks}.md
```

## Constitution Check (프로젝트 원칙)
1. **진짜처럼**: 명령어·출력 형식은 실제 gdb/objdump와 최대한 같게. 게임에서 익힌 손버릇이 과제에 그대로 통해야 한다. 잠금은 게임 층에서만 한다.
2. **퍼즐은 공유, 연출은 분리**: 레벨 데이터에 테마 텍스트를 섞지 않는다. 레슨 과제는 대본에, 퍼즐은 levels.js에 둔다.
3. **실패는 학습**: 폭발은 게임오버가 아니라 감점 + 교훈 메시지.
4. **작게**: 범위 밖 기능은 넣지 않는다.
5. **글은 md에**: 사람이 읽는 교육 내용은 전부 `scripts/*.md`에 둔다(005).
6. `engine/`은 001 이후 수정하지 않는다.

---

## 001 맛보기 프로토타입

### Summary
브라우저 안에서 동작하는 **가짜 gdb 터미널 + 간이 x86-64 인터프리터**를 만들고, 그 위에 스테이지 2개(레지스터 추적, phase_1 축소판)와 테마 3종(대사·용어·CSS만 교체)을 얹는다. 빌드 도구 없이 정적 파일로 배포한다.

### Technical Context
- **Language**: JavaScript (ES2020, ES Modules), HTML, CSS
- **Dependencies**: 없음 (Google Fonts만 사용)
- **Storage**: 없음 (이번 이터레이션은 새로고침 시 초기화)
- **Testing**: 브라우저 테스트 페이지 `tests/test.html` (로컬에 Node 미설치 → 브라우저에서 모듈 직접 import 후 PASS/FAIL 출력)
- **Local server**: `python -m http.server 8765` (ES 모듈은 file:// 에서 로드 불가)
- **Target**: 최신 데스크톱 브라우저 우선, 375px 폭에서 깨지지 않을 것
- **Deploy**: Claude Artifact(다중 파일) → 이후 GitHub Pages 등 정적 호스팅

### Design

#### engine/cpu.js
- **assemble(src, {base})**: 줄 단위 파싱 → `{addr, size, mnemonic, ops[], text, func, offset}` 배열. 명령 길이는 종류별 고정 추정치(push/pop/ret 1, jcc 2, call/jmp 5, mov imm 5, 나머지 4)로 주소를 배치해 실제 디스어셈블리처럼 보이게 한다. 라벨/함수명 → 주소 심볼 테이블.
- **피연산자**: `%reg`(64/32비트: rax/eax …, r8/r8d …), `$imm`, 메모리 `disp(base,index,scale)`, 심볼(점프/호출 대상).
- **레지스터 값**: BigInt 64비트. 32비트 쓰기는 상위 32비트를 0으로 (x86-64 규칙 그대로 — 이것도 교육 포인트).
- **플래그**: ZF, SF, CF, OF를 add/sub/cmp/test에서 갱신.
- **메모리**: `Map<addr, byte>` 희소 메모리. 영역: 코드 0x400000~, rodata 0x402400~, 입력 버퍼 0x603780, 스택 top 0x7fffffffe000.
- **내장 함수**(주소를 갖고, 호출되면 JS로 실행 후 즉시 ret): `read_line`, `strings_not_equal`, `string_length`, `explode_bomb`, `phase_defused`. 내장 함수 주소에도 breakpoint 가능 (`break explode_bomb` 교육용).
- **step()** → `{status: 'ok'|'exit'|'exploded'|'defused'|'needInput'|'error'}`. 최대 step 10,000.

#### engine/gdb.js
- `Gdb(program, hooks)` 클래스, `exec(line)` → 출력 문자열. 입력 대기 상태면 줄 자체를 프로그램 입력으로 전달.
- 지원: `break/b <func|*addr>`, `delete [n]`, `info break`, `run/r`, `continue/c`, `stepi/si [n]`, `nexti/ni`, `disas [func]`, `x/s`, `x/Nd`, `x/Nx`, `x/Ngx`, `info registers/i r [reg]`, `print/p[/x] <expr>`, `p (char*)<expr>`, `help`. 식: `$reg`, `0x..`, 10진수, `$reg+N`.
- 출력 형식은 gdb 그대로 (`Breakpoint 1, 0x0000000000400ee0 in phase_1 ()`, `rax            0x2a                42` 등).
- 게임 명령(`hint`, `answer`, `cards`)은 게임 층이 먼저 가로챈다.

#### levels.js (Level 데이터 모델)
```js
{ id, title, asm, rodata: {addr: string}, entry: 'main',
  mode: 'answer' | 'input',
  check(answer, cpuResult) -> bool,   // mode 'answer'만
  hints: [str, str], card: {title, body}, goal }
```
- **Stage 0**: `stage0` 함수가 mov/add/lea/sub로 값을 만든다. 최종 `%eax` 값을 `answer`로 제출. *(006에서 삭제)*
- **Stage 1**: `main → read_line → phase_1(%rdi) → strings_not_equal(%rdi, $0x402400) → test/je → explode_bomb`. `run` 후 입력한 문자열로 판정.

> 이후 변경: 003에서 `calc` 레벨 추가, 005에서 title/hints/card/goal은 `scripts/puzzles.md`로 이동.

#### themes.js (Theme 데이터 모델) — 002에서 story.js로 대체
```js
{ id, name, tagline, vocab: {card, hint, score, stage}, intro, stages: {0: {brief}, 1: {brief}},
  onDefuse, onExplode, onHint, ending }
```

#### UI
- 상단 바: 테마 이름 · 스테이지 · 점수 · (defuse 테마) 카운트다운
- 좌: 스토리/브리핑 패널 + 개념 카드 보관함 / 중앙: 터미널 / 우: 레지스터 패널 + 현재 함수 디스어셈블리(현재 줄 하이라이트)
- 폭발: 화면 흔들림 + 플래시 오버레이. 해제: 개념 카드 모달.
- 터미널: ↑/↓ 히스토리, 빈 줄 Enter는 직전 명령 반복(gdb 동작).

### Complexity Tracking
- 테스트 러너를 Node 대신 브라우저로: 로컬 Node 부재. 엔진은 DOM 비의존으로 작성해 추후 Node 테스트로 옮기기 쉽게 유지.

---

## 002 캐릭터와 장소가 있는 장면 진행

### Summary
001의 gdb 터미널을 "장면 속 컴퓨터"로 옮기고, 그 바깥에 픽셀 아트 장면, 대사창, 조사 핫스팟, 퀴즈로 이루어진 어드벤처 층을 추가한다. 이야기 흐름은 대본 데이터(story.js)로 쓰고 대본 실행기(game.js)가 한 단계씩 돌린다.

### Technical Context
- 바닐라 JS와 ES 모듈, 빌드 없음 (001과 같음)
- 그림: `<canvas>` 192×108 논리 해상도, CSS로 정수 배율 확대, `image-rendering: pixelated`
- 애니메이션: requestAnimationFrame, 8fps로 다시 그림, `prefers-reduced-motion`이면 정지 화면
- 테스트: 001의 `tests/test.html` 유지. 대본 검증 테스트를 추가한다(참조하는 장소, 캐릭터, 레벨, 단서 id가 모두 존재하는지).

### 파일 변경
```
index.html      선택 화면 + 게임 화면(장면, 대사창, HUD) + 터미널 오버레이
style.css       001 스타일에 장면, 대사창, 모니터 틀 스타일 추가
game.js         부트, 선택 화면, 대본 실행기(say/scene/investigate/quiz), HUD, 수첩
terminal.js     001 game.js의 터미널, 레지스터, 디스어셈블리 코드를 모듈로 분리
pixel.js        픽셀 그리기 도구: 팔레트, 문자열 스프라이트, rect/dither/라인
art.js          초상화 3종 + 배경 6종(draw(ctx, t, flags) 함수)
story.js        테마 3종의 메타(이름, 용어)와 대본 (themes.js 대체)
engine/, levels.js, tests/   001 그대로
```

### 대본 형식 (story.js)
> 이후 변경: 003 T016~T020에서 대본 원본을 `scripts/*.md`로 옮김. 아래 구조는 md를 파싱한 결과물의 형태로 유지됨. md 문법은 [scripts/README.md](../scripts/README.md).

```js
{
  id, name, kicker, tagline, vocab, countdown?, chars: { chief: { name, sprite } },
  explode: [...], wrongAnswer, hintLead,
  script: [
    { scene: 'van' },                                   // 장소 전환(페이드 + 장소 이름 카드)
    { say: 'chief', text: '...' },                      // say: null 이면 내레이션
    { investigate: {
        objective: '차량 안을 조사하자',
        spots: [
          { id, label, x, y, w, h,                      // 192×108 좌표
            kind: 'look', lines: [{say, text}], clue: { title, text } },
          { id, label, ..., kind: 'terminal', level: 0, requires: ['manual'],
            locked: [{say, text}], after: [{say, text}] },
          { id, label, ..., kind: 'exit', requires: [...] },
        ] } },
    { quiz: { say, question, options: [..], answer: 1, right: '...', wrong: '...' } },
    { ending: true },
  ],
}
```
- `investigate`는 `terminal`(해제 성공) 또는 `exit` 핫스팟이 끝나면 다음 단계로 넘어간다.
- 배경 draw 함수는 `flags`(예: `{ lockerOpen: true, ghost: true }`)를 받아 이야기 진행에 따라 그림을 바꾼다. 대본 단계 `{ set: 'ghost' }`로 플래그를 켠다.

### 화면 구성
- **장면 영역**: 16:9 캔버스. 그 위에 핫스팟 버튼 레이어(% 좌표, 조사 중에만 테두리 표시). 상단 왼쪽에 장소 이름.
- **대사창**: 장면 아래(데스크톱은 장면 하단에 겹침). 초상화 16×16을 6배 확대 + 이름 + 타이핑 텍스트 + "▼" 표시. 퀴즈일 때는 선택지 버튼.
- **HUD**: 테마 이름, 진행 칩, 점수, 수첩 버튼, 카드 버튼, 테마 변경.
- **터미널 오버레이**: 픽셀 모니터 틀 안에 001의 3단 레이아웃(브리핑, 터미널, 레지스터와 코드). 닫기 버튼이 있지만 해제 전에 닫으면 장면으로 돌아가고 핫스팟을 다시 누르면 이어서 할 수 있다.

### 테마별 대본 개요
| 테마 | 캐릭터 | 장소 A (조사 → Stage 0) | 퀴즈 | 장소 B (조사 → Stage 1) |
|---|---|---|---|---|
| 폭탄 해체반 | 반장 | EOD 지휘 차량: 캠퍼스 지도, 해체 매뉴얼, 훈련용 더미 폭탄 노트북 | 반환값 레지스터는? | 공대 5층 서버실: 호출 규약 벽보, 폭탄이 붙은 랙 |
| ~~사건번호 0x402400~~ (006 삭제) | 윤 형사 | 조교 K의 연구실: 포스트잇, 책장(CS:APP), 잠긴 사물함, 노트북 | 두 번째 인자 레지스터는? | 전산경찰서 분석실: 증거 보드(인자 순서 메모), 분석용 PC |
| ~~전산실 B-03~~ (006 삭제) | 유령 | B-03 복도: 폐쇄 공지, 찢어진 매뉴얼, 문(exit) | test/je의 뜻은? | 전산실 내부: 화이트보드(인자 순서), CRT 단말기 (유령은 Stage 0 뒤에 나타남) |

### Constitution Check
- 퍼즐은 공유, 연출은 분리: levels.js는 건드리지 않는다.
- 진짜처럼: 터미널 안의 명령과 출력은 001과 같다.
- 작게: 테마마다 장소 2곳, 캐릭터 1명.

---

## 003 처음 보는 학생을 위한 튜토리얼

### Summary
002의 장면과 터미널은 그대로 두고, 그 위에 **레슨 진행기**(과제 목록, 명령 잠금, 패널 단계 공개, 예측 퀴즈), **해독기**, **용어 풀이**를 추가한다. 폭탄 해체반 대본은 5개 레슨으로 다시 쓴다.

### 흐름 (폭탄 해체반)
| 레슨 | 장소 | 세션(레벨) | 열리는 명령 | 해독기 개념 |
|---|---|---|---|---|
| hook | 지휘 차량 | replica(phase_1) | run | (explode_bomb만 보임) |
| stop | 지휘 차량 | replica | break, continue | addr |
| calc | 지휘 차량 | calc(새 레벨) | stepi, print, info | reg, mov |
| memory | 지휘 차량 | replica | x | mem |
| final | 서버실 | real(phase_1) | disassemble | args, call, result, prep (100%) |

### 데이터 형식

#### 레슨 (terminal 스팟의 `lesson` 필드)
```js
{ kind: 'terminal', level: 1, lesson: {
    id: 'stop', session: 'replica', timer: false,
    tasks: [
      { say, goal, ghost, unlock: ['break'], reveal: { regs: ['rax','rdi'], code: true },
        until: { event: 'break', at: 'phase_1' }, free: true },
      { predict: { q, options, answer, right, wrong } },
      { ack: '알겠다', say },
    ] } }
```
- `until` 조건은 모두 AND로 묶는다.
  - `event`: `input`, `break`, `exploded`, `defused`, `cleared`
  - `at`: 멈춘 함수 이름
  - `reg` + `eq`: 레지스터 값
  - `cmd`: 입력한 명령의 정규식
  - `out`: 명령 출력에 들어 있어야 하는 글자 (오류 출력으로 통과하는 걸 막음)
  - `running`: 프로그램이 실행 중인지
  - `answer`: 정답 제출
- `free: true`인 과제에서는 폭발해도 감점하지 않는다. 레슨 안의 폭발은 기본적으로 감점하지 않는다.
- 레슨 진행 상태(몇 번째 과제인지)는 터미널 세션에 저장한다. 그래서 닫았다가 다시 열어도 이어서 할 수 있다.

#### 명령 잠금
- 기준 이름: run, break, continue, stepi, nexti, print, info, x, disassemble, delete, kill
- 별칭: r, b, br, c, si, ni, p, i, disas, d, k
- 항상 허용: help, hint, answer, clear
- `learned`가 null이면 잠금이 없다(튜토리얼이 아닌 이야기).

#### 해독기 (decoder.js)
- `PHASE1` = 줄 배열이고, 각 줄은 `[텍스트, 개념, 풀이]` 토큰 배열이다. (004 이후 풀이는 키만 두고 설명문은 defuse.md `## 해독기 풀이`에)
- 개념: hook, addr, reg, mov, mem, args, call, result, prep, punct(항상 보임)
- 해독률은 보이는 토큰 수를 전체 토큰 수로 나눈 값이다(punct 제외).

#### 용어
`{ 레지스터: '…', 주소: '…', … }`. 대사에 `[[레지스터]]`로 표시하고, 타이핑이 끝나면 밑줄 링크로 바뀐다. (처음엔 `glossary.js`, 004에서 defuse.md `## 용어`로 이동)

### 파일별 변경
- `levels.js`: `calc` 레벨을 추가하고 `getLevel(id)`를 export한다.
- `terminal.js`: `openTerminal(level, theme, hooks, opts)`로 바꾼다.
  - `opts`: `{ lesson, learned, ui }`
  - 세션 키는 `lesson.session`이 있으면 그것, 없으면 `level.id`
  - 과제 진행기, 명령 잠금, 튜토리얼용 help, 예측/확인 버튼, 도구함 목록, 패널 공개
  - 훅: `learn(cmd)`, `reveal(ui)`, `onLessonDone()`
  - 시선 유도 하이라이트: 캐릭터 대사가 나오면 대사 칸을 강조하고 터미널을 흐리게, 읽는 시간이 지나거나 입력을 시작하면 입력칸을 강조
- `game.js`:
  - `state.learned`(튜토리얼일 때 Set), `state.ui`, `state.concepts` 추가
  - 대본 단계 `{decoder: [...]}`: 개념을 추가하고 해독기를 연 뒤, 닫을 때까지 기다린다
  - HUD에 해독기 버튼
  - 진행 칩은 `story.levels` 기준
  - 대사의 `[[용어]]` 렌더와 팝오버
- `story.js`: 폭탄 해체반 대본을 다시 쓴다. `tutorial: true`, `levels: ['calc', 1]`을 붙인다. → 이후 md 로더로 교체(`scriptmd.js` + `scripts/*.md`)
- `index.html`과 `style.css`: 선택지, 도구함, 해독기, 용어 팝오버, 패널 숨김 스타일, 선택 화면 배지.
- `tests/test.html`:
  - calc 레벨 테스트
  - 레슨 조건 평가 함수(`checkUntil`)를 순수 함수로 export해서 테스트한다
  - 레슨마다 모범 명령(`MODEL`)을 순서대로 넣으면 모든 과제가 달성되는지 시뮬레이션
  - 해독기 토큰 텍스트를 이어 붙인 결과가 실제 `disas phase_1` 출력과 같은지
  - md 파서 단위 테스트

### Constitution Check
- `engine/`은 수정하지 않는다.
- 퍼즐과 연출 분리: 레슨 과제는 대본에, 퍼즐은 levels.js에 둔다.
- 진짜처럼: 명령과 출력은 실제 gdb와 같다. 잠금은 게임 층에서만 한다.

---

## 004 반장 구어체 말투

### 접근
1. `scripts/defuse.md`의 반장 문장을 전부 고른 종결어미로 다시 쓴다. 과제 구조와 `완료:` 조건은 그대로 둔다.
2. 교육 내용이 담긴 두 JS 파일을 md로 옮긴다.
   - `glossary.js` → defuse.md `## 용어` (`- 용어: 풀이`)
   - `decoder.js`의 설명문 → defuse.md `## 해독기 풀이` (`- 키: 설명`). decoder.js에는 토큰과 설명 키만 남긴다.
3. `scriptmd.js`가 두 섹션을 읽어 `story.glossary`, `story.decoderNotes`로 넘긴다. `game.js`는 이야기 쪽 용어·설명을 쓴다.
4. 코드 안의 "~다" 문구(도구함 설명, 몇몇 안내)를 정리한다.
5. 테스트: 반장 문장 "~다." 검사, `[[용어]]`마다 풀이가 있는지, 해독기 설명 키가 다 있는지.

### 파일
- `scripts/defuse.md`, `scripts/README.md`
- `scriptmd.js`, `game.js`, `decoder.js`, `terminal.js`
- `glossary.js` 삭제
- `tests/test.html`

---

## 005 남은 글을 md로 모으기

별도 plan 없음. 접근은 [spec.md의 005 점검 결과 표](./spec.md#005-남은-글을-md로-모으기)와 [tasks.md](./tasks.md#005-남은-글을-md로-모으기)를 따른다.
- `scriptmd.js`에 `parsePuzzles` 추가 → `levels.js`가 `scripts/puzzles.md`를 읽어 제목·목표·추천 명령·힌트·카드를 합친다.
- `terminal.js`의 도구함 설명도 puzzles.md `## 도구함`에서 읽는다.
- 엔딩 문구는 이야기 md의 `엔딩문구:` 설정.

---

## 006 폭탄 해체반 하나만 남기기

| 파일 | 변경 |
|---|---|
| `scripts/detective.md`, `scripts/ghost.md` | 삭제 |
| `story.js` | `STORY_FILES = ['defuse']` |
| `levels.js`, `scripts/puzzles.md` | 퍼즐 0 삭제 |
| `art.js` | 초상화 yoon/ghost, 장면 lab/office/hall/room 삭제 |
| `style.css` | `data-skin="detective"`, `"ghost"` 규칙 삭제 |
| `game.js`, `terminal.js` | 유령 전용 분기(반투명 초상화, `glitch` 효과 선택) 삭제 |
| `tests/test.html` | L0 테스트를 calc로 옮김, lea 단위 테스트 추가, 이야기 목록 기대값 수정 |
| `scripts/README.md`, `GUIDE.md` | 두 이야기 언급 정리 |
