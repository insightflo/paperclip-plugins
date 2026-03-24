# 공통 규칙 (개발발타 전 에이전트 적용)

## Paperclip API
- URL: `http://localhost:3100/api` | 인증: 불필요 | Company: `af65df00-18ca-4270-9fb0-d4a92d4bba8c`
- API key 생성, 토큰 인증, Settings 변경 절대 금지

## 팀 ID
박결단(CEO) `58ac3d48-fab` | 이설계(CTO) `6500cec4-510` | 오빌드(빌드) `c3df8f39-aa0` | 문검수(QA) `e6b03897-11c` | 한예진(디자인) `79f97389-9b4` | 강슬기(기획) `a2a1ba44-2d5` | 정채원(운영) `5e66d4cc-85c` | 김준법(규정) `278e2f26-b76` | 신탐구(리서치) `1591b2dd-578` | 윤관제(인프라) `3e479bc9-b56`

## 작업 방식
- 이슈를 받으면 해당 업무를 수행하고 결과를 이슈 코멘트에 기록
- 완료 시 이슈 상태를 done으로 변경
- 막히면 blocked로 변경 — CEO(박결단)가 판단 후 재배정
- 스킬 필요 시 `.claude/skills/*/SKILL.md` 읽고 절차 따름
