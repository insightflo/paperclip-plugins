# OpenDataLoader hybrid 격리 검증과 auto 기준 수립

작성일: 2026-03-23
대상 이슈: `AID-165`

## 평가 질문

1. `odl-hybrid`는 현재 머신에서 재현 가능한가?
2. 가능하다면 어떤 환경 조건이 최소 조건인가?
3. 향후 `auto` 라우팅에 넣을 최소 PDF 신호는 무엇인가?
4. 현재 `hyocr`의 `glmocr parse` 실패는 어떤 조건에서 재현되는가?

## 반증 조건 먼저

다음 중 하나라도 성립하면 "`odl-hybrid`를 곧바로 로컬 표준 경로로 본다"는 결론을 기각한다.

1. 현재 기본 Python 런타임에서 `odl-hybrid` 서버가 기동되지 않는다.
2. system Python 또는 별도 venv 중 하나에서도 현재 주력 버전(`opendataloader-pdf 2.0.2`)을 재현하지 못한다.
3. `auto` 분기에 쓸 신호가 이미지 수 같은 약한 힌트뿐이라 오탐 위험이 크다.
4. `hyocr` 실패가 입력 특성이 아니라 외부 백엔드 가용성 문제라면, 기존 기본 경로를 신뢰 가능한 자동 기준으로 보기 어렵다.

## 실험 입력

1. 스캔/이미지형 행정 문서
   - `/Users/kwak/Company/25-99.인사이트플로/인사이트플로-사업자등록증.pdf`
2. 디지털 텍스트형 보고서
   - `/Users/kwak/Downloads/vibelabs_20260317_weekly_summary.pdf`

## 실험 환경

### A. 현재 pyenv Python

- 실행 파일: `/Users/kwak/.pyenv/versions/3.11.6/bin/python3`
- 버전: `3.11.6`
- 검사 결과: `lzma=True`, `_lzma=False`
- 설치 패키지:
  - `opendataloader-pdf 2.0.2`
  - `docling 2.81.0`
  - `transformers 4.57.3`
  - `torchvision 0.25.0`

### B. system Python

- 실행 파일: `/Applications/Xcode.app/Contents/Developer/usr/bin/python3`
- 버전: `3.9.6`
- 검사 결과: `lzma=True`, `_lzma=True`
- 단, 현재 주력 패키지 메타데이터:
  - `opendataloader-pdf 2.0.2` -> `Requires-Python >=3.10`
  - `docling 2.81.0` -> `Requires-Python >=3.10`

### C. 격리 venv 1: system Python 3.9

- 경로: `/Users/kwak/Projects/ai/tmp/aid-165-odl-hybrid-venv-1774192625`
- 설치 결과:
  - `opendataloader-pdf 1.8.1`
  - `docling 2.69.1`
- 해석:
  - 설치 자체는 가능하지만, 이것은 현재 주력 조합 `2.0.2 + 2.81.0` 재현이 아니다.
  - 즉 system Python은 "현재 버전 검증용"이 아니라 "구버전 우회 경로"에 가깝다.

### D. 격리 venv 2: uv CPython 3.11

- 생성 경로: `/Users/kwak/Projects/ai/tmp/aid-165-uv311-venv`
- 런타임: `3.11.15`
- 검사 결과: `lzma=True`, `_lzma=True`
- 설치 결과:
  - `opendataloader-pdf 2.0.2`
  - `docling 2.81.0`

## 관찰

### 1. pyenv 3.11.6에서는 `odl-hybrid`가 즉시 실패

명령:

```bash
opendataloader-pdf-hybrid --force-ocr --log-level debug
```

대표 실패 신호:

- `ModuleNotFoundError: No module named '_lzma'`
- `ModuleNotFoundError: Could not import module 'AutoProcessor'`

해석:

- 직접 원인은 pyenv 빌드에 `_lzma`가 없는 점이다.
- `docling -> transformers -> torchvision -> lzma` import 경로에서 무너진다.
- 따라서 "현재 기본 pyenv"는 `odl-hybrid`의 유효 런타임이 아니다.

### 2. system Python 3.9는 현재 주력 버전 재현 환경이 아니다

관찰:

- system Python은 `_lzma`가 살아 있다.
- 하지만 `opendataloader-pdf 2.0.2`, `docling 2.81.0` 모두 `>=3.10`을 요구한다.
- 실제 설치 시 system venv에는 `opendataloader-pdf 1.8.1`, `docling 2.69.1`로 내려간다.

