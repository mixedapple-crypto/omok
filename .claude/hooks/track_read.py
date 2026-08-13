"""forge 훅: track_read.py — PreToolUse(Read) 관찰자: 증거 Read 기록.

[용도·등록]
Read 도구가 증거 파일(스크린샷·콘솔 캡처·실행 결과·로그)을 읽을 때마다
"{ISO시각}\t{경로}" 한 줄을 {cwd}/.claude/.evidence-reads 원장에 append 한다.
verify_gate.py가 이 원장을 소비해 "증거 없이 결과 기록 금지"를 강제한다 —
반드시 verify_gate.py와 짝으로 대상 프로젝트 .claude/hooks/ 에 복사·등록한다.
.claude/settings.json 등록 예:
    {"hooks": {"PreToolUse": [{"matcher": "Read",
      "hooks": [{"type": "command", "command": "python .claude/hooks/track_read.py"}]}]}}
등록 명령 정본: enforcement-hooks.md §4.

[파라미터]
- FORGE_EVIDENCE_PATTERNS: 세미콜론 구분 glob 목록. 경로는 구분자를 '/'로 정규화한
  절대 경로로 매칭한다. 기본값은 아래 DEFAULT_PATTERNS.

[알려진 우회로와 한계 — 데모 등급]
- 경로 문자열 매칭일 뿐 내용 검증이 없다 — 빈 .png, 옛 스크린샷을 Read해도 증거로
  적립된다(신선도/mtime 검사 없음). 기준별 증거 매핑은 프로덕션 등급 과제.
- Read 도구만 관찰한다 — Bash(type/cat)로 읽은 것은 적립되지 않는다(의도: Read 유도).
- 패턴에 안 걸리는 새로운 증거 유형은 FORGE_EVIDENCE_PATTERNS 확장 전까지 무시된다.

[파싱 실패 시] 관찰자류: 조용히 exit 0 — 어떤 경우에도 Read를 깨지 않는다.
기록 유실 가능성은 감수한다(관찰 실패가 작업 실패보다 낫다).
"""
import fnmatch
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# 기본 증거 패턴: "실행·관찰의 부산물" 파일만 좁게 지정한다 —
# 소스 코드 Read가 증거로 오인 적립되면 게이트가 무의미해지기 때문.
DEFAULT_PATTERNS = "*screenshots/*;*-console.txt;*-result.txt;*.png;*-log.txt"

# 원장 위치: verify_gate.py와 공유하는 계약 경로 — 두 파일에서 반드시 동일해야 한다.
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
        if not file_path:
            return 0

        # 페이로드의 cwd를 우선한다 — 훅 프로세스의 실제 cwd는 보장이 약하다.
        cwd = Path(payload.get("cwd") or Path.cwd())
        target = Path(file_path)
        if not target.is_absolute():
            target = cwd / target

        # 구분자 '/' 정규화 — 사용자 패턴이 Windows '\\'와 무관하게 동작하도록.
        norm = str(target).replace("\\", "/")
        raw = os.environ.get("FORGE_EVIDENCE_PATTERNS", DEFAULT_PATTERNS)
        patterns = [p.strip() for p in raw.split(";") if p.strip()]
        if not any(fnmatch.fnmatch(norm, pat) for pat in patterns):
            return 0

        # 실존 파일만 적립 — 존재하지 않는 경로 Read(실패할 Read)로 증거를 만들 수 없게.
        if not target.is_file():
            return 0

        ledger = cwd / LEDGER_RELPATH
        ledger.parent.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().astimezone().isoformat(timespec="seconds")
        with ledger.open("a", encoding="utf-8") as f:
            f.write(f"{stamp}\t{norm}\n")
    except Exception:
        # 관찰자는 어떤 실패에서도 조용히 통과한다 — Read를 깨면 안 된다.
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
