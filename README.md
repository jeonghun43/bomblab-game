# Bomblab 훈련소

어셈블리어 기초를 게임으로 공부하기 위한 저장소입니다.

CS:APP Bomblab 과제를 처음 접하는 학생이 gdb가 뭔지, 레지스터가 뭔지 몰라도 시작할 수 있게 만들었습니다. 폭탄 해체반 반장에게 교육을 받으면서 브라우저 안의 가짜 gdb 터미널에 **진짜 gdb 명령을 직접 입력**해 연습용 폭탄을 해체합니다.

## 무엇을 배우나요
- **레지스터**: `rax`, `rdi`, `rsi`가 무엇이고 값이 어떻게 바뀌는지
- **메모리와 주소**: 주소 안에 들어 있는 글자를 읽는 법
- **함수 호출 규약**: 인자는 `rdi`, `rsi`로, 결과는 `rax`로
- **gdb 명령**: `run`, `break`, `continue`, `stepi`, `print`, `info registers`, `x/s`, `disassemble`
- **phase_1 읽기**: `mov $0x402400,%esi` → `call strings_not_equal` 패턴을 읽고 비밀 문자열 찾기

플레이 시간은 15~20분 정도입니다. 명령은 하나씩 열리고, 실행하기 전에 결과를 먼저 예측해 보게 합니다.

> 이 게임의 폭탄과 정답은 연습용으로 새로 만든 것이며, 실제 과제의 답과는 다릅니다.

## 로컬에서 실행하기

빌드 과정이 없고 서버 코드도 없습니다. HTML, CSS, JavaScript 파일만으로 브라우저에서 돌아갑니다. 단, `index.html`을 더블클릭해서 열면 동작하지 않습니다. 게임이 JavaScript 모듈과 대본 md 파일을 불러오는데, 브라우저가 `file://` 주소에서는 이걸 막기 때문입니다. 그래서 간단한 로컬 서버가 하나 필요합니다.

### 1. 포크하고 내려받기
GitHub에서 오른쪽 위의 **Fork** 버튼을 눌러 내 계정으로 복사한 뒤, 내 저장소를 내려받습니다.

```bash
git clone https://github.com/jeonghun43/bomblab-game.git
```

```bash
cd bomblab-game
```

git을 쓰지 않는다면 **Code → Download ZIP**으로 받아 압축을 풀어도 됩니다.

### 2. 로컬 서버 띄우기
프로젝트 폴더 안에서 아래 중 하나를 실행합니다.

**Python이 있는 경우** 
```bash
python -m http.server 8000
```

**Node.js가 있는 경우**
```bash
npx serve -l 8000
```

### 3. 브라우저로 접속
| 무엇 | 주소 |
|---|---|
| 게임 | http://localhost:8000 |
| 테스트 (전부 PASS면 정상) | http://localhost:8000/tests/test.html |

서버를 끄려면 터미널에서 **Ctrl+C**를 누릅니다.

### 잘 안 될 때
- **`'py'은(는) 내부 또는 외부 명령…이 아닙니다`**: `py` 대신 `python`을 쓰세요. 그래도 안 되면 Python이 설치되지 않은 것이니 https://www.python.org 에서 설치합니다.
- **포트가 이미 사용 중이라고 나올 때**: `8000` 대신 `8080` 같은 다른 숫자를 쓰고, 주소도 그 번호로 바꿉니다.
- **파일을 고쳤는데 화면이 그대로일 때**: 브라우저 캐시 때문입니다. **Ctrl+Shift+R**(macOS는 Cmd+Shift+R)로 강력 새로고침합니다.
- **화면이 비어 있을 때**: 주소가 `file://`로 시작하는지 확인하세요. 반드시 `http://localhost:…`로 열어야 합니다.

## 대사와 퍼즐 고치기
대사, 과제, 퀴즈, 용어 풀이는 코드가 아니라 md 파일에 있습니다. 파일을 고치고 새로고침하면 게임에 바로 반영됩니다.

| 파일 | 내용 |
|---|---|
| [scripts/defuse.md](scripts/defuse.md) | 폭탄 해체반 대본, 커리큘럼, 말투 규칙, 용어 풀이 |
| [scripts/puzzles.md](scripts/puzzles.md) | 퍼즐 제목·목표·힌트·개념 카드, 도구함 설명 |
| [scripts/README.md](scripts/README.md) | 대본 md 작성법 |

고친 뒤에는 테스트 페이지에서 전부 PASS인지 확인하세요.

## 폴더 구조
```
index.html, style.css   화면
game.js                 대본 실행기 (장면, 대사, 조사, 퀴즈)
terminal.js             gdb 터미널과 레슨 진행 (명령 잠금, 예측 퀴즈)
engine/cpu.js           x86-64 해석기
engine/gdb.js           gdb 명령 해석기
levels.js               퍼즐 어셈블리와 정답 판정
art.js, pixel.js        픽셀 아트
scripts/                대본과 퍼즐 글 (md)
tests/test.html         브라우저 테스트
specs/                  기능별 설계 기록 (spec, plan, tasks)
GUIDE.md                같은 방식으로 다른 주제(SQL, 리눅스 등) 게임을 만드는 가이드
```

## 배포하기
정적 파일뿐이라 폴더를 그대로 GitHub Pages, Vercel, Netlify, Cloudflare Pages 같은 곳에 올리면 됩니다. 자세한 내용은 [GUIDE.md](GUIDE.md) 10절을 보세요.
