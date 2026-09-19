# 밴타봇 상태 페이지 운영

## 구성

- 공개 페이지: `/ventabot/status/` (밴타봇 소개 페이지에 연결)
- 관리자 페이지: `/admin/status/` (기존 약관 관리자 화면에도 연결)
- 상태 서버: `status-api/`의 Cloudflare Worker + Durable Object
- Termux 봇: `src/features/status-reporter.js`와 연결/오류 이벤트 훅

상태 서버는 봇과 별도로 운영합니다. 봇은 30초마다 연결 여부만 보고하며, 보고가 90초 끊기면 서버에서 자동으로 장애를 기록합니다. 브라우저는 30초마다 갱신하므로 화면 반영까지 추가로 최대 30초가 걸릴 수 있습니다. 상태 API 자체에 연결하지 못하면 봇 장애로 단정하지 않고 ‘상태 확인 불가’로 표시합니다.

영구 이용제한은 로그인·연결 오류 또는 서버 KICKOUT 사유에 `영구적으로`가 포함되고 연결이 끊긴 경우에만 보고합니다. 일반 채팅이나 닉네임, 터미널 전체를 수집하지 않습니다. 원인 문구가 봇에 도착하기 전에 기기/프로세스가 종료되면 일반 연결 장애로만 표시할 수 있습니다. 카카오톡의 실제 연결 성공 이벤트가 오면 이용제한 표시와 자동 장애가 해제됩니다.

## 최초 배포

현재 `assets/status-config.json`의 주소는 비워 두었습니다. 실제 배포 전에는 준비 중 안내가 표시되며 가짜 정상 상태를 보여 주지 않습니다.

1. 이 폴더에서 `npx wrangler login`으로 Cloudflare에 로그인합니다.
2. `npx wrangler deploy --config status-api/wrangler.jsonc`를 실행합니다. Durable Object 사용이 가능한 계정이어야 합니다.
3. 충분히 긴 임의의 비밀키를 만들고 `npx wrangler secret put HEARTBEAT_TOKEN --config status-api/wrangler.jsonc`에 입력합니다. 비밀키는 Git에 올리지 않습니다.
4. 배포된 Worker의 HTTPS 주소를 `assets/status-config.json`의 `apiBase`에 넣습니다.
5. Termux `/data/data/com.termux/files/home/termux_bot/status-report.json`을 아래 형식으로 만듭니다. `token`은 3번과 동일하게 설정하고 파일 권한은 `chmod 600 status-report.json`으로 제한합니다.

```json
{
  "apiBase": "https://ventabot-status.YOUR-SUBDOMAIN.workers.dev",
  "token": "비밀키"
}
```

6. 사이트 변경분을 기존 배포 방식으로 게시합니다. 봇은 **사용자가 다음에 재시작할 때** 설정과 새 코드가 적용됩니다. 실행 중인 봇에 코드를 복사한 것만으로 상태 보고가 시작되지는 않습니다.
7. `/ventabot/status/`에서 실제 마지막 보고 시각과 연결 상태를 확인합니다. 임의의 테스트 보고를 운영 API에 보내면 실제 상태와 섞이므로 테스트는 로컬에서만 합니다.

도메인이 바뀌면 `wrangler.jsonc`의 `ALLOWED_ORIGINS`도 수정하여 재배포합니다. 운영 배포에서는 필요하지 않은 localhost 항목을 제거할 수 있습니다. Worker URL은 공개 정보지만 **HEARTBEAT_TOKEN 및 GitHub 관리자 토큰은 절대 사이트 JSON/HTML에 넣지 않습니다.**

## 관리자

사이트 저장소 `eiaineungusne-ux/site.bot.kakao`에 쓰기 권한이 있는 GitHub 계정의 개인 액세스 토큰으로 `/admin/status/`에 로그인합니다. fine-grained 토큰은 해당 저장소 선택 및 Repository metadata 읽기 권한이 필요합니다. Worker가 GitHub API의 저장소 권한을 요청마다 확인합니다. 토큰은 브라우저 메모리에만 보관하고 로컬 저장소나 서버 저장소에 기록하지 않습니다. 새로고침/로그아웃하면 다시 입력합니다.

- 공통 운영 안내: 공개 페이지의 별도 공지. 비우면 숨김.
- 새 장애·점검 공지: 운영자가 수동으로 작성하는 기록.
- 자동 장애 업데이트: 기본 복구 문구를 바꾸고 확인 중/원인 확인/복구 확인 중 진행 내역 추가.
- 자동 장애 해결: 실제 봇 연결 복구 시 자동 처리. 관리자가 오프라인 상태를 임의로 정상으로 바꿀 수는 없음.
- 수동 공지 해결: 진행 상태에서 해결됨 선택.

공지는 HTML이 아닌 일반 텍스트로 출력합니다. 로그인 정보·사용자 닉네임·카카오 토큰·로그 원문은 상태 서버로 전송하지 않습니다. 보관 기록은 최근 90일, 최대 100건 및 전체 용량 제한 안에서 유지됩니다. 일별 막대는 하루 중 관측한 가장 심한 상태이며 정밀한 가동률 퍼센트가 아닙니다. 보이스룸 음질이나 각 명령어 동작까지 검사하지는 않습니다.

## 개발 검증

```text
node --test status-api/state.test.mjs
npx wrangler deploy --dry-run --config status-api/wrangler.jsonc
npx wrangler dev --local --config status-api/wrangler.jsonc --var HEARTBEAT_TOKEN:local-test-only
```

로컬 테스트용 키와 로컬 저장소는 운영 데이터와 분리됩니다. 사이트 UI 테스트는 `npm install --no-save --package-lock=false jsdom` 후 `node --test scripts/test-status.cjs`, 기존 약관 테스트는 `node scripts/test-terms.cjs`로 실행합니다.
