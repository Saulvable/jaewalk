# JaeWalk

A map-based travel itinerary planner built as a personal PWA. Plan multi-day trips by adding places on a map, setting arrival/departure times, transport modes, and costs. Share read-only itinerary links with anyone.

**Live:** [jaewalk.pages.dev](https://jaewalk.pages.dev)

## Features

- Interactive map with place search (worldwide, Nominatim)
- Multi-day itinerary with automatic time recalculation
- Walking/driving routes via OSRM, transit/flight via Google Maps
- PDF export, departure notifications, shareable read-only links
- PWA — installable on iOS and Android home screen
- Data stored locally in IndexedDB (no account needed)

## Stack

Vite + Vanilla JS, Leaflet.js, Dexie.js (IndexedDB), jsPDF, Cloudflare Pages + R2

---

# JaeWalk

지도 기반 개인용 여행 일정 플래너 PWA. 지도에서 장소를 추가하고 도착/출발 시간, 이동수단, 비용을 입력하면 일정이 자동으로 계산됩니다. 읽기전용 공유 링크로 다른 사람과 일정을 공유할 수 있습니다.

**배포:** [jaewalk.pages.dev](https://jaewalk.pages.dev)

## 주요 기능

- 전세계 장소 검색 및 지도 핀 추가
- 다일차 일정 + 시간 자동 연쇄 계산
- 도보/자동차 경로(OSRM), 대중교통/비행기(구글지도 딥링크)
- PDF 내보내기, 출발 알림, 읽기전용 공유 링크
- PWA — iOS/안드로이드 홈 화면 설치 가능
- 계정 불필요, 데이터는 기기 내 IndexedDB에 저장
