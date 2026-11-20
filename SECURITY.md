# 보안 정책 · Security policy

## 보고 · Reporting
GitHub 보안 탭에 **Report a vulnerability**가 표시되면 비공개 보고를 사용하세요. 해당 버튼이 없으면 이슈에는 연락 방법을 문의하는 최소 정보만 남기고, 재현 파일·개인정보·상세 기술 내용은 공개하지 마세요. / Use private vulnerability reporting when the repository offers it. Otherwise ask for a private reporting channel without posting samples or details.

영향을 받은 커밋/버전, 브라우저와 OS, 필요한 최소 조건, 관측된 영향만 먼저 적어 주세요. 타인의 폰트 파일과 비밀은 필요하지 않습니다. / Initially include the affected version, browser/OS, preconditions and observed impact, not others' fonts or secrets.

## 보안 경계 · Security invariants
- 문서 스크립트는 같은 출처로 제한합니다. 실행 권한 예외는 검증된 별도 워커 응답에만 허용하며 확대하지 않습니다. / Keep the document CSP strict and constrain any codec exception to its worker.
- 사용자가 주는 이름과 오류 문구는 HTML로 해석하지 않습니다. / Treat names and messages as text, never HTML.
- 파싱과 디코딩 전에 입력·출력·테이블 개수·범위를 검사하고, 알 수 없는 압축 구조는 실패합니다. / Bound lengths and ranges before decoding; fail closed on unknown structures.
- 동시 작업 수, 제한 시간, 결과 보관 크기를 제한하고 종료 시 작업자와 Object URL을 정리합니다. / Limit work and retained results; release the worker and object URLs.
- 네트워크 요청, 원격 키, 폰트 또는 결과 파일을 지속 저장하는 기능을 추가하지 않습니다. / Do not add network conversion, credentials, or persistence of user font data.
- 배포 의존성은 정확한 버전과 잠금 파일을 사용합니다. 새 파서를 추가하면 기존 레퍼런스 구현과 결과를 비교합니다. / Pin dependencies and cross-check new codecs against a reference implementation.

[구조·부하 한계](docs/ARCHITECTURE.ko.md)
