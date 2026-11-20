# 기여하기 · Contributing

## 작업 경계 · Scope
- 변환은 **브라우저 안에서만** 실행합니다. 서버 함수, 분석 추적, 폰트 업로드, 외부 CDN, 계정이나 API 키를 추가하지 않습니다. / Conversion runs entirely in the browser. Do not add functions, analytics, uploads, CDNs, accounts, or API keys.
- 운영 배포는 Cloudflare Pages Git 연동과 `main`만 사용합니다. GitHub Actions가 금지되어 있으므로 다른 경로의 CI를 임의로 추가하지 않습니다. / Cloudflare Pages deploys only `main`; do not add GitHub Actions.
- 파일 형식·지원 범위·손실 여부는 항상 화면과 문서에 같이 반영합니다. / Keep UI and docs accurate about formats, limitations, and fidelity.

## 변경 절차 · Workflow
1. 기능 브랜치를 만들고 실패 시험부터 작성합니다. / Create a topic branch and start with a regression test.
2. 동작 단위로 작게 커밋하고, 설치 스크립트나 잠금 파일에 불필요한 차이가 없는지 확인합니다. / Keep commits small and inspect any manifest or lockfile changes.
3. `npm ci --ignore-scripts`, `npm run typecheck`, `npm test`, `npm run build`를 실행합니다. 실제 폰트가 있으면 `TTF_FIXTURE` 및 `OTF_FIXTURE`를 지정합니다. / Run type checks, tests, and the build; add licensed local fixtures when available.
4. 현재 버전과 같은 파일·환경에서 실측합니다. 순수 코덱 시간과 첫 로딩, 파일 크기와 브라우저 전체 메모리를 분리합니다. / Compare identical inputs; distinguish codec time, cold load, output size, and browser memory.
5. 병합 후 Cloudflare의 `github:push` 배포 SHA와 공개 HTTPS의 `/_build.json`을 대조합니다. / Verify the exact Git-triggered commit through Cloudflare and the public build stamp.

## 코드 기준 · Code conventions
한영 주석은 코드가 이미 말해 주는 문장 대신 경계, 위험, 이유를 기록합니다. 페이지의 UI 스레드에 폰트 전체를 파싱하는 작업을 넣지 않습니다. 브라우저에 보내는 코드 크기는 주석을 없애는 것보다 번들 최적화로 줄입니다. / Bilingual comments explain invariants and trade-offs. Keep parsing off the UI thread and minimize shipped bundles without sacrificing code reviewability.
