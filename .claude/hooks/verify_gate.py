"""forge 훅: verify_gate.py — PreToolUse(Write|Edit) 게이트: 증거 없이 결과 기록 금지.

[용도·등록]
결과 파일(basename이 FORGE_RESULTS_FILE과 일치하는 파일)에 Write/Edit가 시도될 때,
track_read.py가 적립한 증거 원장({cwd}/.claude/.evidence-reads)이 없거나 비어 있으면
차단한다(exit 2 — stderr가 Claude에게 피드백으로 전달됨).
비어 있지 않으면 원장을 통째로 비우고(1회 소모) 허용한다 — 증거 적립 1회분이
결과 기록 1회를 산다. 검증 없는 결과 기록의 '반복'을 막는 default-FAIL 게이트다.
.claude/settings.json 등록 예:
    {"hooks": {"PreToolUse": [{"matcher": "Write|Edit",
      "hooks": [{"type": "command", "command": "python .claude/hooks/verify_gate.py"}]}]}}
등록 명령 정본: enforcement-hooks.md §4.
track_read.py를 함께 등록해야 한다 — 없으면 증거가 영원히 적립되지 않아
결과 파일 기록이 전부 차단된다.

[파라미터]
- FORGE_RESULTS_FILE: 게이트가 지키는 결과 파일 이름(basename). 기본 DEFAULT_RESULTS_FILE.

[알려진 우회로와 한계 — 데모 등급]
- basename 매칭이라 다른 디렉터리의 동명 파일에도 개입한다(오탐 가능). 전체 경로
  매칭·다중 결과 파일 지원은 프로덕션 등급 과제.
- Bash 우회: sed/jq/Set-Content 등으로 결과 파일을 쓰면 이 훅은 보지 못한다 —
  irreversible_gate.py의 FORGE_IRREVERSIBLE_EXTRA에 결과 파일명 정규식을 추가해 보완 가능.
- 증거가 원장(세션) 단위다: 어느 증거든 어느 결과든 해제한다 — 기준별(테스트별)
  증거 매핑은 프로덕션 등급 과제.
- 오래된 증거 파일 재Read로도 적립된다(track_read.py에 신선도 검사 없음).

[파싱 실패 시] fail-open: 허용(exit 0) + stderr 경고 — 게이트의 파싱 버그가
프로젝트의 모든 Write를 벽돌로 만들면 안 된다. 차단은 정상 파싱된 페이로드에 한한다.
"""
import json
import os
import sys
from pathlib import Path

# 기본 결과 파일 이름: forge 하네스의 결과 기록 관례 — 프로젝트별로 환경 변수로 교체.
DEFAULT_RESULTS_FILE = "test-results.json"

# 증거 원장 위치: track_read.py와 공유하는 계약 경로 — 두 파일에서 반드시 동일해야 한다.
LEDGER_RELPATH = Path(".claude") / ".evidence-reads"


def main() -> int:
    # Windows cp949 콘솔 대응 — 훅 입출력은 UTF-8 JSON/텍스트다.
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

    try:
        payload = json.load(sys.stdin)
        file_path = str(payload.get("tool_input", {}).get("file_path", "") or "")
        cwd = Path(payload.get("cwd") or Path.cwd())
    except Exception as e:
        # fail-open: 게이트 자체 결함으로 프로젝트 전체 Write를 막지 않는다.
        print(f"[verify_gate] 페이로드 파싱 실패로 fail-open 허용: {e}", file=sys.stderr)
        return 0

    if not file_path:
        return 0

    results_name = os.environ.get("FORGE_RESULTS_FILE", DEFAULT_RESULTS_FILE).strip()
    # Windows 파일 시스템은 대소문자 비구분 — 매칭도 casefold로 맞춘다.
    if Path(file_path).name.casefold() != results_name.casefold():
        return 0  # 결과 파일이 아니면 개입하지 않는다.

    ledger = cwd / LEDGER_RELPATH
    try:
        has_evidence = ledger.is_file() and ledger.read_text(encoding="utf-8").strip() != ""
    except Exception as e:
        # 원장을 읽을 수 없는 것은 게이트 인프라 결함 — fail-open.
        print(f"[verify_gate] 증거 원장 읽기 실패로 fail-open 허용: {e}", file=sys.stderr)
        return 0

    if not has_evidence:
        print(
            "증거 없이 결과 기록이 차단됨 — 스크린샷/로그/실행 결과 파일을 먼저 Read하라.\n"
            f"(대상: {file_path} / 원장: {ledger})\n"
            "테스트·실행을 수행하고 그 산출물(FORGE_EVIDENCE_PATTERNS에 매칭되는 파일)을 "
            "Read 도구로 읽으면 기록 1회가 허용된다.",
            file=sys.stderr,
        )
        return 2  # exit 2 = 차단 + stderr가 Claude에게 전달.

    try:
        # 소모: 원장을 비운다 — 증거 적립분이 결과 기록 1회를 사고 재사용은 불가.
        ledger.write_text("", encoding="utf-8")
    except Exception as e:
        print(f"[verify_gate] 원장 소모 실패(허용은 유지): {e}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
