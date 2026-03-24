# OpenDataLoader PDF -> parse CLI 통합 PoC

작성일: 2026-03-22

참고 소스:
- 공식 저장소: https://github.com/opendataloader-project/opendataloader-pdf
- 공식 README 기준 설치/모드: fast, hybrid(docling-fast), OCR, table/layout claims

## 평가 질문

`OpenDataLoader PDF`를 현재 `parse` CLI의 PDF 경로에 붙일 수 있는가?

## 반증 조건 먼저

다음 중 하나라도 충족하면 "지금 바로 기본 교체"는 기각한다.

1. `fast` 모드가 스캔/이미지형 PDF에서 본문 텍스트를 구조화하지 못한다.
2. `hybrid` 모드가 현재 개발 환경에서 재현되지 않는다.
3. 기존 `hyocr` 대비 품질 이점이 있어도, 재현 시간/안정성이 실사용 임계치를 넘는다.

## 실험 입력

1. 스캔/이미지형 행정 문서
   - `/Users/kwak/Company/25-99.인사이트플로/인사이트플로-사업자등록증.pdf`
2. 디지털 보고서형 문서
   - `/Users/kwak/Downloads/vibelabs_20260317_weekly_summary.pdf`

## 실험 결과

### 1. OpenDataLoader fast 모드

#### 1-a. 사업자등록증 PDF

명령:

```bash
opendataloader-pdf '/Users/kwak/Company/25-99.인사이트플로/인사이트플로-사업자등록증.pdf' \
  --output-dir /Users/kwak/Projects/ai/tmp/opendataloader-poc/odl-brn \
  --format json,markdown
```

관찰:
- 실행 시간: `2.96s`
- JSON 출력: `1462 bytes`
- top-level `kids`: `6`
- 추출 타입: 전부 `image`
- Markdown 출력: 이미지 6개 참조만 생성, 본문 텍스트 없음

판정:
- 반증 조건 1 충족
- `fast` 모드는 스캔/이미지형 증명서에서 현재 `hyocr` 대체 불가

근거 파일:
- `/Users/kwak/Projects/ai/tmp/opendataloader-poc/odl-brn/인사이트플로-사업자등록증.json`
- `/Users/kwak/Projects/ai/tmp/opendataloader-poc/odl-brn/인사이트플로-사업자등록증.md`

#### 1-b. 주간 요약 PDF

명령:

```bash
opendataloader-pdf '/Users/kwak/Downloads/vibelabs_20260317_weekly_summary.pdf' \
  --output-dir /Users/kwak/Projects/ai/tmp/opendataloader-poc/odl-report \
  --format json,markdown \
  --pages 1-2
```

관찰:
- 실행 시간: `2.92s`
- headings / paragraph / table / table cell / image를 모두 구조화
- 카운트:
  - `heading: 6`
  - `paragraph: 46`
  - `table: 2`
  - `table row: 11`
  - `table cell: 43`
  - `image: 2`
- Markdown 결과는 제목, 날짜, KPI 표, 일자별 요약 표를 유지
- bbox가 포함된 JSON이 생성되어 후속 citation/RAG에 유리

판정:
- 디지털 텍스트 기반 PDF에는 강점이 분명함
- `parse`의 "디지털 PDF 빠른 경로" 후보로는 유효

근거 파일:
- `/Users/kwak/Projects/ai/tmp/opendataloader-poc/odl-report/vibelabs_20260317_weekly_summary.json`
- `/Users/kwak/Projects/ai/tmp/opendataloader-poc/odl-report/vibelabs_20260317_weekly_summary.md`

### 2. OpenDataLoader hybrid 모드

설치:

```bash
python3 -m pip install -U 'opendataloader-pdf[hybrid]'
```

관찰:
- hybrid 확장 설치는 되었으나, 현재 pyenv Python `3.11.6`이 `_lzma` 모듈 없이 빌드되어 있음
- `opendataloader-pdf-hybrid --force-ocr` 기동 시 `docling` 초기화 단계에서 실패
- 서버 미기동 상태에서 Java client는 `http://127.0.0.1:5002` 연결 실패
- 설치 중 전역 Python에 `numpy 2.4.3`가 들어오며 `pykrx`와 충돌 경고가 발생

대표 실패 신호:
- `ModuleNotFoundError: No module named '_lzma'`
- `ModuleNotFoundError: Could not import module 'AutoProcessor'`
- Java 측 `Hybrid server is not available at http://127.0.0.1:5002`

