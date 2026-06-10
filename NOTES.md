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
| PDF | jsPDF + NotoSansKR CDN (테이블 레이아웃) |
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

## 파일 구조

```
D:\Util\jaewalk\
  index.html          ← 전체 UI 레이아웃, CSS, 모달 HTML
  src/
    main.js           ← 앱 메인 로직 (이벤트, 모달, 저장, 재계산, PDF, 알림)
    db.js             ← Dexie IndexedDB CRUD, R2 업로드, 상수 정의
    map.js            ← Leaflet 지도, 마커, 경로선(OSRM)
    ui.js             ← 사이드바 렌더링 (여행목록, 포인트리스트, 요약)
  data/
    jaewalk_4_2026-06-06.json  ← 1일차 예시 데이터 (시애틀)
  NOTES.md            ← 이 파일
```

---

## 설계 결정 노트

### 이동수단 방향 원칙

각 포인트의 이동수단은 항상 **"이 장소에서 출발하는 수단"**이다.

### 시간 구조

- **도착시간(arrive_time):** 이전 포인트 depart_time + 이동시간으로 자동계산. 수동 변경 가능.
- **체류시간(stay):** 모달에서 입력. 10분 단위, 최대 5시간. depart_time = arrive_time + stay 자동계산.
- **연쇄 재계산:** 포인트 저장 시 `recalcTimesAfter()` 실행 → 이하 모든 포인트 자동 전파.

### 지도 동작

- 지도 클릭: 아무 동작 없음. 포인트는 "+ 장소 추가" 버튼으로만 추가.
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
- 오늘 날짜 기준, depart_time이 있는 포인트마다 출발 5분 전 알림.
- **모바일 PWA 앱 설치 필수** (홈 화면에 설치된 앱에서만 백그라운드 알림 소리 지원).
- iOS: 홈 화면 설치 + iOS 16.4 이상 필요.
- 안드로이드 Chrome: 홈 화면 설치 후 동작.
- 웹브라우저(탭)에서도 기술적으로 동작하지만, 탭이 활성 상태여야 함.
- 알림 재클릭 시 취소. 상태: `🔔 알림 ON (N개)` 표시.

### 여행 공유 링크 (미구현)

- 계획: JSON을 R2에 올리고 읽기 전용 URL 생성.
- **주의: R2 URL 업데이트 문제** — JSON을 같은 키로 덮어쓰면 URL은 그대로지만 R2 퍼블릭 URL에 CDN 캐시가 있으면 즉시 반영 안 될 수 있음. Cloudflare R2 퍼블릭 버킷 + Cache-Control: no-cache 헤더로 해결 가능. 미구현 상태.

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
