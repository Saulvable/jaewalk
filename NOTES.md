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

| 역할 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | Vite + Vanilla JS | React는 오버스펙. 빠르고 단순. |
| 지도 | Leaflet.js + OpenStreetMap | 무료, 안정적 |
| DB | Dexie.js (IndexedDB) | localStorage 대비 용량·성능 우월 |
| 도보/자동차 경로 | OSRM (공개 서버) | API 키 불필요, 완전 무료 |
| 대중교통/비행기 | 구글지도 딥링크 | 무료, 구글 데이터 활용 |
| 장소 검색 | Nominatim (OpenStreetMap) | 전세계, 무료, 가입 불필요 |
| 파일 저장 | Cloudflare R2 | 무료 10GB, AWS S3 호환 |
| R2 인증 | AWS Signature V4 (브라우저 직접 구현) | 별도 백엔드 불필요 |
| PWA | vite-plugin-pwa | 서비스워커 자동 생성, 오프라인 타일 캐싱 |
| 알림 | Web Notifications API | 미구현 |
| 호스팅 | Cloudflare Pages | 무료, HTTPS 자동 |

### 이동수단

| 이동수단 | 키 | 색상 | 경로선 |
|---|---|---|---|
| 도보 | walk | #2ECC71 초록 | OSRM 실제 도로 |
| 자동차 | car | #2980B9 파랑 | OSRM 실제 도로 |
| 우버/택시 | uber | #2980B9 파랑 | OSRM 실제 도로 |
| 버스/전철 | transit | #8E44AD 보라 | 직선 + 구글지도 딥링크 |
| 비행기 | flight | #95A5A6 회색 | 점선 직선 |

> 자전거(bike)는 v0.3에서 제거됨.

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

## 파일 구조

```
D:\Util\jaewalk\
  index.html          ← 전체 UI 레이아웃, CSS, 모달 HTML
  src/
    main.js           ← 앱 메인 로직 (이벤트, 모달, 저장, 재계산)
    db.js             ← Dexie IndexedDB CRUD, R2 업로드, 상수 정의
    map.js            ← Leaflet 지도, 마커, 경로선(OSRM)
    ui.js             ← 사이드바 렌더링 (여행목록, 포인트리스트, 요약)
  data/
    jaewalk_4_2026-06-06.json  ← 1일차 예시 데이터 (시애틀)
  NOTES.md            ← 이 파일 (인수인계/작업기록)
```

---

## 설계 결정 노트

### 이동수단 방향 원칙

각 포인트의 이동수단은 항상 **"이 장소에서 출발하는 수단"**이다.

```
집 (출발지)
  └→ [우버 / 35분 / $45]
밴쿠버공항 (도착 08:00 / 출발 10:30)
  └→ [비행기 / 2h30m / $280]
라스베가스공항 (도착 13:00 / 출발 13:30)
  └→ [우버 / 20분 / $25]
호텔 (도착 14:00)
```

### 시간 구조 (v0.4~)

- **도착시간(arrive_time):** 이전 포인트 depart_time + 이동시간으로 자동계산. 수동 변경 가능.
- **체류시간(stay):** 모달에서 입력. 10분 단위, 최대 5시간. **depart_time = arrive_time + stay 로 자동계산.**
- **출발시간(depart_time):** 코드 내부에서만 존재. 모달에 직접 입력 필드 없음.
- **연쇄 재계산:** 포인트 저장 시 `recalcTimesAfter()` 실행 → 이하 모든 포인트 arrive/depart 자동 전파.
- **리스트 표시:** 도착시간 ~ 출발시간 (arrive_time ~ depart_time) 그대로 표시.

### 여행(Trip) 구조

- 최상위 개념은 **여행(Trip)**. 여행 선택 후 포인트 추가.
- 활성 여행은 localStorage에 기억 → 재실행 시 바로 복귀.
- 구버전 localStorage 데이터 → IndexedDB 자동 마이그레이션.

### 일차(Day) 구조

- 포인트마다 `day` 필드(숫자)로 일차 구분.
- 사이드바 상단에 일차 필터 버튼 바 (전체 / 1일차 / 2일차 ...) — **sticky (스크롤해도 고정)**.
- 일차가 다른 포인트 간에는 경로선 미표시.