판정:
- 반증 조건 2 충족
- 현재 환경에서는 hybrid를 "즉시 채택 가능한 운영 경로"로 볼 수 없음
- 단, 이는 OpenDataLoader 자체의 기능 부정이 아니라 현재 Python 런타임/의존성 조합 문제로 해석하는 것이 타당

### 3. hyocr 재현성 체크

명령:

```bash
python3 -m hyocr.cli run '/Users/kwak/Company/25-99.인사이트플로/인사이트플로-사업자등록증.pdf' \
  --format json \
  --out /Users/kwak/Projects/ai/tmp/opendataloader-poc/hyocr-brn.json
```

관찰:
- 동일 1페이지 입력에서 `129.52s` 후 실패
- 실패 지점: `parse_with_glmocr_sdk.sh` -> `glmocr parse ...` non-zero exit
- 다만 오늘 새벽 생성된 기존 산출물은 남아 있으며, 해당 결과는 사업자등록증 본문/필드 OCR을 실제로 포함

기존 결과 파일:
- `/Users/kwak/Projects/ocr-hybrid-mvp/output/glmocr/인사이트플로-사업자등록증/인사이트플로-사업자등록증.json`
- `/Users/kwak/Projects/ocr-hybrid-mvp/output/glmocr/인사이트플로-사업자등록증/merged-bizcert.json`
- `/Users/kwak/Projects/ocr-hybrid-mvp/output/glmocr/인사이트플로-사업자등록증/merged-bizcert.md`

판정:
- 반증 조건 3 일부 충족
- 현재 `hyocr`는 품질 잠재력은 있으나, 재현 시간과 안정성이 약함

## 살아남은 결론

1. `OpenDataLoader fast`는 디지털 텍스트 PDF의 기본 경로 후보로 살아남음
2. 스캔/이미지형 PDF는 `OpenDataLoader fast` 단독으로는 기각
3. `OpenDataLoader hybrid`는 환경 분리(별도 venv 또는 system Python) 없이는 현재 머신에서 즉시 도입 불가
4. 따라서 `parse` 통합 전략은 "교체"가 아니라 "선택적 adapter 추가"가 맞음

## parse CLI 통합 제안

### 제안 아키텍처

`parse document.pdf`

- 1단계: PDF 특성 감지
  - 선택 텍스트 충분 -> `opendataloader-fast`
  - 스캔/이미지 위주 -> 기존 `hyocr` 또는 추후 `opendataloader-hybrid`
- 2단계: 실패/헬스체크 기반 fallback
  - hybrid health check 실패 시 fast 또는 hyocr로 즉시 우회

### 최소 옵션 제안

```text
parse report.pdf --pdf-engine odl-fast
parse form.pdf --pdf-engine hyocr
parse doc.pdf --pdf-engine auto
```

### auto 라우팅 초안

- `odl-fast`
  - 장점: 빠름, 구조화 JSON+bbox, heading/table 보존
  - 대상: 디지털 보고서, 일반 텍스트 PDF
- `hyocr`
  - 장점: 이미지형 문서 OCR 경험치가 있음
  - 대상: 스캔형 증명서, OCR 중심 문서
- `odl-hybrid`
  - 조건부: 별도 격리 환경에서 health check 통과 시에만 활성화

## PoC 코드

개발 핸드오프용 최소 래퍼:

- `/Users/kwak/Projects/ai/scripts/odl_pdf_poc.py`

이 스크립트는:
- `opendataloader-pdf` CLI 실행
- 소요 시간 기록
- JSON/Markdown 산출물 요약
- type count와 preview를 summary JSON으로 저장

## 권고

1. main `scripts/parse`는 지금 바로 교체하지 말 것
2. 먼저 `odl-fast`를 옵션형 adapter로 붙일 것
3. `odl-hybrid`는 system Python 기반 별도 venv에서 다시 검증할 것
4. `hyocr`는 현재 실패 원인(`glmocr parse` non-zero)을 별도 안정화 이슈로 분리할 것

## 최종 판단

`OpenDataLoader PDF`는 "디지털 PDF 구조화 parser"로는 채택 가치가 높다.

하지만 2026-03-22 현재 이 워크스테이션 기준으로는:
- 스캔형 PDF 대응은 `fast`만으로 부족하고
- `hybrid`는 환경 문제로 미재현이며
- 기존 `hyocr`도 재현성이 흔들린다.

따라서 살아남은 전략은:

`parse`에 `odl-fast`를 선택형 PDF adapter로 추가하고, `odl-hybrid`는 격리 환경에서 재검증 후 승격한다.