해석:

- "system Python에서 된다"는 말은 현재 버전 기준으로는 참이 아니다.
- 정확한 표현은 "system Python 3.9에서는 구버전 조합만 우회 설치 가능"이다.

### 3. uv 기반 3.11 격리 venv에서는 `odl-hybrid 2.0.2`가 살아남음

명령:

```bash
uv python install 3.11
uv venv /Users/kwak/Projects/ai/tmp/aid-165-uv311-venv --python 3.11
uv pip install --python /Users/kwak/Projects/ai/tmp/aid-165-uv311-venv/bin/python 'opendataloader-pdf[hybrid]==2.0.2'
```

서버 기동 결과:

- `Initializing DocumentConverter ...`
- `DocumentConverter initialized in 33.27s`
- `Application startup complete`
- `Uvicorn running on http://0.0.0.0:5002`

health check:

```bash
curl -s http://127.0.0.1:5002/health
```

응답:

```json
{"status":"ok"}
```

해석:

- `odl-hybrid` 자체가 깨진 것은 아니다.
- 현재 머신에서도 "`_lzma`가 있는 3.10+ 격리 Python"에서는 재현 가능하다.
- 따라서 기존 결론은 "하이브리드 자체 기각"이 아니라 "현재 기본 pyenv 경로 기각"으로 정정되어야 한다.

### 4. `hyocr` 실패는 PDF 렌더가 아니라 GLM 백엔드 부재 조건에서 재현

관련 구조:

- `hyocr`는 PDF를 직접 GLM에 넘기지 않는다.
- `hyocr/pipeline.py`가 먼저 PDF를 이미지로 렌더링한다.
- 이후 `hyocr/adapters/glm.py`가 `scripts/parse_with_glmocr_sdk.sh`를 호출한다.
- 이 스크립트는 `.venv-sdk`를 활성화한 뒤 `glmocr parse ... --config configs/glmocr-mlx-local.yaml`를 실행한다.
- 해당 config는 `127.0.0.1:8080/chat/completions`를 사용한다.

재현 관찰:

- `python3 -m hyocr.cli doctor` 기준:
  - `glm_cmd` configured
  - `.venv-sdk`, `.venv-mlx` 존재
  - `pdftoppm` 존재
  - 그러나 `ollama`는 PATH에 없음
- `lsof -nPiTCP:8080 -sTCP:LISTEN` 결과: 비어 있음
- 렌더된 1페이지 PNG에 대해 아래 명령을 실행하면 75초 이상 대기:

```bash
/Users/kwak/Projects/ocr-hybrid-mvp/.venv-sdk/bin/glmocr parse \
  /Users/kwak/Projects/ai/tmp/aid-165-bizcert-page1.png \
  --config /Users/kwak/Projects/ocr-hybrid-mvp/configs/glmocr-mlx-local.yaml \
  --output /Users/kwak/Projects/ai/tmp/aid-165-glm-out \
  --log-level DEBUG
```

로그:

- `Connecting to remote API server at http://127.0.0.1:8080/chat/completions...`
- `Waiting for API server to be available... (0s elapsed)`
- `...`
- `Waiting for API server to be available... (70s elapsed)`

해석:

- 현재 `hyocr` 실패 조건은 "PDF라서"가 아니라 "GLM SDK가 요구하는 로컬 MLX 서버가 떠 있지 않음"이다.
- `start_mlx_server.sh`는 아래 서버를 전제로 한다.

```bash
mlx_vlm.server --trust-remote-code --port 8080
```

즉 `hyocr` 기본 경로는 지금도 외부 로컬 서버 가용성에 의해 흔들린다.

## `auto` 라우팅용 최소 신호 집합

이미지 수만으로는 부족하다. 디지털 보고서도 작은 이미지가 많다. 이번 두 샘플에서 분기를 가른 것은 아래 세 신호였다.

1. 첫 1-2페이지 `extract_text()` 문자 수
2. 첫 1-2페이지 폰트 존재 여부
3. 첫 페이지가 사실상 이미지 덩어리인지 여부

### 샘플 비교

#### 사업자등록증 PDF

