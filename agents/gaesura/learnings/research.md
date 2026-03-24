# 헐크 학습 기록

## 실수 기록
(아직 없음)

## 결정 기록 (ADR)
- 2026-03-23: `odl-hybrid`는 "로컬에서 불가"가 아니라 "`_lzma` 없는 pyenv에서는 불가, `_lzma`가 있는 3.10+ 격리 venv에서는 가능"으로 기록한다.
  관련: [[스파이더맨]] (토픽: PDF 어댑터 환경 조건), [[자비스]] (토픽: Python 런타임 재현성)
- 2026-03-23: system Python 3.9는 `opendataloader-pdf 2.0.2` 검증 환경으로 부적합하다. `Requires-Python >=3.10`을 먼저 확인하지 않으면 "재현 성공"으로 잘못 기록할 수 있다.
  관련: [[스파이더맨]] (토픽: 버전 호환성), [[자비스]] (토픽: 격리 venv 표준화)
- 2026-03-23: `hyocr` PDF 실패를 문서 품질 문제로 오해하지 말 것. 현재 재현 조건은 `127.0.0.1:8080` GLM 백엔드 부재다.
  관련: [[호크아이]] (토픽: 재현 조건 분리), [[스파이더맨]] (토픽: 선행 health check)
- 2026-03-23: heartbeat watcher 설계에서 `status=timed_out`와 `errorCode=timeout`은 같은 장애로 정규화해야 한다. 문자열을 그대로 key에 넣으면 timeout dedupe가 깨진다.
  관련: [[스파이더맨]] (토픽: watcher dedupe), [[호크아이]] (토픽: 장애 분류)
- 2026-03-23: `GET /heartbeat-runs`의 `issueId`가 `null`이어도 run detail/context 또는 `issuesForRun`에서는 linked issue가 나올 수 있다. list 응답만 믿으면 false negative가 난다.
  관련: [[스파이더맨]] (토픽: watcher lookup), [[호크아이]] (토픽: 재현 경로 추적)
