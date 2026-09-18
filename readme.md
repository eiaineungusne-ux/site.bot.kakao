# Venta × Void

밴타봇·보이드봇 구매 안내 사이트입니다. GitHub Pages의 `main` 브랜치 루트에서 Jekyll로 배포합니다.

## 약관 수정 → 자동 게시

| 대상     | 수정할 원본                | 공개 페이지        |
| -------- | -------------------------- | ------------------ |
| 밴타봇   | `terms/ventabot/readme.md` | `/terms/ventabot/` |
| 보이드봇 | `terms/voidbot/readme.md`  | `/terms/voidbot/`  |

위 두 파일이 각 약관의 단일 원본입니다. 이 루트 readme는 운영 가이드입니다.

1. 해당 봇의 `readme.md`에서 본문과 `updated` 날짜를 수정합니다. 약관 변경 시 공지 기간을 고려해 `effective_date`도 설정합니다.
2. `main`에 커밋·푸시합니다. GitHub 웹 편집기에서 커밋해도 동일합니다.
3. GitHub Pages가 Markdown을 `_layouts/terms.html`로 변환해 게시합니다. 저장소 Actions의 `pages build and deployment` 완료 후 공개 페이지를 확인합니다.

문서 맨 위 `---` 사이의 `layout`, `bot`, `permalink`는 유지하세요. `.nojekyll`을 추가하면 약관 자동 변환이 중단됩니다. 약관별 `index.html`을 따로 만들면 출력 경로가 충돌하므로 만들지 마세요.

## Sveltia CMS

- 관리 화면: <https://kakaobot.xyz/admin/>
- Sveltia CMS 0.215.0 사용. `admin/config.yml`에 두 Markdown 파일을 개별 편집 항목으로 등록했습니다.
- 관리자 화면에서 **Sign In with Token**으로 저장소 쓰기 권한이 있는 GitHub 계정의 토큰을 직접 입력합니다. 별도 OAuth 서버는 연결하지 않았습니다.
- 가능하면 이 저장소만 선택하고 Contents 읽기/쓰기 권한을 부여한 fine-grained 토큰을 사용하세요. 조직·계정 정책에 따라 승인이 필요할 수 있습니다. 토큰을 코드나 이 문서에 넣지 마세요.
- “봇별 이용약관” → 해당 봇 → 제목·시행일·수정일·본문 편집 → 저장/게시하면 `main`에 커밋됩니다. 이후 Pages 배포를 기다립니다.
- CMS 화면이 공개되어도 저장소 쓰기 권한 없이는 게시할 수 없습니다. CMS는 외부 CDN 연결이 필요합니다. 공개 약관은 빌드된 HTML이므로 CMS나 JavaScript 없이 읽을 수 있습니다.
- 인증된 저장/게시 동작은 운영자의 브라우저 로그인 후 확인해야 합니다.

## 로컬 미리보기

Ruby와 Bundler 설치 후:

```sh
bundle install
bundle exec jekyll serve
```

`http://localhost:4000`에서 확인합니다. 단순 정적 서버로는 메인·제품 화면은 확인할 수 있지만 Markdown 약관은 Jekyll 빌드가 필요합니다.

## 디자인·미리보기 이미지

- [Apple HIG Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Typography](https://developer.apple.com/design/human-interface-guidelines/typography)를 참고해 시스템 글꼴, 명확한 위계, 여백, 반응형 배치, 키보드 포커스와 동작 줄이기를 적용했습니다.
- 공통 스타일: `assets/site.css`.
- `og-image.png`: 첨부 하트를 내장 imagegen으로 가로형으로 편집한 이미지(1731 × 909). 기존 미리보기 이미지를 교체했습니다. 페이지 안에서는 `object-fit: contain`으로 비율을 보존합니다.
- 이미지 편집 프롬프트 요약: “첨부한 흰색 손그림 하트와 세 개의 강조선을 유지하고 검은 캔버스만 약 1.905:1 가로형으로 확장. 중앙 배치, 왜곡·잘림·문구 없이 충분한 여백.”
- OG/Twitter 이미지는 만료되는 외부 링크 대신 사이트 절대 주소를 사용합니다. 이미 공유된 카카오톡 링크는 플랫폼 캐시 때문에 잠시 이전 이미지가 표시될 수 있습니다.

## 약관 운영 시 확인

기본 약관 초안을 작성했습니다. 실제 판매 기능, 지원 환경, 이용 기간, 판매자 정보, 결제·환불 절차는 결제 전에 별도로 명확히 안내해야 합니다. 개인정보를 수집한다면 실제 처리 현황에 맞는 개인정보 처리방침을 별도로 마련하세요. 이 약관은 개인정보 처리방침을 대신하지 않습니다.

## 저장소 비공개 전환

현재 작업 계정은 저장소 쓰기 권한만 있고 관리자 권한이 없어 공개 범위를 변경할 수 없습니다. 소유자가 GitHub 저장소 Settings → General → Danger Zone → Change repository visibility에서 변경할 수 있습니다.

GitHub Free의 비공개 저장소는 Pages 배포를 지원하지 않습니다. 먼저 소유자 요금제의 private Pages 지원 여부 또는 대체 호스팅을 확인하세요. 지원 요금제에서 저장소를 비공개로 바꾸더라도 배포 사이트 자체는 공개일 수 있습니다.

참고: [Sveltia GitHub 인증](https://sveltiacms.app/en/docs/backends/github), [GitHub Pages 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
