# Venta × Void

빌드 없이 배포하는 정적 사이트입니다. Cloudflare와 GitHub Pages에서 저장소 루트를 그대로 제공합니다. `.nojekyll`을 유지하세요.

## 관리자 페이지

**https://kakaobot.xyz/admin/**

1. **Sign In with Token**으로 로그인합니다. 이 저장소에 쓰기 권한이 있는 GitHub 계정의 토큰을 관리자 화면에 직접 입력하세요. 코드에 저장하지 마세요.
2. **봇별 이용약관** → 밴타봇 또는 보이드봇을 선택합니다.
3. 제목, 시행일, 수정일, 본문을 수정하고 저장/게시합니다.
4. `main`에 자동 커밋됩니다. 호스팅 배포 완료 후 공개 약관을 새로고침합니다.

OAuth 로그인 서버는 별도로 설정하지 않았으므로 토큰 로그인을 사용하세요. 인증 후 실제 게시 검증은 운영자 로그인 상태에서 진행해야 합니다.

## Markdown 직접 수정

| 봇       | 콘텐츠 원본                | 공개 페이지                          |
| -------- | -------------------------- | ------------------------------------ |
| 밴타봇   | `terms/ventabot/readme.md` | https://kakaobot.xyz/terms/ventabot/ |
| 보이드봇 | `terms/voidbot/readme.md`  | https://kakaobot.xyz/terms/voidbot/  |

해당 파일의 본문과 `updated`를 수정하고 커밋·푸시합니다. YAML의 `bot`은 유지하고 날짜는 `YYYY-MM-DD` 형식으로 입력하세요. 이 루트 readme는 운영 가이드입니다.

각 약관 경로에 실제 `index.html`이 있어 Jekyll이나 SPA 경로 처리가 필요하지 않습니다. `assets/terms.js`가 최신 `readme.md`를 읽고 안전하게 렌더링합니다. 라이브러리는 `assets/vendor/`에 포함해 공개 약관이 외부 CDN에 의존하지 않도록 했습니다.

HTML에는 초기 약관도 포함합니다. JavaScript를 끄면 초기 내용과 원문 링크를 표시합니다. 원문 로드 실패 시 저장된 내용임을 안내합니다. 최신 개정 내용은 JavaScript를 켜거나 원문에서 확인합니다.

## 로컬 확인

```sh
python -m http.server 8765
```

http://localhost:8765 에서 메인, 제품, 약관과 관리 화면을 확인합니다. `file://` 대신 HTTP 서버를 사용하세요.

DOM 기능 검사: 임시 폴더에 `npm install --prefix <임시폴더> jsdom`으로 설치하고, `JSDOM_MODULE` 환경변수를 해당 `node_modules/jsdom` 경로로 지정한 후 `node scripts/test-terms.cjs`를 실행합니다.

## 배포

- GitHub Pages: `main` / 루트. `.nojekyll`로 HTML과 Markdown을 그대로 게시합니다.
- Cloudflare: 저장소 루트를 배포합니다. 빌드 명령이 필요하지 않습니다.
- 약관 주소가 홈페이지로 바뀐다면 배포 결과에 약관별 `index.html`이 포함됐는지 확인하세요.
- CMS 수정도 연결된 호스팅 배포 완료 후 반영됩니다. CMS와 호스팅이 같은 저장소의 `main`을 사용하는지 확인하세요.

## 디자인·미리보기

- 공통 스타일은 `assets/site.css`입니다.
- `og-image.png` 하트는 **카카오톡·디스코드 링크 미리보기(OG/Twitter) 전용**입니다. 사이트 본문에 표시하지 않습니다.
- 이미 공유된 링크는 플랫폼 캐시 때문에 이전 이미지가 잠시 보일 수 있습니다.
- 참고: [Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Sveltia GitHub 인증](https://sveltiacms.app/en/docs/backends/github).

## 운영 메모

기본 약관을 작성했습니다. 실제 기능·이용 기간·판매자 정보·환불 절차는 결제 전에 안내하고, 개인정보를 수집한다면 실제 처리 현황에 맞는 개인정보 처리방침을 별도로 마련하세요.

저장소 비공개 전환은 소유자/관리자 권한이 필요합니다. 현재 작업 계정에는 쓰기 권한만 있습니다. 소유자가 비공개로 바꿀 때 GitHub Pages 요금제 지원 및 실제 호스팅 연결을 확인하세요.