### 사이드바

- 드래그 리사이즈 가능 (좌우).
- 최소 너비 200px, 최대 화면의 50%.
- 완전히 접히지 않음 (최소 200px 보장).

### 포인트 복사

- 사이드바 카드의 ⧉ 버튼으로 복사.
- 복사본은 이름 뒤에 " (복사)" 추가, arrive/depart_time은 비워서 생성.
- 숙소처럼 같은 장소를 여러 번 쓸 때 활용.

### 브라우저별 데이터 격리

IndexedDB/localStorage는 브라우저별로 완전히 분리된 저장소.
**해결**: Cloudflare R2 + JSON 내보내기/가져오기로 브라우저 간 공유 가능.

### R2 파일 업로드 구조

- 키 네임스페이스: `trips/{tripId}/{pointId}_{filename}`
- 브라우저에서 AWS Signature V4로 직접 서명 → 별도 백엔드 불필요
- 업로드된 파일 URL은 포인트의 `external_links` 배열에 자동 추가

### 장소 검색

Nominatim 전세계 검색 (`countrycodes` 파라미터 없음).
`accept-language: ko,en`으로 한국어 이름 우선 반환.
특정 지역 검색 시 "명동 서울", "Shibuya Tokyo" 식으로 도시명 함께 입력 권장.

### 포인트 순서 변경

▲▼ 버튼. 순서 변경 후 `recalcTimesAfter()` 자동 실행하여 시간 전파.

### OSRM 경로

도보(walk), 자동차(car/uber)만 OSRM 실제 도로 경로 사용.
버스/전철(transit), 비행기(flight)는 직선 + 구글지도 딥링크.

### 마커

- 번호 표시 마커 (장소 전체 순서 기준).
- 클릭 시 팝업 → 구글지도 버튼으로 네비게이션 연동.
- **마커 드래그는 Leaflet 지도 이동과 충돌 이슈 있음 — 미해결.**

### 외부 링크

- 모달에서 URL + 표시이름으로 추가.
- 사이드바/팝업에서 클릭 시 새 탭으로 이동 (target=_blank).
- PDF 저장은 Cloudflare Pages 배포 후 R2 업로드로 가능.

---

## 개발 진행 현황

### 완료

**사전 준비** — 완료

**v0.1 — 1단계: 지도 + 포인트 마커** (2025-06-04)
- Vite + Vanilla JS, Leaflet, localStorage CRUD, 사이드바, 연결선, 장소 검색

**v0.2 — 1단계 개선** (2025-06-05)
- Trip 개념, 일차 분리, 마커 드래그 버그 수정, 검색 캐나다 한정, start.bat

**v0.3 — 2~7단계 통합** (2025-06-05)
- IndexedDB(Dexie) 전환 + localStorage 자동 마이그레이션
- OSRM 실제 도로 경로 연동 (도보/자동차/우버)
- 구글지도 딥링크 자동 생성 (버스/전철, 비행기)
- 일차 필터 버튼 바 (전체 / N일차)
- Cloudflare R2 파일 업로드 (AWS Sig V4 브라우저 직접 구현)
- 외부 링크 다중 추가 (URL + 표시 이름)
- JSON 내보내기 / 가져오기
- 요약 패널 (일차 수, 장소 수, 총 이동 비용)
- PWA 설정 (vite-plugin-pwa, 오프라인 타일 캐싱)
- 장소 검색 전세계로 확대 (countrycodes 제거)
- 이동수단: 자전거 제거, 버스 → 버스/전철(transit)
- 포인트 유형: 집/출발지 → 출발지, 쇼핑 추가
- 팝업에 구글지도 버튼 추가

**v0.4 — UI/UX 개선** (2026-06-06)
- 시간 입력 → 5분 간격 드롭다운 (input type=time 제거)
- "출발시간" 입력 제거 → "체류시간" 드롭다운으로 교체 (10분 단위, 최대 5시간)
- 도착시간 자동계산 (이전 포인트 depart + 이동시간)
- 체류시간/이동시간 수정 시 이하 포인트 시간 연쇄 자동재계산 (`recalcTimesAfter`)
- 포인트 복사 기능 (⧉ 버튼, 숙소 등 재사용 장소용)
- 외부 링크 클릭 → 실제 새 탭 이동 (target=_blank)
- 사이드바 드래그 리사이즈 (최소 200px, 최대 화면 50%)
- 일차 필터 버튼 sticky (스크롤해도 항상 보임)
- 요약 패널 한 줄로 압축 (여행명 + 일차 + 장소 수 + 총이동비용)

