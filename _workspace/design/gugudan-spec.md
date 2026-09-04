# 구구단 로켓 — 구현 명세 (엔진 API 계약 + 화면 명세)

이 문서는 `www/gugudan/`을 만드는 두 작업자(엔진 담당, 화면 담당)가 공유하는 계약이다.
결정 원장: 사용자가 2026-09-02에 확정한 것 — 거꾸로 순서는 9단부터 각 단 ×9→×1, 구두 인증은 자기 수정 2개까지·서로 다른 날 두 번,
용돈은 하루 임무 하나에 30원, 입력은 확정 키 방식, 부모 인증은 주 1회. 시각 시안은 `_workspace/design/gugudan-codex-mockup.html`(사용자가 고른 Codex 시안).

## 0. 제약 (다른 게임과 같다)

- 광고·과금·분석 없음. 외부 리소스는 Google Fonts 링크(주아·노토 산스 KR)만. 이미지 파일 없이 CSS·인라인 SVG·이모지.
- 의존성 0, 빌드 없음. ES 모듈. **반드시 서버로 실행**(`npm run serve` → http://localhost:4173/gugudan/). `file://`에서는 모듈이 죽는다.
- 주 기기는 아이패드 세로(820×1180) 홈 화면 앱. 폰 세로(390 폭)에서도 깨지지 않아야 한다. 터치 타깃 56px 이상.
- 시간은 `performance.now()`로 잰다. 화면이 숨겨졌다 돌아오면 진행 중이던 문제는 무효로 하고 새 문제를 낸다.
- 오디오는 사용자 활성화 이벤트(click·pointerup)에서 잠금을 푼다. `www/omok/js/audio.js`를 복사해 쓴다(pointerdown에서 unlock 금지).
- 저장은 `localStorage` 키 `gugudan.v1` 하나. 예외는 전부 삼킨다(사생활 모드).
- **문제 사이에 연출을 넣지 않는다.** 정답은 입력칸이 잠깐 밝아지고 짧은 소리, 오답은 정답을 잠깐 보여준 뒤 아이가 직접 다시 입력. 축하는 한 판이 끝난 뒤에만.
- 순위표·남과 비교·문제마다 뜨는 시간 막대·음성 인식 없음. 아이 화면에는 초 단위 숫자를 보여주지 않는다(부모 화면에만).

## 1. 파일 배치

```
www/gugudan/
├─ index.html          화면 전부(data-screen 토글). 모듈 스크립트 js/app.js
├─ css/style.css
├─ sw.js               오프라인 캐시. 스코프 /gugudan/, 캐시 이름 접두사 gugudan-, VERSION '__BUILD__'
└─ js/
   ├─ engine.js        순수 로직(DOM·Date.now() 없음). ← 엔진 담당
   ├─ store.js         localStorage 읽기/쓰기/내보내기/가져오기 ← 엔진 담당
   ├─ audio.js         omok/js/audio.js 복사 ← 화면 담당
   ├─ ui.js            DOM 조작만 ← 화면 담당
   └─ app.js           화면 흐름 총괄, engine.js 호출 ← 화면 담당
tests/gugudan-engine.test.js, tests/gugudan-sim.test.js, tests/gugudan-doc-sync.test.js ← 엔진 담당
documents/구구단-로켓-지침서.md ← 엔진 담당
```

화면 담당은 `www/gugudan/` 안의 index.html·css·js/app.js·js/ui.js·js/audio.js·sw.js **만** 만든다.
`www/index.html`, `www/sw.js`, 다른 게임 폴더, `tests/`, `package.json`, `CLAUDE.md`는 건드리지 않는다(다른 세션이 편집 중).

## 2. 사실(fact)과 순서

- 사실 72개: a ∈ {2..9}, b ∈ {1..9}. id는 `'7x8'` 꼴(소문자 x). 교환쌍은 서로 다른 사실이다(7x8과 8x7).
- 거꾸로 순서 `BACKWARD_ORDER`: 9x9, 9x8, …, 9x1, 8x9, …, 8x1, …, 2x9, …, 2x1 (72개).
- 읽기: 화면에는 `7 × 8`처럼 곱셈 기호 `×`로 표시한다.

## 3. 엔진 API (`js/engine.js`) — 화면 담당은 이 시그니처를 그대로 쓴다

모든 함수는 순수하다. `now`는 `Date.now()` 밀리초를 호출자가 넘긴다. 상태(`state`)는 함수가 **제자리에서 바꾸고**, 바꾼 뒤 호출자가 `store.save(state)`를 부른다.

```js
export const DANS = [2,3,4,5,6,7,8,9];
export const FACT_IDS;                       // 72개 id
export const BACKWARD_ORDER;                 // 72개 id, 거꾸로 순서
export function fact(id);                    // → { id, a, b, ans }
export function dayKey(now);                 // → 'YYYY-MM-DD' (로컬 날짜)
export function makeRng(seed);               // → () => [0,1)
export function newState();                  // → 새 상태(아래 4절)

// 지표
export function factStats(state, id, now);   // → { acc3, median3, max3, seen, lastDay, daysSince }  (ms 단위, 없으면 null)
export function isMastered(state, id);       // acc3===3 && median3<=1500 && max3<=2500
export function danStable(state, dan);       // 그 단 9개 전부 acc3===3 && median3<=2000
export function stage(state, now);           // → { no:0|1|2|3|4, name, detail }   name: '진단'|'단별 안정'|'혼합'|'구두 인증'|'거꾸로 도전'
export function planets(state);              // → [{ dan, status:'stable'|'now'|'far' }]  now = 안정 안 된 첫 단
export function badges(state);               // → [{ key, name, earned, count }] key: planet|pair|perfect|fuel50|streak|cert|chant36
export function parentGrid(state, view, now);// view 'acc'|'time'|'last' → [{ dan, cells:[{ id, value, level:0..3, label }] }]  (8행×9열)
export function confusionList(state);        // → [{ a, b, count, phase:'apart'|'contrast'|'done' }]

// 연료 채우기 / 진단 세션 (24문제)
export function buildSession(state, now, rng);          // → Session { kind:'diag'|'fuel', items:[id], pos, correct, answered, done, ms, ghostMs, isBest, goalMet }
//   ms·ghostMs·isBest·goalMet은 판이 끝나는 순간 채워진다. 결과 화면이 "이번 판 시간 / 최근 기록"을 그리는 데 쓴다.
//   ghostMs는 기록이 2판 미만이면 null이고, 그때 화면은 대신 목표(FUEL_GOAL_MS)를 보여준다.
export function sessionGhostMs(state, kind);            // → ms | null   같은 종류 최근 GHOST_N판의 중간값
export function sessionCurrent(session);                // → id | null
export function sessionAnswer(state, session, { value, ms, fixed }, now);
//   value: 아이가 넣은 숫자, ms: 문제 표시부터 마지막 숫자까지, fixed: 지우기를 썼거나 첫 숫자가 틀렸으면 true
//   → { ok, ans, requeued, done }   ok=false면 화면은 정답을 보여주고 아이가 다시 입력하게 한 뒤 sessionRetyped()를 부른다
export function sessionRetyped(session);                // 오답 뒤 아이가 정답을 다시 입력했음을 표시(다음 문제로)
export function sessionSkip(state, session);            // 화면이 숨겨졌을 때: 현재 문제를 무효화하고 뒤로 보낸다(기록 없음)

// 로켓 레이스
export function raceSets(state);             // → [{ key, name, count, available }]  key 예: 'dan-6' | 'two-6-7' | 'all-random' | 'all-backward'
export function buildRace(state, key, rng);  // → Race { key, name, items:[id], pos, correct, wrong }
export function raceAnswer(state, race, { value, ms, fixed }, now); // → { ok, ans, done }  (오답도 기록하고 다음으로; 재입력 없음)
export function raceFinish(state, race, totalMs, now);  // → { accuracy, stable, perfect, ghostMs, isBest }  stable = accuracy>=0.95
export function ghostMs(state, key);         // 최근 5회 중간값. 2회 미만이면 null

// 구두 카드 (아이 혼자, 자기 판정)
export function buildOral(state, rng);       // → [id ×10]
export function recordOral(state, results, now);  // results: [{ id, ok }]

// 거꾸로 암송
export const CHANT_PACES = [72, 60, 48, 40, 36];   // 초. practice 모드 박자
export function recordChant(state, { mode:'practice'|'measure', ms, errors, misses }, now); // → { passed }  measure에서 ms<=36000 && errors===0 && misses===0

// 구두 인증 (부모와, 무작위 72개)
export function buildCertification(rng);     // → [72 id]
export function recordCertification(state, { errors, misses, corrections }, now); // → { passed, certified }  passed = errors0·misses0·corrections<=2, certified = 서로 다른 날 2회

// 오늘의 임무 · 용돈
export function mission(state, now);         // → { fuel, race, oral, done, paid, coins }   done이면 coins에 30원이 하루 한 번 들어간다
export function payout(state);               // 저금통 0원으로(부모가 지급했을 때)

// 운영
export function invalidateLast(state);       // 마지막으로 기록한 답 하나를 지운다(부모 화면 '마지막 문제 무효화')
export function resetEngine(state);          // 학습 상태(facts·pairs·sessions·races·단계)만 초기화. 용돈·배지 카운트는 남긴다
export function exportState(state);          // → JSON 문자열
export function importState(text);           // → state (검증 실패 시 throw)
```

세션 규칙(엔진이 보장, 화면은 몰라도 된다): 진단은 첫 사흘 하루 24개로 72개를 한 번씩. 연료 채우기 24문제는 집중 12·간격 복습 7·무작위 5.
한 사실은 세션에 4번까지, 같은 사실 사이 최소 3문제. 어떤 사실도 5일 넘게 안 나오지 않는다. 오답은 3~5문제 뒤 재출제.
혼동쌍은 아이의 오답에서 만들고 처음엔 같은 세션에 같이 내지 않다가, 이틀 정확하면 대비 세트로 연달아 낸다.

## 4. 상태 모양 (저장되는 것)

```js
{
  v: 1,
  facts: { '7x8': { hist: [{ day, ms, ok, fixed }], lastDay, interval, seen } },   // hist 최근 10개
  pairs: { '6x7|6x8': { a:'6x7', b:'6x8', count, phase, reverted, okDays:[] } },
  diagDays: [], sessions: [], races: { 'dan-6': [{ day, ms, correct, total }] },
  stage2Days: [], certDays: [], chantBest: null, chant36Days: [], fuel50Days: [],
  mission: { day, fuel, race, oral, paid }, missionDays: [],
  allowance: { coins, total }, perfectRaces: 0, pairsDone: 0,
  settings: { ghost: true, chantPace: 72 },
}
```

## 5. 저장 API (`js/store.js`)

```js
export function load();            // → state (없으면 newState())
export function get();             // → 현재 state
export function save(state);       // localStorage에 기록. 예외 삼킴
export function setPractice(on);   // 연습 모드: on이면 save()가 아무것도 쓰지 않는다(부모가 눌러 보는 동안 기록 오염 방지)
export function exportText(); export function importText(text);
```

## 6. 화면과 흐름 (`index.html` + `js/app.js` + `js/ui.js`)

시안의 다섯 화면을 그대로 옮기고, 시안에 없는 화면은 같은 시각 언어로 만든다. 화면 전환은 오목처럼 `#app[data-screen="…"]`로.

| 화면 | 시안 | 내용 |
|---|---|---|
| home | 화면 1 | 오늘의 임무(연료 채우기 1회·레이스 1회·구두 카드 10장 체크), 연료 게이지(임무 진행 3단계), 행성 8개(`planets()`), 배지 7개(`badges()`), 용돈 30원 표시, 부모 잠금 버튼(3초 길게 누르면 부모 화면) |
| fuel | 화면 2 | `buildSession` 24문제. 큰 문제, 입력칸, 숫자판 0~9·지우기·확정. 진행 n/24, 연료 게이지. 끝나면 결과 카드(정답 수, 임무 체크)와 홈으로 |
| race-pick | 없음 | `raceSets()` 목록에서 고른다. 사용 불가 세트는 잠긴 모양. 유령 기록(있으면) 표시 |
| race | 화면 3 | 트랙 위 내 로켓(정답 수 비례)과 유령 로켓(유령 ms 대비 경과 시간 비례, 설정에서 끌 수 있음), 문제·숫자판, 진행 n/N |
| race-result | 화면 3의 삽입 카드 | 항로 안정/완벽 항로, 정확도, 오늘 시간 vs 최근 5회, 홈으로·한 번 더 |
| oral | 화면 4 | `buildOral` 10장. 큰 문제 → "답 보기" → 답 표시 + 맞았어/틀렸어. 끝나면 `recordOral` |
| chant | 없음 | 거꾸로 암송. 연습 모드: 박자(72·60·48·40·36초 중 선택)에 맞춰 식이 뜨고 박자 뒤 답이 보인다. 측정 모드: 답을 숨기고 큰 시작/정지 버튼과 "틀림"·"놓침" 카운트 버튼(부모가 누른다). 끝나면 `recordChant` |
| parent | 화면 5 | 8×9 격자와 보기 탭(정확도·답 시간·마지막 출제), 혼동쌍 목록, 이번 주 인증 상태와 "인증 시작", 저금통과 "용돈 지급 완료"(두 번 눌러 확인, 숫자숲과 같이), 운영 버튼(연습 모드 토글·마지막 문제 무효화·엔진 초기화·내보내기·가져오기), 유령 끄기 설정 |
| cert | 없음 | 구두 인증(부모 화면에서 시작). 무작위 72개를 하나씩 크게 보여주고 부모가 맞음/틀림/못 함/수정 버튼을 누른다(못 함 = 답을 못 낸 것, `misses`). 끝나면 `recordCertification` 결과 |

숫자판 규칙: **답의 자릿수가 차면 바로 제출**한다(확정 키 없음 — 처음엔 확정 키였으나 배포 뒤 사용자가 탭이 너무 잦다고 해서 뺐다, 2026-09-02). 숫자 아닌 키는 무시. `ms`는 문제 표시부터 **마지막 숫자 키**까지. 지우기를 썼거나 첫 키가 정답의 첫 자리와 다르면 `fixed=true`. 숫자판 마지막 줄은 [지우기][0(두 칸)].
정답이면 입력칸 테두리를 0.3초 밝히고 `audio.stone()` 같은 짧은 소리. 오답이면 정답을 입력칸에 1.2초 보여준 뒤 비우고, 아이가 정답을 그대로 입력해야 다음으로 간다(`sessionRetyped`). 레이스는 재입력 없이 다음으로.
문제 사이 대기 시간은 정답 0.3초·오답 1.2초 외에 없다.

내보내기·가져오기: 긴 문자열을 textarea에 보여주고 복사하게 한다(다운로드 불가 환경).

## 7. 오프라인 (`sw.js`)

`www/omok/sw.js`를 본떠 쓴다. 캐시 이름 `gugudan-${VERSION}`, `activate`에서 `gugudan-` 접두사인 옛 캐시만 지운다.
ASSETS에 index.html·css·js 전부. VERSION은 `'__BUILD__'` 그대로 둔다(배포 시 CI가 치환).

## 8. 완료 기준 (화면 담당)

- `node --check`가 모든 js에서 통과. `index.html`의 모든 `data-action`에 app.js 핸들러가 있고(오목의 `ACTIONS` 객체 방식), ui.js가 찾는 id가 HTML에 있다.
- 서버로 띄워 브라우저에서 홈→연료 채우기 24문제→결과→홈→레이스→결과→구두 카드→부모 화면→인증 흐름이 끊기지 않는다(브라우저가 없으면 코드로 확인하고 그 사실을 보고).
- 보고서: 만든 파일 목록, 시안과 달리 한 결정, 엔진 API 중 실제로 쓴 함수 목록, 남은 문제.
