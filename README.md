# 신노부나가의 야망 AI 덱 추천 — 앱 관리 가이드

다른 PC에서도 이 앱을 수정·배포·관리하기 위한 전체 문서입니다.
(⚠️ API 키 실제 값은 이 문서에 없습니다. 키는 Vercel 환경변수에만 보관합니다.)

---

## 1. 앱 개요
- **무엇**: 모바일 게임 *신 노부나가의 야망* 장수(무장) DB + 병종별 최적 편성(덱)을 AI가 조언해주는 웹앱.
- **형태**: **단일 `index.html`** (빌드 과정 없음, 바닐라 HTML/JS). CDN으로 marked+DOMPurify+Tesseract 로드.
- **다국어**: 한/영/중 i18n, 테마 스위처, 가나다 정렬.
- **AI**: Gemini(기본) / Groq(폴백)를 **Vercel 프록시**를 통해 호출 (키 은닉).

## 2. 링크 & 계정
| 항목 | 값 |
|---|---|
| 라이브 앱 | https://ugha328.github.io/nobunaga-coach/ |
| GitHub 저장소(공개) | https://github.com/UGHA328/nobunaga-coach |
| GitHub 계정 | UGHA328 |
| 배포 방식 | GitHub Pages (main 브랜치 push 시 자동 배포, 1~2분) |
| LLM 프록시 | https://nobunaga-proxy.vercel.app/api/llm |
| Vercel 팀 / 프로젝트 | 2425-s-projects1 / nobunaga-proxy |
| Vercel CLI 로그인 계정 | pennyroyal-1970 |
| 로컬 앱 폴더 | `노부나가-장수분석/웹앱/` (= git 저장소) |
| 로컬 프록시 폴더 | `노부나가-장수분석/웹앱-vercel프록시/` |

## 3. 아키텍처 (키 은닉 구조)
```
브라우저(index.html)  --POST /api/llm-->  Vercel 프록시(api/llm.js)  --키 첨부-->  Gemini / Groq
                                            ↑ 키는 Vercel 환경변수(Secret)에만 존재
```
- `index.html`의 `PROXY_URL = "https://nobunaga-proxy.vercel.app/api/llm"` 로 프록시만 호출.
- `PROVIDERS = []` (앱 코드·깃허브에 **키 없음**).
- 프록시가 환경변수 `GEMINI_KEY_1/2`, `GROQ_KEY_1/2` 를 읽어 대신 요청.

## 4. 새 PC에서 관리 세팅
1. **설치**: Git, Node.js(18+), GitHub CLI(`gh`), Vercel CLI(`npm i -g vercel`)
2. **GitHub 인증**: `gh auth login` (계정 UGHA328)
3. **클론**: `git clone https://github.com/UGHA328/nobunaga-coach.git`
   - 이 저장소 = 앱(`index.html`). 클론한 폴더가 곧 작업 폴더.
4. **프록시 관리하려면**(선택): `vercel login` 후 프록시 폴더에서 `vercel link --project nobunaga-proxy`