**v0.5 — 배포 및 마무리** (2026-06-06)
- PWA 아이콘 제작 완료: `public/icons/icon-192.png`, `icon-512.png` (핑크 원형 배경 + 흰색 지도 핀)
- Cloudflare Pages 배포 → `jaewalk.pages.dev` (아래 배포 절차 참고)
- R2 CORS 설정 완료 (배포 후 파일 업로드 정상 동작)

---

### 다음에 할 것 (우선순위 순)

> 새 채팅 시작 시 이 섹션을 보고 "v0.6 작업 시작할까요?" 먼저 물어볼 것.

#### v0.6 — 마커 드래그 버그 수정

- 현재 증상: 마커를 마우스로 잡으면 마커 대신 지도가 이동함
- Leaflet `draggable:true` 마커와 지도 pan 이벤트 충돌
- 해결 방향: `mousedown` 이벤트에서 `map.dragging.disable()` → `dragend`에서 `map.dragging.enable()` 처리

#### v0.7 — 기능 추가

- **타임라인 뷰**: 하루 일정을 가로 타임라인으로 시각화 (별도 탭 또는 모달)
- **날씨 연동**: OpenWeather API, 포인트 날짜/위치 기반 날씨 표시
- **알림 기능**: Web Notifications API, 출발 N분 전 알림 (7단계)
- **이동수단 자동 추천**: 거리 기반 (1km 이하 → 도보, 이상 → 우버 등)

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| npm 보안 오류 | PowerShell 실행 정책 | `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| 지도가 안 뜸 | Leaflet CSS 미로드 | index.html에 leaflet.css import 확인 |
| 마커 위치 이상 | 위도/경도 순서 오류 | Leaflet: [lat, lng] / OSRM: [lng, lat] |
| PWA 설치 팝업 없음 | HTTP 환경 | HTTPS(Cloudflare Pages) 배포 후에만 가능 |
| iOS 알림 안 옴 | Safari에서 열었거나 구버전 | 홈 화면 설치 앱으로 실행, iOS 16.4+ 필요 |
| 크롬 데이터가 파이어폭스에 없음 | 브라우저별 IndexedDB 격리 | 정상 동작. JSON 내보내기로 이전 또는 R2 활용 |
| R2 업로드 403 | CORS 미설정 | 위 CORS 설정 적용 (배포 환경) |
| OSRM 경로 없음 | 공개 서버 일시 불가 또는 도서지역 | 자동으로 직선 fallback |
| 마커 드래그 시 지도가 이동 | Leaflet pan 이벤트 충돌 | v0.6에서 수정 예정 (mousedown에서 dragging disable) |
| 외부 링크 클릭 안 됨 | (v0.3) a태그 href 누락 | v0.4에서 수정 완료 |
| PDF 저장 안 됨 | Cloudflare Pages 미배포 상태 | Pages 배포 + R2 CORS 설정 후 가능 |

---

## 버전 히스토리

| 버전 | 날짜 | 주요 내용 |
|---|---|---|
| v0.1 | 2025-06-04 | 지도 + 마커 + 기본 CRUD |
| v0.2 | 2025-06-05 | Trip 구조, 일차 분리, 검색 개선, 드래그 버그 수정 |
| v0.3 | 2025-06-05 | IndexedDB, OSRM, R2, PWA, JSON I/O, 전세계 검색, 쇼핑 유형, 버스/전철 |
| v0.4 | 2026-06-06 | 시간 드롭다운, 체류시간, 연쇄재계산, 포인트복사, 링크클릭, 사이드바리사이즈, sticky필터, 요약한줄 |
| v0.5 | 2026-06-06 | PWA 아이콘 제작 (icon-192.png, icon-512.png), Cloudflare Pages 배포, R2 CORS 설정 |
