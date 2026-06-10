# JaeWalk — NOTES

> 지도 기반 여행 일정 플래너. 개인용 PWA 앱.
> **이 문서는 Claude가 새 채팅에서 처음 읽는 인수인계 문서다.**
> 반드시 이 파일부터 읽고 전체 맥락을 파악한 뒤 작업한다.

---

## 프로젝트 기본 정보

- 작업 폴더: `D:\Util\jaewalk`
- GitHub: `github.com/Saulvable/jaewalk`
- 배포: `jaewalk.pages.dev` (Cloudflare Pages)
- 토큰 파일: `D:\Util\cloudflare_token.txt` (로컬 보관, GitHub 절대 업로드 금지)

### 계정 정보

| 서비스 | 계정 | 비고 |
|---|---|---|
| GitHub | Saulvable (saul200j@gmail.com) | |
| Cloudflare | saul200j@gmail.com | Pages + R2 |
| R2 버킷 | jaewalk-files | 토큰은 별도 txt 파일 |

### R2 접근 정보 (코드 내 하드코딩 — 퍼블릭 레포 주의)

| 항목 | 값 |
|---|---|
| Endpoint | https://473f09a0aacfd4d14196fa139cfefee0.r2.cloudflarestorage.com |
| Access Key ID | cb1d09162972ac56e7f5b23841698586 |
| Secret Access Key | (cloudflare_token.txt 참고) |
| Region | auto |

### 설치된 개발 도구

| 도구 | 버전 |
|---|---|
| Node.js | v24.16.0 |
| Git | v2.54.0 |
| VS Code | 최신 |

---

## 기술 스택

| 역할 | 선택 |
|---|---|
| 프레임워크 | Vite + Vanilla JS |
| 지도 | Leaflet.js + OpenStreetMap |
| DB | Dexie.js (IndexedDB) |
| 도보/자동차 경로 | OSRM (공개 서버) |
| 대중교통/비행기 | 구글지도 딥링크 |
| 장소 검색 | Nominatim (OpenStreetMap) |
| 파일 저장 | Cloudflare R2 |
| PDF | jsPDF + NanumGothic CDN (테이블 레이아웃) |
| 알림 | Web Notifications API (PWA 앱 설치 시 동작) |
| 호스팅 | Cloudflare Pages |

### 이동수단

| 이동수단 | 키 | 색상 | 경로선 |
|---|---|---|---|
| 도보 | walk | #2ECC71 초록 | OSRM 실제 도로 |
| 자동차 | car | #2980B9 파랑 | OSRM 실제 도로 |
| 우버/택시 | uber | #2980B9 파랑 | OSRM 실제 도로 |
| 버스/전철 | transit | #8E44AD 보라 | 직선 + 구글지도 딥링크 |
| 비행기 | flight | #95A5A6 회색 | 점선 직선 |

### 포인트 유형

| 유형 | 키 | 색상 |
|---|---|---|
| 출발지 | departure | #95A5A6 회색 |
| 공항 | airport | #2980B9 파랑 |
| 숙소 | hotel | #E74C3C 빨강 |
| 식당 | food | #E67E22 주황 |
| 관광지 | attraction | #2ECC71 초록 |
| 쇼핑 | shopping | #F39C12 황금 |
| 교통 | transport | #8E44AD 보라 |
| 기타 | other | #607D8B 청회색 |

---

## 파일/폴더 구조 전체 설명

