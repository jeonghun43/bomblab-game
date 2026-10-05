# Tasks: Bomblab 훈련소

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)
**표기**: `[P]` = 다른 파일이라 병렬 가능, `[US#]` = 관련 유저 스토리. 과업 번호는 기능마다 T001부터 다시 시작합니다(예: 003 T005).

기능별 폴더(`001`~`006`)의 tasks.md를 하나로 합친 것입니다. 새 기능을 시작하면 이 파일 맨 아래에 `## 007 …` 절을 추가합니다.

## 진행 현황
| 기능 | 과업 | 상태 |
|---|---|---|
| 001 맛보기 프로토타입 | 23 | 완료 |
| 002 장면 진행 | 18 | 완료 |
| 003 튜토리얼 | 22 | 완료 |
| 004 반장 말투 | 10 | 완료 |
| 005 md 모으기 | 8 | 완료 |
| 006 한 이야기만 남기기 | 7 | 완료 |

실행·테스트 명령은 [plan.md의 실행 방법](./plan.md#실행-방법)을 봅니다.

---

## 001 맛보기 프로토타입

### Phase 1: Setup
- [x] T001 프로젝트 폴더 구조 생성 (`engine/`, `tests/`, `specs/`)
- [x] T002 로컬 정적 서버 설정 (`.claude/launch.json`, `py -m http.server 8765`)

### Phase 2: Engine (Foundational — 모든 스토리의 전제)
- [x] T003 `engine/cpu.js` 어셈블러: 라인 파싱, 피연산자 파싱, 주소 배치, 심볼 테이블
- [x] T004 `engine/cpu.js` 레지스터(64/32비트 별칭), 메모리, 스택 초기화
- [x] T005 `engine/cpu.js` 명령 실행: mov, lea, add, sub, cmp, test, jmp, je, jne, call, ret, push, pop
- [x] T006 `engine/cpu.js` 내장 함수: read_line, strings_not_equal, string_length, explode_bomb, phase_defused
- [x] T007 `tests/test.html` 명령 단위 테스트 (32비트 zero-extend, lea 스케일, cmp 플래그, push/pop)

### Phase 3: Levels [US2][US3]
- [x] T008 `levels.js` Stage 0 (레지스터 추적) — 어셈블리, 힌트 2, 개념 카드
- [x] T009 `levels.js` Stage 1 (phase_1 축소판) — 어셈블리, rodata 문자열, 힌트 2, 개념 카드
- [x] T010 `tests/test.html` 레벨 테스트: 정답→defused, 오답→exploded, 빈 입력→exploded

### Phase 4: gdb [US2][US3]
- [x] T011 `engine/gdb.js` 실행 제어: break/delete/info break/run/continue/si/ni, 입력 대기 처리
- [x] T012 `engine/gdb.js` 검사: disas, x/s, x/Nd, x/Nx, info registers, print(/x), 식 평가
- [x] T013 `tests/test.html` gdb 시나리오 테스트 (Stage 1을 gdb 명령만으로 클리어)

### Phase 5: UI + Themes [US1]
- [x] T014 `index.html` + `style.css` 테마 선택 뷰와 게임 뷰 레이아웃 (반응형)
- [x] T015 `game.js` 터미널(히스토리, 빈 줄 반복), 레지스터/디스어셈블리 패널, 게임 명령(help/hint/answer/cards)
- [x] T016 `game.js` 스테이지 진행, 점수, 폭발/해제 연출, 개념 카드 모달
- [x] T017 [P] `themes.js` defuse 테마 텍스트 + 카운트다운
- [x] T018 [P] `themes.js` detective 테마 텍스트
- [x] T019 [P] `themes.js` ghost 테마 텍스트 + 글리치 효과
- [x] T020 `style.css` 테마별 팔레트/폰트/효과

### Phase 6: Verify
- [x] T021 브라우저 테스트 러너 전부 PASS 확인
- [x] T022 Browser pane에서 3테마 × 2스테이지 플레이스루, 콘솔 에러 0, 375px 폭 확인

### Phase 7: Publish
- [x] T023 다중 파일 Artifact로 발행, 링크 전달

### Dependencies
- T003–T006 → T007, T008–T010 → T011–T013 → T015–T016
- T014, T017–T020은 T011 이후 병렬 가능

---

## 002 캐릭터와 장소가 있는 장면 진행

### Phase 1: Foundation
- [x] T001 `terminal.js`: 001 game.js의 터미널, 레지스터, 디스어셈블리, 힌트/answer 로직을 `openTerminal({ level, theme, onClear })` 모듈로 분리
- [x] T002 `pixel.js`: 팔레트, 문자열 스프라이트 그리기, rect/dither 도구

### Phase 2: Art [US1]
- [x] T003 [P] `art.js` 초상화 3종 (반장, 윤 형사, 유령)
- [x] T004 [P] `art.js` 배경: EOD 지휘 차량, 공대 서버실
- [x] T005 [P] `art.js` 배경: K의 연구실, 전산경찰서 분석실
- [x] T006 [P] `art.js` 배경: B-03 복도, 전산실 내부 (유령 등장 플래그)

### Phase 3: Story engine [US1][US2][US4]
- [x] T007 `index.html` + `style.css`: 장면 영역, 핫스팟 레이어, 대사창, HUD, 터미널 오버레이(모니터 틀)
- [x] T008 `game.js` 대본 실행기: scene(페이드 + 장소 카드), say(타이핑, 클릭/키로 진행), set, ending
- [x] T009 `game.js` investigate: 핫스팟 look/terminal/exit, requires 잠금, 목표 문구, 수첩
- [x] T010 `game.js` quiz: 선택지, 정답/오답 대사, 감점 없음
- [x] T011 `game.js` 장면 애니메이션 루프(8fps, reduced-motion 대응)

### Phase 4: Scripts [US1–US4]
- [x] T012 [P] `story.js` 폭탄 해체반 대본
- [x] T013 [P] `story.js` 사건번호 0x402400 대본
- [x] T014 [P] `story.js` 전산실 B-03 대본
- [x] T015 `tests/test.html` 대본 검증: 장소, 캐릭터, 레벨, requires 참조가 모두 유효한지

### Phase 5: Verify & Publish
- [x] T016 테스트 러너 전부 PASS
- [x] T017 Browser pane에서 3테마를 처음부터 엔딩까지 플레이, 콘솔 오류 0, 375px 확인
- [x] T018 같은 Artifact URL로 재발행, themes.js 제거

---

## 003 처음 보는 학생을 위한 튜토리얼

### Phase 1: Data
- [x] T001 `levels.js`: calc 레벨(mov/add/sub, 64비트 이름만) + `getLevel(id)`
- [x] T002 [P] `glossary.js`: 초보자용 용어 풀이 (004에서 defuse.md로 이동 후 삭제)
- [x] T003 [P] `decoder.js`: phase_1 토큰-개념 표, 해독률 계산, 렌더 함수

### Phase 2: Lesson engine [US1–US5]
- [x] T004 `terminal.js`: 세션 키, `opts`(lesson/learned/ui), 순수 함수 `checkUntil` export
- [x] T005 `terminal.js`: 과제 진행기(say/goal/ghost/unlock/reveal/until), predict·ack 버튼, 레슨 완료 훅
- [x] T006 `terminal.js`: 명령 잠금, 튜토리얼용 help, 도구함 목록, 레슨 중 폭발 감점 면제, 마지막 레슨에만 타이머
- [x] T007 `terminal.js`: 패널 단계 공개(레지스터 패널/보이는 칸/디스어셈블리)

### Phase 3: Game layer [US1][US6]
- [x] T008 `index.html` + `style.css`: 선택지, 도구함, 해독기, 용어 팝오버, 패널 숨김, 튜토리얼 배지
- [x] T009 `game.js`: learned/ui/concepts 상태, 레슨 스팟 연결, `{decoder}` 단계, HUD 해독기 버튼, story.levels 기준 진행 칩
- [x] T010 `game.js`: `[[용어]]` 렌더(대사창·터미널 캐릭터 줄)와 팝오버

### Phase 4: Script [US1–US5]
- [x] T011 `story.js`: 폭탄 해체반 대본을 5레슨으로 재작성(hook, stop, calc, memory, final)
- [x] T012 `story.js`: 탐정·유령에 levels 필드, 선택 화면에 "튜토리얼 준비 중" 표시

### Phase 5: Tests
- [x] T013 `tests/test.html`: calc 레벨, checkUntil, 레슨 모범답안 시뮬레이션, 해독기 텍스트 = disas 출력

### Phase 6: 대본 md 원본화 (사용자 추가 요청: "어떤 내용을 어떤 대본으로 알려줄지 md로 정리하고, 게임은 항상 그 md를 사용")
- [x] T016 `scriptmd.js`: 대본 md 문법 파서 (설정/캐릭터/대본 섹션만 읽고 나머지는 무시)
- [x] T017 `scripts/README.md`: 대본 md 작성법
- [x] T018 [P] `scripts/defuse.md`: 폭탄 해체반 대본 + 커리큘럼(어떤 개념을 어떤 대사·과제로 가르치는지)
- [x] T019 [P] `scripts/detective.md`, `scripts/ghost.md`: 기존 대본 이전 (006에서 삭제)
- [x] T020 `story.js`: md 파일을 읽어 STORIES를 만드는 로더로 교체, JS로 쓴 대본 삭제
- [x] T021 `tests/test.html`: 파서 단위 테스트 + md 파싱 결과가 이전 JS 대본과 같은지 1회 확인
- [x] T022 `terminal.js` + `style.css`: 시선 유도 하이라이트 (사용자 추가 요청). 캐릭터 대사가 나오면 대사 칸을 강조하고 터미널을 흐리게 하며, 읽는 시간이 지나거나 입력을 시작하면 입력칸을 강조한다. 예측·확인 버튼 과제는 대사 칸 강조를 유지한다.

### Phase 7: Verify & Publish
- [x] T014 Browser pane에서 폭탄 해체반 전체 플레이(잠금, 공개, 예측 오답, 해독률 0→100%), 나머지 두 이야기 자동 진행, 375px, 콘솔
- [x] T015 같은 Artifact URL로 재발행

---

## 004 반장 구어체 말투

- [x] T001 `scriptmd.js`: `## 용어`, `## 해독기 풀이` 섹션 읽기
- [x] T002 `decoder.js`: 설명문을 키로 바꾸고 `renderDecoder`가 설명 표를 받게 한다
- [x] T003 `game.js`: 이야기의 용어·해독기 설명 사용, glossary.js 제거, "이미 해제" 안내를 안내역 대사로
- [x] T004 `terminal.js`: 도구함 설명과 안내 문구에서 "~다" 제거
- [x] T005 `scripts/defuse.md`: `## 말투` 섹션 + 반장 문장 전부 구어체로 + 용어·해독기 풀이 섹션
- [x] T006 `scripts/README.md`: 새 섹션 문법 추가
- [x] T007 `tests/test.html`: "~다." 검사, 용어 풀이·해독기 설명 누락 검사, 전체 PASS
- [x] T008 브라우저에서 튜토리얼 확인 후 같은 Artifact URL로 재발행
- [x] T009 (사용자 추가 요청) 퀴즈 보기 앞의 "1. 2. 3." 번호 제거. 보기 자체가 숫자일 때 헷갈림. `terminal.js` 예측 퀴즈, `game.js` 대사창 퀴즈
- [x] T010 (사용자 직접 수정) 반장 대사 일부를 "~해 / ~이야"로 바꿈. "~거든"이 반복되어 어색하다는 이유. `## 말투` 표에 추가하고 "~거든은 한 대사에 한 번까지" 규칙을 기록 (005 T001)

---

## 005 남은 글을 md로 모으기

- [x] T001 말투 기록 갱신: defuse.md `## 말투`, GUIDE.md 7절, 004 spec에 "~해 / ~이야" 추가와 "~거든 남발 금지" 반영, 메모리 저장
- [x] T002 004 tasks에 퀴즈 보기 번호 제거 기록
- [x] T003 `scripts/puzzles.md` 작성 (도구함 + 퍼즐 0, 1, calc의 제목·목표·추천 명령·힌트·카드)
- [x] T004 `scriptmd.js`에 `parsePuzzles` 추가, `levels.js`가 puzzles.md를 읽어 합치도록 변경
- [x] T005 `terminal.js`의 도구함 설명을 puzzles.md에서 읽도록 변경
- [x] T006 엔딩 문구를 이야기 md의 `엔딩문구:`로 이동 (3개 이야기)
- [x] T007 `scripts/README.md`에 puzzles.md 문법과 `엔딩문구` 추가, GUIDE.md에 "글이 있는 곳" 표와 파일 표 갱신
- [x] T008 테스트: 옮기기 전과 퍼즐 글이 같은지 1회 비교, 파서 테스트, 전체 PASS, 재게시

---

## 006 폭탄 해체반 하나만 남기기

- [x] T001 대본 md 두 개 삭제, `story.js` 목록 수정
- [x] T002 퍼즐 0 삭제 (`levels.js`, `puzzles.md`)
- [x] T003 쓰지 않는 그림 삭제 (`art.js`)
- [x] T004 쓰지 않는 스킨과 유령 전용 코드 삭제 (`style.css`, `game.js`, `terminal.js`)
- [x] T005 테스트 수정: L0 → calc, lea 단위 테스트, 이야기 목록
- [x] T006 문서 정리 (README, GUIDE, puzzles.md)
- [x] T007 테스트 전부 PASS, 자동 진행 확인, 재게시

---

## 007 spec 문서 통합

- [x] T001 `specs/001`~`006` 폴더의 spec/plan/tasks를 `specs/spec.md`, `specs/plan.md`, `specs/tasks.md` 하나씩으로 합침
- [x] T002 plan.md에 실행 방법(로컬 서버 명령, 게임·테스트 주소) 추가
- [x] T003 기존 기능별 폴더 삭제, GUIDE.md의 specs 안내 갱신