## 5. 앱 수정 → 배포 워크플로
1. `index.html` 편집
2. **문법 검증**(권장): 인라인 `<script>` 추출 후 `node --check`
3. **로컬 미리보기**: 폴더에서 `python -m http.server 8123` → http://localhost:8123/index.html
   - (file:// 직접 열기는 CORS 때문에 프록시 호출 안 됨. 반드시 localhost 사용)
4. **배포**: `git add index.html && git commit -m "..." && git push origin main`
   → GitHub Pages 자동 배포 (1~2분 후 라이브 반영, Ctrl+F5 새로고침)

## 6. 데이터 구조 (장수 DB)
`index.html` 안 `const BASE_G = [ ... ]` 배열. 현재 **66명**. 장수 객체 필드:

| 필드 | 설명 |
|---|---|
| `번호` | 고유 번호 |
| `이름` | 장수명 |
| `역할` | `주장` 또는 `부장` |
| `특성` | `무용`/`지략`/`통재` |
| `병종` | 주장이면 `기병`/`총포`/`창병`/`닌자`, **부장이면 빈 문자열 `""`** |
| `통솔`/`무용`/`지략`/`속도`/`정치` | 능력치(숫자) |
| `스킬` / `스킬효과` | 스킬명 / 효과 요약 |
| `무기` / `무기효과` | 전용무기명(없으면 `"없음"`) / 효과 |
| `스킨` / `스킨효과` | (선택) 무장스킨명 / 강화판 효과. 없으면 필드 생략 |
| `전보` | (선택) 실전 관측 메모 |

- **스킨 보유/미보유**·**전무 보유/미보유**는 데이터가 아니라 편성 화면의 체크박스(플레이어별 상태, `localStorage`)로 관리됨.
- 편성 상태 저장 키: `nob_legions`(부대+own+skinOwn), `nob_model`(선택 모델), `nob_userdb`(스샷으로 추가한 장수).

## 7. 장수 추가 방법
**A. 영구 추가(권장)** — 저장소에 반영:
- `BASE_G` 배열 끝에 새 객체 추가(위 필드 형식) → commit/push.
- 스킨 있으면 `스킨`/`스킨효과` 필드 포함.

**B. 앱에서 임시 추가** — 그 브라우저에만 저장:
- 앱 하단 "장수 추가 등록"에서 스크린샷(①기본 ②스킬 ③전무) 업로드 → AI가 추출해 `localStorage`(userDB)에 저장. (저장소엔 반영 안 됨 → 영구화하려면 A 방식으로 코드에 넣기)

## 8. 모델 설정 & 무료 한도
- 기본 모델: **`gemini-3.1-flash-lite`** (무료 한도 최대: 15 RPM / 250K TPM / **500 RPD**)
- 드롭다운: 3.1 Flash-Lite(추천) / 3.5 Flash(더 정밀·**하루 20건 제한**) / Groq(폴백)
- ⚠️ 다른 Gemini 모델은 하루 20건뿐 → 앱은 3.1 Flash-Lite로 고정. (모델 선택 저장 마이그레이션 키: `nob_mig4`)
- 계정별 실제 한도 확인: https://aistudio.google.com/rate-limit

## 9. 프록시 관리 (Vercel)
- 코드: `웹앱-vercel프록시/api/llm.js` (+ `vercel.json`, `package.json{type:module}`)
- **키 변경/추가**: Vercel 대시보드 → 프로젝트 nobunaga-proxy → Settings → Environment Variables
  → https://vercel.com/2425-s-projects1/nobunaga-proxy/settings/environment-variables
  → 값 수정 후 **Redeploy** 필수 (env는 재배포해야 반영)
- **프록시 코드 수정 후 배포**: 프록시 폴더에서 `vercel deploy --prod --yes`
- CORS 허용 출처: `api/llm.js`의 `ALLOW` 배열(앱 URL이 바뀌면 여기에 추가)
- 환경변수 이름(값 아님): `GEMINI_KEY_1`, `GEMINI_KEY_2`, `GROQ_KEY_1`, `GROQ_KEY_2`

## 10. 보안 수칙
- **API 키는 절대 코드/깃허브/채팅/문서에 넣지 않는다.** 오직 Vercel 환경변수에만.
- 과거 커밋 히스토리에 노출된 적 있는 키는 **폐기(revoke) 후 재발급** → Vercel env만 교체.
- Gemini 키는 **결제(Billing) 미연결 무료 프로젝트** 사용(노출 시 과금 방지).

## 11. 주요 게임 도메인 지식(앱 규칙에 반영됨)
- **병종 상성(순환)**: 🐎기병→🥷닌자→🔫총포→🗡️창병→🐎기병 (다음을 카운터, 유리 시 약 20%). 기병↔총포·닌자↔창병 중립.
- **승패 요소 3층**: ①구성(상성·조합) ②세팅질(특성/전술/매/전무/스킨) ③육성량(성급·레벨·강화). 상성 걸리면 ①이 압도, 미러전은 ②·③(성급 등)이 결정.
- **매/방응술**: 지략딜 군단(닌자·총포)→도야마 갈우매(호시탐탐), 무용딜(기병)→오토하 화운매.
- **무장스킨**: 보유 시 기본스킬이 강화판으로 교체 + 능력치↑ (플레이어별 보유/미보유).

---
*이 문서는 앱과 함께 저장소(`웹앱/README.md`)에 있으며, 노션에도 업로드됨. 앱 변경 시 이 문서도 갱신 권장.*
