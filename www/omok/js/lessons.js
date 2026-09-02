/**
 * 오목 교실 커리큘럼 — 레슨 순서·시범 수순·퍼즐 템플릿·문구의 정본.
 *
 * 사람용 설명은 documents/오목-교실-지침서.md 에 있고, tests/omok-doc-sync.test.js 가
 * 이 파일의 레슨 목록과 지침서의 표를 대조한다. 레슨을 더하거나 이름을 바꾸면 지침서도 같이 고친다.
 *
 * 시범(demo) 단계 형식:
 *   { say }                       말풍선만
 *   { say, focus: [[r,c],...] }    돌들을 한 줄로 비추며 말한다
 *   { say, ask: [[r,c],...] }      물음표 표식을 띄우고 아이가 생각할 틈을 준다
 *   { say, move: [r,c], who: 'X'|'O', expect?: skill }
 *                                 돌을 놓는다. expect가 있으면 그 기술의 줄을 자동으로 비추고,
 *                                 tests/lessons.test.js 가 그 자리에서 실제로 그 기술이 성립하는지 검사한다.
 *   { say, add: {X:[[r,c]], O:[[r,c]]} }  돌을 여럿 한꺼번에 깐다(설명용 새 모양)
 *   { say, reset: true }          처음 국면으로 되돌린다
 *   { say, marks: [[r,c],...] }    동그라미 표식(대안 자리 등)
 *
 * 퍼즐 템플릿: X=내 돌(항상 검은 돌), O=상대 돌, .=반드시 빈칸. 대칭 8가지와 위치는 무작위다.
 * 정답은 템플릿에 적지 않는다 — 엔진이 열거한다(puzzle.js).
 */

import { SKILL } from './tactics.js';
import { LEVEL } from './ai.js';

/** 레슨당 퍼즐 수와 별을 주는 첫 시도 정답 수. 지침서와 대조된다. */
export const PUZZLES_PER_LESSON = 5;
export const PUZZLE_STAR_MIN = 4;
/** 레슨 9 퍼즐의 연속 사 깊이(내가 두는 사의 개수). */
export const VCF_LESSON_DEPTH = 3;

const X = 'X';
const O = 'O';