```
D:\Util\jaewalk\
  index.html              ← 전체 UI 레이아웃, CSS, 모달 HTML. 앱의 유일한 HTML 파일.
  vite.config.js          ← Vite 빌드 설정 + PWA 플러그인(manifest, Service Worker, 캐시 설정).
  package.json            ← npm 의존성 목록. 빌드/배포 전 반드시 package-lock.json과 함께 커밋.
  package-lock.json       ← npm 의존성 잠금 파일. Cloudflare 빌드 시 필수. 반드시 커밋 포함.
  start.bat               ← 로컬 개발 서버 시작 스크립트 (npm run dev 실행). 로컬 전용.
  pdf_server.py           ← 구버전 Python PDF 서버. v0.8 이후 사용 안 함. 삭제해도 됨.
  NOTES.md                ← 이 파일. Claude 인수인계 + 전체 설계 문서.
  README.md               ← GitHub 공개 README. 간단한 프로젝트 소개.

  src/
    main.js               ← 앱 메인 로직. 이벤트 등록, 뷰 전환(여행목록↔포인트리스트),
                             모달 열기/닫기, 장소 저장/삭제, 시간 연쇄 재계산(recalcTimesAfter),
                             PDF 생성(jsPDF), 알림 설정(handleAlarm),
                             공유 링크 생성(handleShare) 및 수신(handleSharedTrip).
    db.js                 ← 데이터 레이어. Dexie(IndexedDB) CRUD, R2 파일 업로드/삭제/목록,
                             공유 JSON 업로드(r2ShareUpload) / 읽기(r2ShareLoad, 서명된 GET),
                             OSRM 경로 계산(fetchOsrmRoute), 구글지도 딥링크(googleMapsUrl),
                             색상/라벨 상수(TYPE_COLORS, TRANSPORT_LABELS 등).
    map.js                ← Leaflet 지도 초기화, 마커 렌더링, OSRM 경로선, 마커 드래그,
                             겹침 분산(spreadOffset, THRESH 5m / radius 8m), fitBounds 제어.
    ui.js                 ← 사이드바 렌더링. 여행 목록(renderTripList), 포인트 리스트(renderSidebar),
                             일차 필터 버튼 바(activeDayFilter 파라미터로 리스트도 필터링),
                             요약 패널(renderSummary).

  data/
    jaewalk_4_2026-06-07.json   ← 테스트용 여행 데이터 (JSON 내보내기 파일). 로컬 전용.
    jaewalk_6_2026-06-07.json   ← 테스트용 여행 데이터. 로컬 전용.
    sample_trip.json            ← 샘플 여행 데이터. 로컬 전용.
    data/sample_trip.json       ← 중복 파일 (data 폴더 안에 또 data 폴더). 삭제해도 됨.

  public/
    favicon.ico           ← 브라우저 탭 아이콘 (대각선 횡단보도 줄무늬 + 진빨간 발자국).
    icons/
      icon-192.png        ← PWA 홈 화면 아이콘 192×192. 설치 시 필수.
      icon-512.png        ← PWA 홈 화면 아이콘 512×512. 스플래시 화면 등.

  node_modules/           ← npm 설치 패키지. Git/배포에 포함 안 함. 삭제해도 됨 (npm install로 복원).
  dist/                   ← Vite 빌드 결과물. Cloudflare는 GitHub에서 직접 빌드하므로 커밋 불필요. 삭제해도 됨.
  .git/                   ← Git 저장소 메타데이터. 절대 삭제 금지.
```

### 삭제해도 되는 파일/폴더

| 경로 | 이유 |
|---|---|
| `pdf_server.py` | v0.8 이후 jsPDF 방식으로 교체됨. 더 이상 사용 안 함. |
| `data/data/sample_trip.json` | data 폴더 안에 중복 생성된 파일. |
| `node_modules/` | npm install로 언제든 복원 가능. 집파일 용량 줄이려면 삭제. |
| `dist/` | Cloudflare가 빌드를 직접 함. 로컬 빌드 결과물이라 커밋/전송 불필요. |

---

## 설계 결정 노트

### 이동수단 방향 원칙

각 포인트의 이동수단은 항상 **"이 장소에서 출발하는 수단"**이다.

### 시간 구조

- **도착시간(arrive_time):** 이전 포인트 depart_time + 이동시간으로 자동계산. 수동 변경 가능.
- **체류시간(stay):** 모달에서 입력. 10분 단위, 최대 5시간. depart_time = arrive_time + stay 자동계산.
- **연쇄 재계산:** 포인트 저장 시 `recalcTimesAfter()` 실행 → 이하 모든 포인트 자동 전파.

### 지도 동작

- 지도 클릭: 아무 동작 없음. 포인트는 "＋ 장소 추가" 버튼으로만 추가.
- 마커 드래그: 위치 이동 가능. dragstart/dragend로 map.dragging 토글.
- 겹침 분산: `spreadOffset()` — THRESH 5m 이내 동일 위치 감지, radius 8m 원형 배치.
- fitBounds: 최초 로드 시에만. 수정/이동/드래그 후엔 현재 뷰 유지.

### 포인트 복사

- 사이드바 ⧉ 버튼. 복사 시 이름 그대로 (복사 접미사 없음), arrive/depart_time 초기화.

### PDF

- jsPDF + NanumGothic CDN (브라우저 직접 생성, 배포 환경 포함).
- 테이블 레이아웃: `#`, `장소`, `유형`, `도착`, `출발`, `이동수단`, `소요`, `비용`, `메모` 컬럼.
- 일차별 Dark 헤더 + 교번 행 배경.

### 알림 기능

