# The Switcher · 폰트 스위쳐

TTF, OTF, WOFF 및 WOFF2를 **파일 업로드 없이 브라우저에서** 변환하는 MIT 오픈소스 웹앱입니다. Convertio 같은 파일 중계 서비스를 쓰지 않아도 웹 임베딩용과 설치용 컨테이너를 오갈 수 있도록 만들었습니다.

- [정적 웹](https://switcher.rhee.life/)
- [설계·제약·검증](docs/ARCHITECTURE.ko.md)
- [개발기와 배포](docs/DEVLOG.ko.md)
- [속도 개선의 실측·호환성 검증](docs/PERFORMANCE.ko.md)
- [진행률·오류 기록](docs/DIAGNOSTICS.ko.md)
- [다운로드·쿠키](docs/DOWNLOADS.ko.md)
- [기여](CONTRIBUTING.md) · [거버넌스](GOVERNANCE.md) · [보안](SECURITY.md)
- [개인정보처리방침](https://switcher.rhee.life/privacy) · [서비스 이용약관](https://switcher.rhee.life/terms)

## 포맷

| 입력 | 정직한 출력 |
|---|---|
| TTF (TrueType) | WOFF, WOFF2, TTF 또는 원본 |
| OTF (CFF/CFF2) | WOFF, WOFF2, OTF 또는 원본 |
| WOFF / WOFF2 | 상대 웹폰트 형식, 원본 윤곽의 TTF 또는 OTF |

TTF↔CFF 윤곽의 곡선 자체를 다시 그리지 않습니다. 확장자만 바꿔 호환되는 것처럼 표시하지 않고, 원본 윤곽을 그대로 꺼내도록 안내합니다. 다중 글꼴 컬렉션(TTC/OTC)과 SVG/EOT는 현재 지원하지 않습니다. WOFF 래퍼 전용 XML 메타데이터·사설 페이로드와 디지털 서명의 바이트 동등성은 보존을 보장하지 않습니다. 폰트마다 사용·변환 권리는 원본 라이선스를 따릅니다.

## 개발

```sh
npm ci
npm run typecheck
npm test
npm run build
python3 -m http.server 8080 --directory dist
```

실제 TrueType/CFF 왕복 테스트는 `TTF_FIXTURE`, `OTF_FIXTURE` 환경변수로 각각 본인이 사용 가능한 파일을 지정합니다. 설치와 빌드 중에는 npm 패키지를 내려받지만 배포 결과물에는 API, 서버 함수, 원격 변환기, 외부 CDN 호출이 없습니다. 처음 WOFF2를 쓸 때는 이 사이트의 자체 정적 모듈을 불러옵니다. 기본은 빠른 모드이며 ‘더 작게’를 선택하면 압축 시간이 더 걸립니다.

배포 대상은 `dist/`입니다. Cloudflare Pages가 GitHub `main`을 소스로 빌드하며 GitHub Actions 워크플로는 두지 않습니다.