- `pypdf` 첫 페이지 문자 수: `0`
- `pdffonts`: `0개`
- `pdfimages -list`: 첫 페이지 이미지 `6개`
- 성격: 이미지형 스캔 문서

#### 주간 요약 PDF

- `pypdf` 문자 수:
  - 1p `134`
  - 2p `596`
  - 3p `1542`
- `pdffonts`: 다수 존재
- `pdfimages -list`: 작은 아이콘/썸네일 많음
- 성격: 디지털 텍스트 PDF

### 제안 기준

#### `odl-fast`

아래 둘 중 하나라도 만족하면 우선 후보로 본다.

1. 첫 2페이지 문자 수 합계 `>= 150`
2. 첫 2페이지 중 하나라도 문자 수 `>= 80` 이고 폰트가 존재

#### `hyocr` 또는 추후 `odl-hybrid`

아래를 모두 만족하면 OCR 계열 후보로 본다.

1. 첫 페이지 문자 수 `== 0`
2. 폰트가 `0개`
3. 첫 페이지에 이미지 객체가 존재

#### `uncertain`

아래는 자동 분기하지 않고 기본 경로나 명시 선택을 유지한다.

1. 문자 수가 낮지만 0은 아님
2. 폰트는 있으나 추출 텍스트가 거의 없음
3. 암호화/깨진 PDF처럼 `extract_text()` 경고가 많은 경우

## 제안 health check

`odl-hybrid`를 future `auto` 후보로 다루려면 아래 순서를 먼저 통과해야 한다.

1. Python runtime check

```bash
python -c 'import importlib.util; print(importlib.util.find_spec("_lzma") is not None)'
```

기대값: `True`

2. 버전 check

```bash
python -c 'import importlib.metadata as md; print(md.version("opendataloader-pdf"), md.version("docling"))'
```

3. hybrid server startup

```bash
opendataloader-pdf-hybrid --force-ocr --log-level info
```

4. health endpoint

```bash
curl -s http://127.0.0.1:5002/health
```

기대값:

```json
{"status":"ok"}
```

5. 선택 사항: cold start budget 기록

- 첫 기동 기준 `DocumentConverter initialized in 33.27s`
- 동일 venv 재기동 기준 `DocumentConverter initialized in 2.64s`
- 즉 `auto`에서 즉시 on-demand로 붙이기보다, 장기적으로는 pre-warm 여부를 따져야 한다.

## 살아남은 결론

1. `odl-hybrid`는 현재 머신에서 "재현 불가"가 아니다.
2. 정확한 결론은 "`_lzma`가 깨진 현재 pyenv 3.11.6 경로에서는 불가, `_lzma`가 살아 있는 3.10+ 격리 venv에서는 가능"이다.
3. system Python 3.9는 현재 주력 버전 `2.0.2` 검증 환경으로는 부적합하다.
4. `auto` 라우팅은 문자 수/폰트 유무/이미지형 여부 3신호 정도는 있어야 하며, 이미지 수 단독 분기는 기각한다.
5. 현재 `hyocr` 실패는 문서 특성보다 `127.0.0.1:8080` GLM 백엔드 부재 조건에서 재현된다.

## 권고

1. `odl-hybrid`는 "기각"이 아니라 "격리 venv 조건부 보류"로 상태를 조정할 것
2. 구현 쪽에는 `odl-hybrid`를 기본 경로에 넣지 말고, 향후 전용 3.11+ venv + health check 전제 조건으로만 다룰 것
3. `auto`는 이번 보고서의 3신호 기준을 기반으로 별도 PoC를 먼저 만든 뒤 승격할 것
4. `hyocr`는 `mlx_vlm.server` 가용성 검사를 먼저 넣지 않으면 PDF 기본 경로로서 재현성이 계속 흔들릴 것

## 근거 경로

- 보고서: `/Users/kwak/Projects/ai/reports/opendataloader-hybrid-validation-2026-03-23.md`
- 기존 PoC: `/Users/kwak/Projects/ai/reports/opendataloader-pdf-poc-2026-03-22.md`
- 사업자등록증 1페이지 PNG: `/Users/kwak/Projects/ai/tmp/aid-165-bizcert-page1.png`
- system Python venv: `/Users/kwak/Projects/ai/tmp/aid-165-odl-hybrid-venv-1774192625`
- uv 3.11 venv: `/Users/kwak/Projects/ai/tmp/aid-165-uv311-venv`