- Web Notifications API. `🔔 알림 설정` 버튼으로 활성화.
- **당일에 켜야 동작한다.** depart_time 기준으로 오늘 날짜에 맞는 시간을 등록함.
  - 전날 밤에 켜두면: 모든 시간이 이미 지났으므로 "알림 등록할 출발 시간이 없어요" 메시지 출력.
  - 여행 당일 아침에 켜면: 아직 지나지 않은 모든 depart_time에 대해 5분 전 알림 등록됨.
- 포인트에 날짜(date 필드) 없이 시간(depart_time)만 저장하는 구조 — 이것이 설계 의도임.
- **모바일 PWA 앱 설치 필수** (홈 화면에 설치된 앱에서만 백그라운드 알림 소리 지원).
- iOS: 홈 화면 설치 + iOS 16.4 이상 필요.
- 안드로이드 Chrome: 홈 화면 설치 후 동작.
- 웹브라우저(탭)에서도 기술적으로 동작하지만, 탭이 활성 상태여야 함.
- 알림 재클릭 시 취소. 상태: `🔔 알림 ON (N개)` 표시.

### 여행 공유 링크 ✅ 구현완료

- `🔗 링크 복사` 버튼 클릭 → 현재 여행 JSON을 R2 `shares/{tripId}.json` 에 업로드
- URL: `https://jaewalk.pages.dev/?share={tripId}` 클립보드에 자동 복사
- **자동 업데이트:** 같은 tripId로 덮어쓰기 → URL 그대로, 내용만 최신화
- 공유 링크 접속 시: 읽기전용 뷰 (편집 불가) + "내 앱에 저장" 버튼으로 가져오기 가능
- **읽기도 서명된 GET 요청** 사용 (`signedR2Request('GET', ...)`) — R2 퍼블릭 액세스 설정 불필요.

### 모바일 반응형

- `@media (max-width: 768px)` 기준. 768px 이하에서 폰 레이아웃 적용.
- 폰/태블릿에서: 사이드바(리스트)가 위에, 지도가 아래에 (`order: -1`).
- 사이드바 높이 45vh, 지도 나머지 전부.

### 일차 필터 (지도 + 리스트 연동)

- 필터 버튼(전체 / 1일차 / 2일차 …) 클릭 시 지도 마커와 사이드바 리스트 **동시** 필터링.
- `renderSidebar(points, callbacks, activeDayFilter)` — 세 번째 인자로 현재 선택 일차 전달.

### 브라우저별 데이터 격리

IndexedDB/localStorage는 브라우저별 완전 분리. JSON 내보내기/가져오기 또는 R2로 공유.

### R2 파일 업로드

- 키: `trips/{tripId}/{pointId}_{filename}`
- AWS Signature V4 브라우저 직접 서명 → 별도 백엔드 불필요.

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| npm 보안 오류 | PowerShell 실행 정책 | `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| 지도가 안 뜸 | Leaflet CSS 미로드 | index.html에 leaflet.css import 확인 |
| 마커 위치 이상 | 위도/경도 순서 오류 | Leaflet: [lat, lng] / OSRM: [lng, lat] |
| PWA 설치 팝업 없음 | HTTP 환경 | HTTPS(Cloudflare Pages) 배포 후에만 가능 |
| iOS 알림 안 옴 | Safari에서 열었거나 구버전 | 홈 화면 설치 앱으로 실행, iOS 16.4+ 필요 |
| 크롬 데이터가 파이어폭스에 없음 | 브라우저별 IndexedDB 격리 | 정상. JSON 내보내기로 이전 |
| R2 업로드 403 | CORS 미설정 | 위 CORS 설정 적용 (배포 환경) |
| OSRM 경로 없음 | 공개 서버 일시 불가 또는 도서지역 | 자동으로 직선 fallback |
| 마커 드래그 시 지도 이동 | Leaflet pan 충돌 | dragstart/dragend로 map.dragging 토글 |
| PDF 저장 안 됨 | (구버전) pdf_server.py 미실행 | v0.8 이후 jsPDF 방식, 배포 환경 포함 완전 지원 |
| 알림 안 옴 (웹) | 탭 비활성화 상태 | PWA 앱으로 설치 후 사용 |
| 공유 링크 NetworkError | R2 프라이빗 엔드포인트에 직접 fetch | r2ShareLoad를 signedR2Request('GET')으로 수정됨 (v0.11) |
| 공유 링크 모바일에서 PC 레이아웃 | @media 기준이 600px로 너무 낮았음 | 768px로 상향 수정됨 (v0.11) |
| 리스트 일차 필터 안 됨 | onDayFilter가 지도만 업데이트 | renderSidebar에 activeDayFilter 파라미터 추가됨 (v0.11) |