export const LESSONS = Object.freeze([
  {
    id: 'five',
    title: '다섯 만들기',
    subtitle: '다섯 개를 이으면 이겨요',
    skill: SKILL.FIVE,
    intro: '오목은 같은 색 돌 다섯 개를 한 줄로 이으면 이기는 놀이예요. 가로, 세로, 비스듬히 다 돼요.',
    demo: {
      stones: { X: [[7, 4], [7, 5], [7, 6], [7, 7]], O: [[6, 5], [6, 6], [8, 6]] },
      steps: [
        { say: '검은 돌 네 개가 나란히 있어요. 이런 모양을 "사"라고 해요.', focus: [[7, 4], [7, 7]] },
        { say: '한 개만 더 놓으면 다섯! 어디에 놓을까요?', ask: [[7, 3], [7, 8]] },
        { say: '여기! 다섯 개가 이어졌어요. 이기면 이렇게 줄이 반짝여요.', move: [7, 8], who: X, expect: SKILL.FIVE },
      ],
    },
    puzzle: {
      kind: 'attack',
      skill: SKILL.FIVE,
      prompt: '한 수로 다섯을 만들어 보세요',
      templates: [
        ['..XXXX..'],
        ['OXXXX..'],
        ['.XX.XX.'],
        ['.XXX.X.'],
      ],
    },
    practice: { level: LEVEL.EASY },
  },
  {
    id: 'block-four',
    title: '사 막기',
    subtitle: '상대가 넷이면 꼭 막아요',
    skill: SKILL.FIVE,
    intro: '상대 돌이 네 개 이어지면 다음 수에 다섯이 돼요. 그 자리를 먼저 막아야 해요.',
    demo: {
      stones: { O: [[7, 5], [7, 6], [7, 7], [7, 8]], X: [[7, 4], [6, 6], [8, 7]] },
      steps: [
        { say: '이번엔 흰 돌이 네 개예요. 다음에 흰 돌이 한 개 더 놓이면 져요!', focus: [[7, 5], [7, 8]] },
        { say: '흰 돌이 다섯이 되는 자리는 어디일까요? 왼쪽은 이미 검은 돌이 막고 있어요.', ask: [[7, 9]] },
        { say: '여기를 막았어요. 이제 흰 돌은 이 줄로는 다섯을 못 만들어요.', move: [7, 9], who: X },
        { say: '띈 모양도 조심! 흰 돌 둘, 빈칸, 둘도 "사"예요. 빈칸에 놓이면 다섯이 되니까요.', add: { O: [[10, 4], [10, 5], [10, 7], [10, 8]] }, focus: [[10, 4], [10, 8]] },
        { say: '가운데를 막아요!', move: [10, 6], who: X },
      ],
    },
    puzzle: {
      kind: 'defense',
      skill: SKILL.FIVE,
      prompt: '흰 돌이 다섯이 되기 전에 막아 보세요',
      templates: [
        ['XOOOO..'],
        ['.OO.OO.'],
        ['.OOO.O.'],
        ['..OOOOX'],
      ],
    },
    practice: { level: LEVEL.EASY },
  },
  {
    id: 'block-three',
    title: '삼 미리 막기',
    subtitle: '뚫린 사는 못 막아요',
    skill: SKILL.OPEN_FOUR,
    intro: '상대 돌 세 개의 양쪽이 비어 있으면 "삼"이에요. 삼을 그냥 두면 다음에 못 막는 사가 돼요.',
    demo: {
      stones: { O: [[7, 5], [7, 6], [7, 7]], X: [[5, 5], [9, 8]] },
      steps: [
        { say: '흰 돌 세 개, 양쪽이 비어 있어요. 이건 "삼"이에요.', focus: [[7, 5], [7, 7]] },
        { say: '그냥 두면 어떻게 될까요? 흰 돌이 한 개 더 놓이면…', move: [7, 8], who: O, expect: SKILL.OPEN_FOUR },
        { say: '양쪽이 뚫린 "사"가 됐어요! 이쪽을 막으면…', move: [7, 4], who: X },
        { say: '저쪽에 놓아서 다섯! 뚫린 사는 한 수로 못 막아요.', move: [7, 9], who: O, expect: SKILL.FIVE },
        { say: '다시 처음으로. 삼일 때 미리 막아야 해요. 바로 옆 어디든 좋아요.', reset: true, ask: [[7, 4], [7, 8]] },
        { say: '막았어요! 이제 흰 돌이 한 개 더 놓아도 한쪽이 막힌 사라서 막을 수 있어요.', move: [7, 8], who: X },
      ],
    },
    puzzle: {
      kind: 'defense',
      skill: SKILL.OPEN_FOUR,
      prompt: '흰 돌의 삼을 미리 막아 보세요',
      templates: [
        ['...OOO...'],
        ['..OO.O..'],
        ['..O.OO..'],
      ],
    },
    practice: { level: LEVEL.EASY },
  },
  {
    id: 'three',
    title: '삼 만들기',
    subtitle: '둘에서 하나 더',
    skill: SKILL.THREE,
    intro: '내 돌 둘의 양쪽이 비어 있으면 하나만 더 놓아 "삼"을 만들 수 있어요. 삼을 만들면 상대는 꼭 막아야 해요.',
    demo: {
      stones: { X: [[7, 6], [7, 7]], O: [[5, 5], [9, 9]] },
      steps: [
        { say: '검은 돌 둘, 양쪽이 비어 있어요. 한 개를 더 놓으면 삼이 돼요.', focus: [[7, 6], [7, 7]] },
        { say: '어디에 놓으면 삼이 될까요?', ask: [[7, 5], [7, 8]] },
        { say: '삼! 양쪽이 뚫려 있어서 상대가 막지 않으면 뚫린 사가 돼요.', move: [7, 8], who: X, expect: SKILL.THREE },
        { say: '상대가 막았어요. 괜찮아요. 삼을 만들면 상대는 막느라 바빠서 내가 앞서 가요.', move: [7, 9], who: O },
        { say: '한 칸 띄어도 삼이에요. 검은 돌 둘 옆에 한 칸을 띄고…', reset: true, focus: [[7, 6], [7, 7]] },
        { say: '둘, 빈칸, 하나. 이것도 삼! 가운데를 채우면 뚫린 사가 되거든요.', move: [7, 9], who: X, expect: SKILL.THREE },
      ],
    },
    puzzle: {
      kind: 'attack',
      skill: SKILL.THREE,
      prompt: '한 수로 삼을 만들어 보세요',
      templates: [
        ['...XX...'],
        ['O.XX....'],
        ['...X.X...'],
      ],
    },
    practice: { level: LEVEL.EASY },
  },
  {
    id: 'open-four',
    title: '뚫린 사 만들기',
    subtitle: '삼을 안 막으면 이렇게',
    skill: SKILL.OPEN_FOUR,
    intro: '내 삼을 상대가 안 막았다면 기회예요. 한 개를 더 놓아 양쪽이 뚫린 사를 만들면 상대는 못 막아요.',
    demo: {
      stones: { X: [[7, 5], [7, 6], [7, 7]], O: [[5, 6], [9, 8], [6, 9]] },
      steps: [
        { say: '내 삼이 있는데 상대가 안 막았어요! 지금이 기회예요.', focus: [[7, 5], [7, 7]] },
        { say: '어디에 놓으면 뚫린 사가 될까요?', ask: [[7, 4], [7, 8]] },
        { say: '뚫린 사! 양쪽 어디든 놓으면 다섯이라 상대는 못 막아요.', move: [7, 8], who: X, expect: SKILL.OPEN_FOUR },
        { say: '한쪽을 막아도…', move: [7, 9], who: O },
        { say: '다른 쪽에 놓아서 다섯!', move: [7, 4], who: X, expect: SKILL.FIVE },
      ],
    },
    puzzle: {
      kind: 'attack',
      skill: SKILL.OPEN_FOUR,
      prompt: '한 수로 뚫린 사를 만들어 보세요',
      templates: [
        ['...XXX...'],
        ['..XX.X..'],
        ['..X.XX..'],
      ],
    },
    practice: { level: LEVEL.NORMAL },
  },
  {
    id: 'double-three',
    title: '쌍삼',
    code: '3-3',
    subtitle: '삼이 두 개면 못 막아요',
    skill: SKILL.DOUBLE_THREE,
    intro: '한 수로 삼을 두 개 만들면 "쌍삼"이에요. 상대는 한 번에 하나만 막을 수 있어서 남은 삼이 뚫린 사가 돼요.',
    demo: {
      stones: { X: [[7, 5], [7, 6], [5, 7], [6, 7]], O: [[5, 5], [8, 9], [9, 6]] },
      steps: [
        { say: '가로로 둘, 세로로 둘. 둘이 만나는 자리가 보이나요?', focus: [[7, 5], [7, 6]] },
        { say: '여기에 놓으면 삼이 몇 개 생길까요?', ask: [[7, 7]] },
        { say: '쌍삼! 삼이 두 개예요. 상대는 한 번에 하나만 막을 수 있어요.', move: [7, 7], who: X, expect: SKILL.DOUBLE_THREE },
        { say: '상대가 가로를 막았어요. 그럼 세로로…', move: [7, 8], who: O },
        { say: '뚫린 사! 이제 못 막아요.', move: [8, 7], who: X, expect: SKILL.OPEN_FOUR },
        { say: '한쪽을 막아도…', move: [4, 7], who: O },
        { say: '다섯! 쌍삼을 만들면 이렇게 이겨요.', move: [9, 7], who: X, expect: SKILL.FIVE },
      ],
    },
    puzzle: {
      kind: 'attack',
      skill: SKILL.DOUBLE_THREE,
      finish: true,
      prompt: '한 수로 쌍삼을 만들고, 끝까지 이겨 보세요',
      templates: [
        [
          '.....',
          '...X.',
          '...X.',
          '.XX..',
          '.....',
        ],
        [
          '.......',
          '.X.....',
          '..X....',
          '....XX.',
          '.......',
        ],
        [
          '.......',
          '...X...',
          '.XX....',
          '...X...',
          '.......',
        ],
      ],
    },
    practice: { level: LEVEL.NORMAL },
  },
  {
    id: 'four-three',
    title: '사삼',
    code: '4-3',
    subtitle: '사부터 막는 사이에',
    skill: SKILL.FOUR_THREE,
    intro: '한 수로 사와 삼을 같이 만들면 "사삼"이에요. 상대는 사부터 막아야 해서 삼이 그대로 남아요.',
    demo: {
      stones: { X: [[7, 4], [7, 5], [7, 6], [5, 7], [6, 7]], O: [[7, 3], [5, 5], [9, 9]] },
      steps: [
        { say: '가로는 한쪽이 막힌 삼, 세로는 둘이에요.', focus: [[7, 4], [7, 6]] },
        { say: '여기에 놓으면 무엇이 생길까요?', ask: [[7, 7]] },
        { say: '사삼! 사 하나와 삼 하나. 상대는 사부터 막아야 해요.', move: [7, 7], who: X, expect: SKILL.FOUR_THREE },
        { say: '사를 막는 사이에…', move: [7, 8], who: O },
        { say: '삼이 뚫린 사가 됐어요. 못 막아요!', move: [8, 7], who: X, expect: SKILL.OPEN_FOUR },
        { say: '한쪽을 막아도…', move: [4, 7], who: O },
        { say: '다섯!', move: [9, 7], who: X, expect: SKILL.FIVE },
      ],
    },
    puzzle: {
      kind: 'attack',
      skill: SKILL.FOUR_THREE,
      finish: true,
      prompt: '한 수로 사삼을 만들고, 끝까지 이겨 보세요',
      templates: [
        [
          '.......',
          '....X..',
          '....X..',
          'OXXX...',
          '.......',
        ],
        [
          '.......',
          '...X...',
          '...X...',
          'OXX.X..',
          '.......',
        ],
      ],
    },
    practice: { level: LEVEL.NORMAL },
  },
  {
    id: 'double-four',
    title: '사사',
    code: '4-4',
    subtitle: '사가 두 개',
    skill: SKILL.DOUBLE_FOUR,
    intro: '한 수로 사를 두 개 만들면 "사사"예요. 상대는 하나밖에 못 막으니 다음 수에 다섯이에요.',
    demo: {
      stones: { X: [[7, 4], [7, 5], [7, 6], [4, 7], [5, 7], [6, 7]], O: [[7, 3], [3, 7], [9, 9], [5, 5]] },
      steps: [
        { say: '가로도 한쪽이 막힌 삼, 세로도 한쪽이 막힌 삼이에요. 둘이 만나는 곳은?', ask: [[7, 7]] },
        { say: '사사! 사가 두 개예요. 상대는 하나밖에 못 막아요.', move: [7, 7], who: X, expect: SKILL.DOUBLE_FOUR },
        { say: '가로를 막으면…', move: [7, 8], who: O },
        { say: '세로로 다섯!', move: [8, 7], who: X, expect: SKILL.FIVE },
      ],
    },
    puzzle: {
      kind: 'attack',
      skill: SKILL.DOUBLE_FOUR,
      finish: true,
      prompt: '한 수로 사사를 만들고, 끝까지 이겨 보세요',
      templates: [
        [
          '...O...',
          '...X...',
          '...X...',
          '...X...',
          'OXX.X..',
          '.......',
        ],
        [
          '....O..',
          '....X..',
          '....X..',
          '....X..',
          'OXXX...',
          '.......',
        ],
      ],
    },
    practice: { level: LEVEL.NORMAL },
  },
  {
    id: 'vcf',
    title: '사로 몰아가기',
    subtitle: '사, 또 사, 그리고 사삼',
    skill: SKILL.FOUR,
    intro: '지금 당장 쌍삼이나 사삼이 없어도, 사를 만들면 상대는 막을 수밖에 없어요. 그렇게 끌고 가다가 사삼을 만들어요.',
    demo: {
      stones: { X: [[7, 4], [7, 5], [7, 6], [10, 7], [8, 8], [8, 9], [8, 10]], O: [[7, 3], [8, 11], [5, 5]] },
      steps: [
        { say: '지금은 쌍삼도 사삼도 없어요. 하지만 사를 만들면 상대는 꼭 막아야 하죠?', focus: [[7, 4], [7, 6]] },
        { say: '사! 상대는 막을 수밖에 없어요.', move: [7, 7], who: X, expect: SKILL.FOUR },
        { say: '막았어요. 그런데 방금 놓은 검은 돌이 세로줄의 첫 돌이 됐어요.', move: [7, 8], who: O },
        { say: '또 사! 이번엔 세로로 띈삼도 같이 생겨서 사삼이에요.', move: [8, 7], who: X, expect: SKILL.FOUR_THREE },
        { say: '사를 막는 동안…', move: [8, 6], who: O },
        { say: '뚫린 사! 이제 못 막아요.', move: [9, 7], who: X, expect: SKILL.OPEN_FOUR },
        { say: '한쪽을 막아도…', move: [6, 7], who: O },
        { say: '다섯! 사를 이어서 만들면 상대는 끌려다니다가 져요.', move: [11, 7], who: X, expect: SKILL.FIVE },
      ],
    },
    puzzle: {
      kind: 'vcf',
      depth: VCF_LESSON_DEPTH,
      prompt: '사를 이어서 만들어 끝까지 이겨 보세요',
      templates: [
        [
          '...........',
          '.OXXX......',
          '......XXXO.',
          '...........',
          '.....X.....',
          '...........',
        ],
      ],
    },
    practice: { level: LEVEL.HARD },
  },
  {
    id: 'prevent',
    title: '미리 막기',
    subtitle: '상대의 쌍삼 자리를 먼저',
    skill: SKILL.DOUBLE_THREE,
    intro: '상대도 쌍삼을 노려요. 상대 돌이 둘, 둘로 만나려는 자리를 찾아 먼저 차지하면 막을 수 있어요.',
    demo: {
      stones: { O: [[7, 5], [7, 6], [5, 7], [6, 7]], X: [[4, 4], [9, 9], [8, 4]] },
      steps: [
        { say: '이번엔 내 차례예요. 흰 돌 모양을 잘 보세요. 가로 둘, 세로 둘…', focus: [[7, 5], [7, 6]] },
        { say: '흰 돌이 여기에 놓으면 쌍삼이 돼요! 놓이기 전에 내가 먼저 막아요.', ask: [[7, 7]] },
        { say: '먼저 차지했어요. 이제 흰 돌은 쌍삼을 못 만들어요.', move: [7, 7], who: X },
        { say: '옆을 막아도 돼요. 둘 중 하나만 막히면 쌍삼이 안 되니까요.', marks: [[7, 4], [4, 7]] },
      ],
    },
    puzzle: {
      kind: 'defense',
      skill: [SKILL.DOUBLE_THREE, SKILL.FOUR_THREE, SKILL.DOUBLE_FOUR],
      prompt: '흰 돌이 쌍삼이나 사삼을 만들기 전에 막아 보세요',
      templates: [
        [
          '.....',
          '...O.',
          '...O.',
          '.OO..',
          '.....',
        ],
        [
          '.......',
          '....O..',
          '....O..',
          'XOOO...',
          '.......',
        ],
        [
          '.......',
          '.O.....',
          '..O....',
          '....OO.',
          '.......',
        ],
      ],
    },
    practice: { level: LEVEL.HARD },
  },
]);

export const lessonById = (id) => LESSONS.find((l) => l.id === id) ?? null;
