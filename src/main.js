// main.js — JaeWalk 앱 메인
import { initMap, onMapClick, renderPoints, flyToPoint, clearMap, getMapView, setMapView } from './map.js'
import { renderSidebar, renderTripList, renderSummary } from './ui.js'
import {
  loadTrips, addTrip, updateTrip, deleteTrip,
  getActiveTripId, setActiveTripId,
  loadPoints, addPoint, updatePoint, deletePoint as dbDeletePoint,
  movePointUp, movePointDown,
  migrateOldData,
  exportTripJson, importTripJson,
  r2Upload, r2ListFiles, r2Delete, r2OpenFile,
  r2ShareUpload, r2ShareLoad,
  fetchOsrmRoute,
  googleMapsUrl
} from './db.js'
import { jsPDF } from 'jspdf'

// ── 나눔고딕 폰트 캐시 (앱 시작 시 한 번만 로드) ────
let _nanumGothicB64 = null
async function loadNanumGothic() {
  if (_nanumGothicB64) return _nanumGothicB64
  const url = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Regular.ttf'
  const res = await fetch(url)
  if (!res.ok) throw new Error('나눔고딕 폰트 로드 실패')
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const CHUNK = 8192
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  _nanumGothicB64 = btoa(binary)
  return _nanumGothicB64
}

let editingId      = null
let editingTripId  = null
let pendingLatLng  = null
let prevPointForDuration = null   // 신규 추가 시 직전 포인트 (OSRM 자동계산용)
let searchTimer    = null
let previewMarker  = null
let mapInstance    = null
let currentView    = 'trips'
let currentDayFilter = null

// 외부 링크 임시 목록
let pendingLinks = []

// ── 초기화 ──────────────────────────────────────────
async function init() {
  await migrateOldData()
  mapInstance = initMap()

  onMapClick((lat, lng) => {
    if (currentView !== 'points') return
    setPendingLocation(lat, lng)
    // 지도 클릭은 위치만 미리 지정 — 모달은 "+ 장소 추가" 버튼으로만 열림
  })

  document.getElementById('add-btn').addEventListener('click', () => {
    if (currentView === 'trips') openTripModal(null)
    else openPointModal(null)
  })

  document.getElementById('back-btn').addEventListener('click', showTripList)

  // 내보내기/가져오기
  document.getElementById('export-btn').addEventListener('click', handleExport)
  document.getElementById('pdf-btn').addEventListener('click', handlePdfDownload)
  document.getElementById('share-btn').addEventListener('click', handleShare)
  document.getElementById('alarm-btn').addEventListener('click', handleAlarm)
  document.getElementById('import-file').addEventListener('change', handleImport)

  // 검색
  document.getElementById('f-search').addEventListener('input', (e) => {
    const q = e.target.value.trim()
    clearTimeout(searchTimer)
    if (q.length < 2) { hideSearchResults(); return }
    document.getElementById('search-status').textContent = '검색 중...'
    searchTimer = setTimeout(() => searchPlace(q), 500)
  })
  document.getElementById('f-search').addEventListener('blur', () => setTimeout(hideSearchResults, 200))

  // 외부 링크 추가 버튼
  document.getElementById('add-link-btn').addEventListener('click', addExternalLink)

  // 파일 업로드
  document.getElementById('f-files').addEventListener('change', handleFileUpload)

  // 시간 드롭다운 미리보기
  document.getElementById('f-arrive').addEventListener('change', updateDepartPreview)
  document.getElementById('f-stay').addEventListener('change', updateDepartPreview)

  // 이동수단 변경 → OSRM 자동 소요시간 계산 (도보/자동차/우버)
  document.getElementById('f-transport').addEventListener('change', autoCalcDuration)

  // 전역 핸들러
  window.__editPoint  = (id) => openPointModal(id)
  window.__openGmaps  = async (id) => {
    const tripId = getActiveTripId()
    const points = await loadPoints(tripId)
    const idx    = points.findIndex(p => p.id === Number(id))
    if (idx < 0 || idx >= points.length - 1) return
    const url = googleMapsUrl(points[idx], points[idx + 1], points[idx].transport_to_next)
    window.open(url, '_blank')
  }

  // ESC / 배경클릭 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (document.getElementById('modal-overlay').classList.contains('open')) closeModal()
    if (document.getElementById('trip-modal-overlay').classList.contains('open')) closeTripModal()
  })
  document.getElementById('modal-overlay').addEventListener('click',      (e) => { if (e.target === e.currentTarget) closeModal() })
  document.getElementById('trip-modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeTripModal() })

  // ?share= 파라미터 감지 → 읽기전용으로 공유 여행 열기
  const shareId = new URLSearchParams(location.search).get('share')
  if (shareId) {
    await handleSharedTrip(shareId)
    return
  }

  const activeId = getActiveTripId()
  if (activeId) {
    const trips = await loadTrips()
    if (trips.find(t => t.id === activeId)) { showPointList(activeId); return }
  }
  showTripList()
}

// ── 뷰 전환 ─────────────────────────────────────────
async function showTripList() {
  currentView = 'trips'
  setActiveTripId(null)
  currentDayFilter = null

  document.getElementById('back-btn').style.display = 'none'
  document.getElementById('sidebar-subtitle').textContent = 'TRAVEL PLANNER'
  document.getElementById('add-btn').textContent = '+ 여행 추가'
  document.getElementById('map-hint').textContent = '여행을 선택하거나 새로 만드세요'
  document.getElementById('export-btn').style.display = 'none'
  document.getElementById('pdf-btn').style.display = 'none'
  document.getElementById('share-btn').style.display = 'none'
  document.getElementById('alarm-btn').style.display = 'none'
  document.getElementById('summary-panel').style.display = 'none'

  clearMap()
  const trips = await loadTrips()
  renderTripList(trips, {
    onSelect: showPointList,
    onEdit:   openTripModal,
    onDelete: async (id) => {
      const trips = await loadTrips()
      const trip  = trips.find(t => t.id === id)
      if (!confirm(`"${trip?.name}" 여행을 삭제할까요?\n포함된 장소도 모두 삭제됩니다.`)) return
      await deleteTrip(id)
      showTripList()
    }
  })
}

async function showPointList(tripId) {
  currentView = 'points'
  setActiveTripId(tripId)
  currentDayFilter = null

  const trips = await loadTrips()
  const trip  = trips.find(t => t.id === tripId)

  document.getElementById('back-btn').style.display = 'block'
  document.getElementById('sidebar-subtitle').textContent = trip?.name || ''
  document.getElementById('add-btn').textContent = '+ 장소 추가'
  document.getElementById('map-hint').textContent = '+ 장소 추가 버튼으로 장소를 추가하세요'
  document.getElementById('export-btn').style.display = 'block'
  document.getElementById('pdf-btn').style.display = 'block'
  document.getElementById('share-btn').style.display = 'block'
  document.getElementById('alarm-btn').style.display = 'block'
  document.getElementById('summary-panel').style.display = 'block'

  await refreshPoints(true)
}

async function refreshPoints(isInitial = false) {
  const tripId = getActiveTripId()
  if (!tripId) return
  const trips  = await loadTrips()
  const trip   = trips.find(t => t.id === tripId)
  const points = await loadPoints(tripId)

  const sidebarCallbacks = {
    onEdit:      openPointModal,
    onMoveUp:    async (id) => { const v = getMapView(); await movePointUp(Number(id));   await recalcTimesAfter(getActiveTripId()); await refreshPoints(); setMapView(v) },
    onMoveDown:  async (id) => { const v = getMapView(); await movePointDown(Number(id)); await recalcTimesAfter(getActiveTripId()); await refreshPoints(); setMapView(v) },
    onCopy: async (id) => {
      const tripId = getActiveTripId()
      const points = await loadPoints(tripId)
      const point  = points.find(p => p.id === Number(id))
      if (!point) return
      const copy = { ...point, id: undefined, arrive_time: '', depart_time: '', stay_minutes: 0 }
      await addPoint(tripId, copy)
      refreshPoints()
    },
    onDayFilter: (day) => {
      currentDayFilter = day
      renderSidebar(points, sidebarCallbacks, day)
      renderPoints(points, highlightSidebarItem, day, handleMarkerDragEnd, false)
    },
    onSegmentGmaps: async (fromId) => {
      const tripId = getActiveTripId()
      const pts    = await loadPoints(tripId)
      const idx    = pts.findIndex(p => p.id === Number(fromId))
      if (idx < 0 || idx >= pts.length - 1) return
      const url = googleMapsUrl(pts[idx], pts[idx + 1], pts[idx].transport_to_next)
      window.open(url, '_blank')
    }
  }
  renderSidebar(points, sidebarCallbacks, currentDayFilter)

  renderSummary(trip?.name || '', points)
  await renderPoints(points, highlightSidebarItem, currentDayFilter, handleMarkerDragEnd, isInitial)
}

function highlightSidebarItem(id) {
  document.querySelectorAll('.point-item').forEach(el => {
    el.classList.toggle('active', String(el.dataset.id) === String(id))
  })
}

async function handleMarkerDragEnd(id, lat, lng) {
  await updatePoint(Number(id), { lat, lng })
  await recalcTimesAfter(getActiveTripId())
  flyToPoint(lat, lng)
  await refreshPoints()
}

// ── 공유 링크 ─────────────────────────────────────────
async function handleShare() {
  const tripId = getActiveTripId()
  if (!tripId) return
  const btn = document.getElementById('share-btn')
  btn.textContent = '⏳ 업로드 중...'
  btn.disabled = true

  try {
    const json     = await exportTripJson(tripId)
    await r2ShareUpload(tripId, json)
    const shareUrl = `${location.origin}${location.pathname}?share=${tripId}`
    await navigator.clipboard.writeText(shareUrl)
    btn.textContent = '✅ 복사됨!'
    btn.classList.add('copied')
    setTimeout(() => {
      btn.textContent = '🔗 링크 복사'
      btn.classList.remove('copied')
      btn.disabled = false
    }, 2000)
  } catch(e) {
    alert('공유 링크 생성 실패: ' + e.message)
    btn.textContent = '🔗 링크 복사'
    btn.disabled = false
  }
}

// ── 공유 링크 수신 (읽기전용) ─────────────────────────
async function handleSharedTrip(tripId) {
  try {
    const json   = await r2ShareLoad(tripId)
    const data   = JSON.parse(json)
    const trip   = data.trip
    const points = data.points

    // ── UI 세팅 (읽기전용) ──────────────────────────
    document.getElementById('back-btn').style.display    = 'none'
    document.getElementById('add-btn').style.display     = 'none'
    document.getElementById('export-btn').style.display  = 'none'
    document.getElementById('share-btn').style.display   = 'none'
    document.getElementById('sidebar-subtitle').textContent = trip?.name || '공유된 여행'
    document.getElementById('map-hint').textContent      = '👁 읽기 전용 — 공유된 일정입니다'
    document.getElementById('summary-panel').style.display = 'block'
    document.getElementById('pdf-btn').style.display   = 'block'
    document.getElementById('alarm-btn').style.display = 'block'
    document.getElementById('pdf-btn').onclick = () => handleSharedPdf(trip, points)
    document.getElementById('alarm-btn').onclick = () => handleSharedAlarm(points)

    // ── 상단 배너 ───────────────────────────────────
    const banner = document.createElement('div')
    banner.style.cssText = 'background:#0f3460;color:#3ecfb2;font-size:12px;padding:8px 14px;text-align:center;flex-shrink:0;'
    banner.innerHTML = `📤 공유된 일정: <b>${trip?.name || ''}</b>
      <button onclick="window.__importShared()" style="margin-left:10px;background:#FF3D5A;border:none;border-radius:4px;color:white;font-size:11px;padding:2px 8px;cursor:pointer">내 앱에 저장</button>`
    document.getElementById('sidebar').insertBefore(banner, document.getElementById('summary-panel'))

    renderSummary(trip?.name || '', points)
    await renderPoints(points, () => {}, null, null, true, true)

    let sharedDayFilter = null
    renderSharedSidebar(points, sharedDayFilter)

    window.__sharedDayFilter = (day) => {
      sharedDayFilter = day
      renderSharedSidebar(points, day)
      renderPoints(points, () => {}, day, null, false, true)
    }

    window.__importShared = async () => {
      if (!confirm(`"${trip?.name}" 여행을 내 앱에 저장할까요?`)) return
      const newTrip = await importTripJson(json)
      alert(`"${newTrip.name}" 저장 완료!`)
      history.replaceState({}, '', location.pathname)
      location.reload()
    }

  } catch(e) {
    document.getElementById('map-hint').textContent = '공유 링크를 불러올 수 없어요'
    alert('공유 데이터 로드 실패: ' + e.message)
  }
}

// ── 공유 뷰 사이드바 렌더 ────────────────────────────
function renderSharedSidebar(points, activeDayFilter = null) {
  const list = document.getElementById('point-list')
  list.innerHTML = ''

  const days = [...new Set(points.map(p => p.day || 1))].sort((a, b) => a - b)

  if (days.length > 1) {
    const bar = document.createElement('div')
    bar.className = 'day-filter-bar'
    const allBtn = document.createElement('button')
    allBtn.className = activeDayFilter === null ? 'day-filter-btn active' : 'day-filter-btn'
    allBtn.textContent = '전체'
    allBtn.dataset.day = 'all'
    bar.appendChild(allBtn)
    days.forEach(d => {
      const btn = document.createElement('button')
      btn.className = activeDayFilter === d ? 'day-filter-btn active' : 'day-filter-btn'
      btn.textContent = `${d}일차`
      btn.dataset.day = d
      bar.appendChild(btn)
    })
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.day-filter-btn')
      if (!btn) return
      const day = btn.dataset.day === 'all' ? null : Number(btn.dataset.day)
      window.__sharedDayFilter(day)
    })
    list.appendChild(bar)
  }

  const grouped = {}
  points.forEach(p => { const d = p.day || 1; (grouped[d] = grouped[d] || []).push(p) })
  const TC = { departure:'#95A5A6', airport:'#2980B9', hotel:'#E74C3C', food:'#E67E22', attraction:'#2ECC71', shopping:'#F39C12', transport:'#8E44AD', other:'#607D8B' }
  const TL = { departure:'🏠 출발지', airport:'✈️ 공항', hotel:'🏨 숙소', food:'🍽️ 식당', attraction:'🗺️ 관광지', shopping:'🛍️ 쇼핑', transport:'🚌 교통', other:'📍 기타' }
  const TRL = { walk:'🚶 도보', car:'🚗 자동차', uber:'🚕 우버/택시', transit:'🚌 버스/전철', flight:'✈️ 비행기' }
  const TRC = { walk:'#2ECC71', car:'#2980B9', uber:'#2980B9', transit:'#8E44AD', flight:'#95A5A6' }
  function fmtD(m) { if(!m)return''; const h=Math.floor(m/60),r=m%60; return h&&r?`${h}시간 ${r}분`:h?`${h}시간`:`${r}분` }

  Object.keys(grouped).map(Number).sort((a,b)=>a-b).forEach(day => {
    if (activeDayFilter !== null && day !== activeDayFilter) return
    const dayPts = grouped[day]
    const div = document.createElement('div')
    div.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 4px 6px;font-size:11px;font-weight:700;color:#FF3D5A;letter-spacing:1px;'
    div.innerHTML = `<span>${day}일차</span><div style="flex:1;height:1px;background:#1e1e3a;"></div>`
    list.appendChild(div)

    dayPts.forEach((point) => {
      const globalIdx = points.findIndex(p => p.id === point.id)
      const isLast    = globalIdx === points.length - 1
      const color     = TC[point.type] || '#607D8B'
      const timeStr   = [point.arrive_time, point.depart_time].filter(Boolean).join(' ~ ')
      const linksHtml = (point.external_links || []).map(l => {
        const isR2 = l.url && l.url.includes('r2.cloudflarestorage.com')
        if (isR2) {
          const key = l.url.split('/jaewalk-files/')[1]
          return `<a href="#" data-r2key="${encodeURIComponent(key)}" style="color:#FF3D5A;font-size:11px;display:block">🔗 ${l.label || l.url}</a>`
        }
        return `<a href="${l.url}" target="_blank" style="color:#FF3D5A;font-size:11px;display:block">🔗 ${l.label || l.url}</a>`
      }).join('')

      const item = document.createElement('div')
      item.className = 'point-item'
      item.dataset.id = point.id
      item.innerHTML = `
        <div class="point-header">
          <div class="point-dot" style="background:${color}"></div>
          <div class="point-name">${globalIdx + 1}. ${point.name}</div>
        </div>
        <div class="point-meta">
          ${timeStr ? `<span class="point-time">⏰ ${timeStr}</span>` : ''}
          ${point.tag ? `<span style="color:#888">${point.tag}</span>` : ''}
          <span style="color:#555">${TL[point.type] || ''}</span>
        </div>
        ${point.note ? `<div style="font-size:11px;color:#666;margin-top:3px;padding:0 2px">${point.note}</div>` : ''}
        ${linksHtml ? `<div style="margin-top:3px">${linksHtml}</div>` : ''}`
      list.appendChild(item)

      item.querySelectorAll('a[data-r2key]').forEach(a => {
        a.addEventListener('click', async (e) => {
          e.preventDefault()
          try {
            const key = decodeURIComponent(a.dataset.r2key)
            const blobUrl = await r2OpenFile(key)
            window.open(blobUrl, '_blank')
          } catch {
            alert('파일을 열 수 없습니다.')
          }
        })
      })

      if (!isLast) {
        const next = points[globalIdx + 1]
        const isDayBreak = (next?.day || 1) !== day
        const seg = document.createElement('div')
        seg.className = 'segment-item'
        if (isDayBreak) {
          seg.innerHTML = `<div class="segment-line" style="background:#1e1e3a;height:30px;"></div>
            <div class="segment-info" style="color:#333;font-size:11px;">─ 다음 일차로 ─</div>`
        } else if (point.transport_to_next) {
          const segColor = TRC[point.transport_to_next] || '#555'
          const dur = point.duration_minutes ? ` · ${fmtD(point.duration_minutes)}` : ''
          const cost = point.cost ? ` · $${point.cost}` : ''
          seg.innerHTML = `<div class="segment-line" style="background:${segColor}"></div>
            <div class="segment-info" style="cursor:pointer;display:flex;align-items:center;gap:4px;">
              <span>${TRL[point.transport_to_next] || ''}</span>
              <span style="color:#555">${dur}${cost}</span>
              <span style="color:#3ecfb2;font-size:10px;margin-left:4px;">🗺</span>
            </div>`
          seg.title = '클릭 → 구글지도'
          seg.style.cursor = 'pointer'
          seg.addEventListener('click', () => window.open(googleMapsUrl(point, next, point.transport_to_next), '_blank'))
        } else {
          seg.innerHTML = `<div class="segment-line" style="background:#2a2a4a"></div>
            <div class="segment-info" style="color:#444;font-size:11px;">이동수단 미입력</div>`
        }
        list.appendChild(seg)
      }
    })
  })
}

// ── 공유 뷰 PDF ──────────────────────────────────────
async function handleSharedPdf(trip, points) {
  const btn = document.getElementById('pdf-btn')
  btn.textContent = '⏳ 생성 중...'; btn.disabled = true
  try {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
    const fontB64 = await loadNanumGothic()
    doc.addFileToVFS('NanumGothic.ttf', fontB64)
    doc.addFont('NanumGothic.ttf', 'NanumGothic', 'normal')
    doc.setFont('NanumGothic')
    const PAGE_W=210,PAGE_H=297,ML=10,MR=10,MT=16,COL_W=PAGE_W-ML-MR
    let y=MT
    const TK={walk:'도보',car:'자동차',uber:'우버/택시',transit:'버스/전철',flight:'비행기'}
    const TYK={departure:'출발지',airport:'공항',hotel:'숙소',food:'식당',attraction:'관광지',shopping:'쇼핑',transport:'교통',other:'기타'}
    function fd(m){if(!m)return'';const h=Math.floor(m/60),r=m%60;return h&&r?`${h}시간 ${r}분`:h?`${h}시간`:`${r}분`}
    function cp(n=10){if(y+n>PAGE_H-14){doc.addPage();doc.setFont('NanumGothic');y=MT}}
    const C={num:{x:ML,w:6},name:{x:ML+6,w:52},type:{x:ML+58,w:16},arr:{x:ML+74,w:14},dep:{x:ML+88,w:14},trans:{x:ML+102,w:20},dur:{x:ML+122,w:16},cost:{x:ML+138,w:12},note:{x:ML+150,w:COL_W-150}}
    const ROW_H=7
    function th(){doc.setFillColor(15,52,96);doc.rect(ML,y,COL_W,ROW_H,'F');doc.setTextColor(200,220,240);doc.setFontSize(7);[['#',C.num],['장소',C.name],['유형',C.type],['도착',C.arr],['출발',C.dep],['이동수단',C.trans],['소요',C.dur],['비용',C.cost],['메모',C.note]].forEach(([l,c])=>doc.text(l,c.x+1,y+5));y+=ROW_H}
    function tr(num,pt,even){if(even){doc.setFillColor(245,247,252);doc.rect(ML,y,COL_W,ROW_H,'F')}
      doc.setTextColor(60,60,80);doc.setFontSize(8)
      function ct(t,c){const s=doc.splitTextToSize(String(t),c.w-2)[0]||'';doc.text(s,c.x+1,y+5)}
      doc.setTextColor(100,100,120);ct(num,C.num);doc.setTextColor(26,26,46);doc.setFontSize(8);ct(pt.name,C.name);doc.setFontSize(7);doc.setTextColor(120,120,140);ct(TYK[pt.type]||pt.type||'',C.type);doc.setTextColor(41,128,185);ct(pt.arrive_time||'',C.arr);ct(pt.depart_time||'',C.dep);doc.setTextColor(142,68,173);ct(TK[pt.transport_to_next]||'',C.trans);doc.setTextColor(80,80,100);ct(fd(pt.duration_minutes),C.dur);doc.setTextColor(231,76,60);ct(pt.cost?`$${pt.cost}`:'',C.cost);doc.setTextColor(85,85,85);doc.setFontSize(7);ct([pt.tag,pt.note].filter(Boolean).join(' | '),C.note);doc.setDrawColor(220,225,235);doc.line(ML,y+ROW_H,ML+COL_W,y+ROW_H);y+=ROW_H}
    doc.setFillColor(10,40,80);doc.rect(0,0,PAGE_W,20,'F');doc.setTextColor(255,255,255);doc.setFontSize(14);doc.text(trip.name||'여행 일정',ML,13);doc.setFontSize(8);doc.setTextColor(160,190,220);doc.text('Generated by JaeWalk',PAGE_W-MR,13,{align:'right'});y=26
    const grp={};points.forEach(p=>{const d=p.day||1;(grp[d]=grp[d]||[]).push(p)})
    for(const day of Object.keys(grp).map(Number).sort((a,b)=>a-b)){
      cp(ROW_H*3);doc.setFillColor(30,30,60);doc.rect(ML,y,COL_W,6,'F');doc.setTextColor(255,200,100);doc.setFontSize(9);doc.text(`Day ${day}`,ML+2,y+4.5);y+=8;th()
      grp[day].forEach((pt,idx)=>{cp(ROW_H+2);tr(points.findIndex(p=>p.id===pt.id)+1,pt,idx%2===1)});y+=4}
    const pc=doc.getNumberOfPages();for(let i=1;i<=pc;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(180,180,180);doc.text(`${i} / ${pc}`,PAGE_W-MR,PAGE_H-6,{align:'right'})}
    doc.save(`${(trip.name||'trip').replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.pdf`)
  } catch(e){alert('PDF 생성 실패: '+e.message)}
  finally{btn.textContent='📄 PDF 다운로드';btn.disabled=false}
}

// ── 공유 뷰 알림 ─────────────────────────────────────
let _sharedAlarmTimers = []
let _sharedAlarmActive = false
async function handleSharedAlarm(points) {
  const btn = document.getElementById('alarm-btn')
  if (_sharedAlarmActive) {
    _sharedAlarmTimers.forEach(t => clearTimeout(t)); _sharedAlarmTimers = []; _sharedAlarmActive = false
    btn.classList.remove('active'); btn.textContent = '🔔 알림 설정'; return
  }
  if (!('Notification' in window)) { alert('이 브라우저는 알림을 지원하지 않아요.'); return }
  let perm = Notification.permission
  if (perm === 'denied') { alert('알림이 차단되어 있어요. 브라우저 설정에서 허용해주세요.'); return }
  if (perm !== 'granted') perm = await Notification.requestPermission()
  if (perm !== 'granted') return
  const ADVANCE_MIN = 5, now = new Date()
  let scheduled = 0
  points.forEach((pt, idx) => {
    if (!pt.depart_time) return
    const [h, m] = pt.depart_time.split(':').map(Number)
    const target = new Date(now); target.setHours(h, m - ADVANCE_MIN, 0, 0)
    const delay = target - now
    if (delay <= 0) return
    const timer = setTimeout(() => {
      const nextPt = points[idx + 1]
      new Notification(`🗺 JaeWalk — 출발 ${ADVANCE_MIN}분 전`, {
        body: nextPt ? `${pt.name} → ${nextPt.name}` : `${pt.name} 출발 준비`,
        icon: '/icons/icon-192.png', silent: false
      })
    }, delay)
    _sharedAlarmTimers.push(timer); scheduled++
  })
  if (scheduled === 0) { alert('오늘 스케줄에서 알림을 등록할 출발 시간이 없어요.'); return }
  _sharedAlarmActive = true; btn.classList.add('active'); btn.textContent = `🔔 알림 ON (${scheduled}개)`
}

// ── 알림 기능 ─────────────────────────────────────────
// 포인트별 타이머 ID 저장
let _alarmTimers = []
let _alarmActive = false

async function handleAlarm() {
  const btn = document.getElementById('alarm-btn')

  // 이미 알림 활성화 중이면 취소
  if (_alarmActive) {
    _alarmTimers.forEach(t => clearTimeout(t))
    _alarmTimers = []
    _alarmActive = false
    btn.classList.remove('active')
    btn.textContent = '🔔 알림 설정'
    return
  }

  // 알림 권한 요청
  if (!('Notification' in window)) {
    alert('이 브라우저는 알림을 지원하지 않아요.\n안드로이드 Chrome에서 홈 화면 앱으로 설치 후 사용하세요.')
    return
  }

  let perm = Notification.permission
  if (perm === 'denied') {
    alert('알림이 차단되어 있어요.\n브라우저 설정에서 jaewalk.pages.dev 알림을 허용해주세요.')
    return
  }
  if (perm !== 'granted') {
    perm = await Notification.requestPermission()
  }
  if (perm !== 'granted') return

  // 오늘 날짜 기준 포인트 스케줄 등록
  const tripId = getActiveTripId()
  if (!tripId) return
  const points = await loadPoints(tripId)

  const ADVANCE_MIN = 5  // 출발 5분 전 알림
  const now = new Date()
  let scheduled = 0

  points.forEach((pt, idx) => {
    if (!pt.depart_time) return  // depart_time 없으면 스킵
    const [h, m] = pt.depart_time.split(':').map(Number)
    const target = new Date(now)
    target.setHours(h, m - ADVANCE_MIN, 0, 0)
    const delay = target - now
    if (delay <= 0) return  // 이미 지난 시간은 스킵

    const timer = setTimeout(() => {
      const nextPt = points[idx + 1]
      const title = `🗺 JaeWalk — 출발 ${ADVANCE_MIN}분 전`
      const body  = nextPt
        ? `${pt.name} → ${nextPt.name} (${pt.transport_to_next ? pt.transport_to_next : '이동'})`
        : `${pt.name} 출발 준비`

      // 소리 있는 알림 (앱 설치 환경에서 기본 소리 재생됨)
      new Notification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        silent: false
      })
    }, delay)

    _alarmTimers.push(timer)
    scheduled++
  })

  if (scheduled === 0) {
    alert('오늘 스케줄에서 알림을 등록할 출발 시간이 없어요.\n포인트에 도착/체류 시간을 입력해주세요.')
    return
  }

  _alarmActive = true
  btn.classList.add('active')
  btn.textContent = `🔔 알림 ON (${scheduled}개)`
}

// ── 내보내기 / 가져오기 ─────────────────────────────
async function handleExport() {
  const tripId = getActiveTripId()
  if (!tripId) return
  const json = await exportTripJson(tripId)
  const blob = new Blob([json], { type: 'application/json' })
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `jaewalk_${tripId}_${new Date().toISOString().slice(0,10)}.json`
  })
  a.click()
}

async function handlePdfDownload() {
  const tripId = getActiveTripId()
  if (!tripId) return
  const btn = document.getElementById('pdf-btn')
  btn.textContent = '⏳ 생성 중...'
  btn.classList.add('loading')
  btn.disabled = true
  try {
    const json   = await exportTripJson(tripId)
    const data   = JSON.parse(json)
    const trip   = data.trip
    const points = data.points

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

    // ── 나눔고딕 폰트 (한글+영어 모두 지원, 앱 세션 중 캐싱) ──
    const fontB64 = await loadNanumGothic()
    doc.addFileToVFS('NanumGothic.ttf', fontB64)
    doc.addFont('NanumGothic.ttf', 'NanumGothic', 'normal')
    doc.setFont('NanumGothic')

    const PAGE_W = 210, PAGE_H = 297
    const ML = 10, MR = 10, MT = 16
    const COL_W = PAGE_W - ML - MR
    let y = MT

    const TRANSPORT_KO = { walk:'도보', car:'자동차', uber:'우버/택시', transit:'버스/전철', flight:'비행기' }
    const TYPE_KO      = { departure:'출발지', airport:'공항', hotel:'숙소', food:'식당', attraction:'관광지', shopping:'쇼핑', transport:'교통', other:'기타' }

    function fmtDurPdf(m) {
      if (!m) return ''
      const h = Math.floor(m / 60), r = m % 60
      return h && r ? `${h}시간 ${r}분` : h ? `${h}시간` : `${r}분`
    }

    function checkPage(needed = 10) {
      if (y + needed > PAGE_H - 14) { doc.addPage(); doc.setFont('NanumGothic'); y = MT }
    }

    // 테이블 컬럼 정의 (x위치, 너비)
    // #(6) | 장소명(52) | 유형(16) | 도착(14) | 출발(14) | 이동수단(20) | 소요(16) | 비용(12) | 메모(나머지)
    const C = {
      num:   { x: ML,       w: 6  },
      name:  { x: ML+6,     w: 52 },
      type:  { x: ML+58,    w: 16 },
      arr:   { x: ML+74,    w: 14 },
      dep:   { x: ML+88,    w: 14 },
      trans: { x: ML+102,   w: 20 },
      dur:   { x: ML+122,   w: 16 },
      cost:  { x: ML+138,   w: 12 },
      note:  { x: ML+150,   w: COL_W-150 },
    }
    const ROW_H = 7

    function tableHeader() {
      doc.setFillColor(15, 52, 96)
      doc.rect(ML, y, COL_W, ROW_H, 'F')
      doc.setTextColor(200, 220, 240)
      doc.setFontSize(7)
      const headers = [
        ['#', C.num], ['장소', C.name], ['유형', C.type],
        ['도착', C.arr], ['출발', C.dep], ['이동수단', C.trans],
        ['소요', C.dur], ['비용', C.cost], ['메모', C.note]
      ]
      headers.forEach(([label, col]) => {
        doc.text(label, col.x + 1, y + 5)
      })
      y += ROW_H
    }

    function tableRow(num, pt, isEven) {
      // 행 배경
      if (isEven) {
        doc.setFillColor(245, 247, 252)
        doc.rect(ML, y, COL_W, ROW_H, 'F')
      }

      doc.setTextColor(60, 60, 80)
      doc.setFontSize(8)

      const timeArr  = pt.arrive_time  || ''
      const timeDep  = pt.depart_time  || ''
      const transStr = TRANSPORT_KO[pt.transport_to_next] || ''
      const durStr   = fmtDurPdf(pt.duration_minutes)
      const costStr  = pt.cost ? `$${pt.cost}` : ''
      const typeStr  = TYPE_KO[pt.type] || pt.type || ''

      // 메모 (태그 + 메모 합치기)
      const noteParts = [pt.tag, pt.note].filter(Boolean)
      const noteStr   = noteParts.join(' | ')

      // 각 셀 텍스트 (너비 초과 시 잘라냄)
      function cellText(text, col) {
        const truncated = doc.splitTextToSize(String(text), col.w - 2)[0] || ''
        doc.text(truncated, col.x + 1, y + 5)
      }

      doc.setTextColor(100, 100, 120)
      cellText(num, C.num)
      doc.setTextColor(26, 26, 46)
      doc.setFontSize(8)
      cellText(pt.name, C.name)
      doc.setFontSize(7)
      doc.setTextColor(120, 120, 140)
      cellText(typeStr, C.type)
      doc.setTextColor(41, 128, 185)
      cellText(timeArr, C.arr)
      cellText(timeDep, C.dep)
      doc.setTextColor(142, 68, 173)
      cellText(transStr, C.trans)
      doc.setTextColor(80, 80, 100)
      cellText(durStr, C.dur)
      doc.setTextColor(231, 76, 60)
      cellText(costStr, C.cost)
      doc.setTextColor(85, 85, 85)
      doc.setFontSize(7)
      cellText(noteStr, C.note)

      // 행 구분선
      doc.setDrawColor(220, 225, 235)
      doc.line(ML, y + ROW_H, ML + COL_W, y + ROW_H)
      y += ROW_H
    }

    // ── 헤더 ──────────────────────────────────────────
    doc.setFillColor(10, 40, 80)
    doc.rect(0, 0, PAGE_W, 20, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.text(trip.name || '여행 일정', ML, 13)
    doc.setFontSize(8)
    doc.setTextColor(160, 190, 220)
    doc.text(`Generated by JaeWalk`, PAGE_W - MR, 13, { align: 'right' })
    y = 26

    // ── 일차별 포인트 테이블 ──────────────────────────
    const grouped = {}
    points.forEach(p => { const d = p.day || 1; (grouped[d] = grouped[d] || []).push(p) })

    for (const day of Object.keys(grouped).map(Number).sort((a,b)=>a-b)) {
      checkPage(ROW_H * 3)

      // 일차 헤더
      doc.setFillColor(30, 30, 60)
      doc.rect(ML, y, COL_W, 6, 'F')
      doc.setTextColor(255, 200, 100)
      doc.setFontSize(9)
      doc.text(`Day ${day}`, ML + 2, y + 4.5)
      y += 8

      tableHeader()

      grouped[day].forEach((pt, idx) => {
        checkPage(ROW_H + 2)
        const globalIdx = points.findIndex(p => p.id === pt.id)
        tableRow(globalIdx + 1, pt, idx % 2 === 1)
      })

      y += 4
    }

    // ── 푸터 ──────────────────────────────────────────
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setTextColor(180, 180, 180)
      doc.text(`${i} / ${pageCount}`, PAGE_W - MR, PAGE_H - 6, { align: 'right' })
    }

    // ── 저장 ──────────────────────────────────────────
    const name = (trip.name || 'trip').replace(/\s+/g, '_')
    doc.save(`${name}_${new Date().toISOString().slice(0,10)}.pdf`)

  } catch(e) {
    alert('PDF 생성 실패: ' + e.message)
  } finally {
    btn.textContent = '📄 PDF 다운로드'
    btn.classList.remove('loading')
    btn.disabled = false
  }
}

async function handleImport(e) {
  const file = e.target.files[0]
  if (!file) return
  const text = await file.text()
  try {
    const newTrip = await importTripJson(text)
    alert(`"${newTrip.name}" 가져오기 완료!`)
    showTripList()
  } catch {
    alert('파일 형식이 올바르지 않습니다.')
  }
  e.target.value = ''
}

// ── 여행 모달 ────────────────────────────────────────
function openTripModal(id) {
  editingTripId = id
  document.getElementById('tf-name').value = ''
  document.getElementById('tf-desc').value = ''
  document.getElementById('trip-modal-title').textContent = id ? '여행 수정' : '새 여행'
  document.getElementById('trip-btn-delete').style.display = id ? 'block' : 'none'

  if (id) {
    loadTrips().then(trips => {
      const trip = trips.find(t => t.id === id)
      if (trip) {
        document.getElementById('tf-name').value = trip.name || ''
        document.getElementById('tf-desc').value = trip.description || ''
      }
    })
  }
  document.getElementById('trip-modal-overlay').classList.add('open')
  setTimeout(() => document.getElementById('tf-name').focus(), 50)
}

window.closeTripModal = () => {
  document.getElementById('trip-modal-overlay').classList.remove('open')
  editingTripId = null
}

window.saveTripModal = async () => {
  const name = document.getElementById('tf-name').value.trim()
  if (!name) { alert('여행 이름을 입력해주세요.'); return }
  const desc = document.getElementById('tf-desc').value.trim()

  if (editingTripId) {
    await updateTrip(editingTripId, { name, description: desc })
    closeTripModal()
    if (currentView === 'trips') showTripList()
    else { document.getElementById('sidebar-subtitle').textContent = name }
  } else {
    const trip = await addTrip({ name, description: desc })
    closeTripModal()
    showPointList(trip.id)
  }
}

window.deleteTripModal = async () => {
  if (!editingTripId) return
  const trips = await loadTrips()
  const trip  = trips.find(t => t.id === editingTripId)
  if (!confirm(`"${trip?.name}" 여행을 삭제할까요?\n포함된 장소도 모두 삭제됩니다.`)) return
  await deleteTrip(editingTripId)
  closeTripModal()
  showTripList()
}

// ── 장소 검색 (전세계) ───────────────────────────────
async function searchPlace(query) {
  try {
    // countrycodes 없이 전세계 검색, 한국/캐나다/미국/일본 우선 결과를 위해 viewbox 없이 전송
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=7&addressdetails=1&accept-language=ko,en`
    const res = await fetch(url)
    const results = await res.json()
    document.getElementById('search-status').textContent = results.length ? `${results.length}개 결과` : '결과 없음'
    showSearchResults(results)
  } catch {
    document.getElementById('search-status').textContent = '검색 실패'
  }
}

function showSearchResults(results) {
  const box = document.getElementById('search-results')
  box.innerHTML = ''

  if (!results.length) {
    box.innerHTML = `<div style="padding:12px;font-size:12px;color:#888;">결과 없음 — 영어 또는 현지어로 입력해보세요</div>`
    box.style.display = 'block'
    return
  }

  results.forEach(r => {
    const item = document.createElement('div')
    item.style.cssText = 'padding:10px 12px;cursor:pointer;border-bottom:1px solid #0f3460;font-size:13px;'
    const name    = r.namedetails?.name || r.display_name.split(',')[0]
    const address = r.display_name
    const country = r.address?.country || ''
    item.innerHTML = `
      <div style="font-weight:600;color:white;margin-bottom:2px">${name}</div>
      <div style="font-size:11px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${address}</div>`
    item.addEventListener('mouseover', () => item.style.background = '#1e1e3a')
    item.addEventListener('mouseout',  () => item.style.background = 'transparent')
    item.addEventListener('mousedown', () => {
      const lat = parseFloat(r.lat), lng = parseFloat(r.lon)
      const nameInput = document.getElementById('f-name')
      if (!nameInput.value) nameInput.value = name
      setPendingLocation(lat, lng)
      flyToPoint(lat, lng)
      document.getElementById('f-search').value = address.substring(0, 60)
      document.getElementById('search-status').textContent = `위치 지정됨 (${country})`
      hideSearchResults()
    })
    box.appendChild(item)
  })
  box.style.display = 'block'
}

function hideSearchResults() {
  document.getElementById('search-results').style.display = 'none'
}

// ── 미리보기 마커 ────────────────────────────────────
function setPendingLocation(lat, lng) {
  pendingLatLng = { lat, lng }
  if (previewMarker) { mapInstance.removeLayer(previewMarker); previewMarker = null }

  previewMarker = L.marker([lat, lng], { draggable: true, opacity: 0.8, zIndexOffset: 1000 }).addTo(mapInstance)
  previewMarker.bindTooltip('드래그해서 위치 조정', { permanent: false })
  previewMarker.on('dragstart', () => mapInstance.dragging.disable())
  previewMarker.on('drag',    e => { const p = e.target.getLatLng(); pendingLatLng = { lat: p.lat, lng: p.lng } })
  previewMarker.on('dragend', e => {
    mapInstance.dragging.enable()
    const p = e.target.getLatLng(); pendingLatLng = { lat: p.lat, lng: p.lng }
    // 위치 드래그 후 이동수단 이미 선택돼 있으면 자동 재계산
    if (document.getElementById('f-transport').value) autoCalcDuration()
  })
  document.getElementById('location-confirm').style.display = 'block'

  // 위치 확정 시 이동수단 이미 선택돼 있으면 자동계산
  if (document.getElementById('f-transport').value) autoCalcDuration()
}

function clearPreviewMarker() {
  if (previewMarker) { mapInstance.removeLayer(previewMarker); previewMarker = null }
}

// ── 외부 링크 관리 ───────────────────────────────────
function addExternalLink() {
  const url   = document.getElementById('link-url').value.trim()
  const label = document.getElementById('link-label').value.trim()
  if (!url) { alert('URL을 입력해주세요.'); return }
  pendingLinks.push({ url, label: label || url })
  document.getElementById('link-url').value   = ''
  document.getElementById('link-label').value = ''
  renderLinkList()
}

function renderLinkList() {
  const box = document.getElementById('link-list')
  box.innerHTML = ''
  pendingLinks.forEach((l, i) => {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;font-size:12px;'
    row.innerHTML = `
      <span style="flex:1;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🔗 ${l.label}</span>
      <button onclick="window.__removeLink(${i})" style="background:transparent;border:none;color:#555;cursor:pointer;font-size:13px;">✕</button>`
    box.appendChild(row)
  })
}

window.__removeLink = (i) => {
  pendingLinks.splice(i, 1)
  renderLinkList()
}

// ── R2 파일 업로드 ───────────────────────────────────
async function handleFileUpload(e) {
  const tripId = getActiveTripId()
  if (!tripId || !editingId) return
  const files = [...e.target.files]
  const statusEl = document.getElementById('file-status')
  statusEl.textContent = '업로드 중...'

  for (const file of files) {
    try {
      const url = await r2Upload(tripId, `${editingId}_${file.name}`, file)
      pendingLinks.push({ url, label: file.name })
    } catch (err) {
      statusEl.textContent = `업로드 실패: ${err.message}`
      return
    }
  }

  statusEl.textContent = `${files.length}개 업로드 완료`
  renderLinkList()
  e.target.value = ''
}

// ── R2 파일 목록 로드 ────────────────────────────────
async function loadR2Files() {
  const tripId = getActiveTripId()
  if (!tripId || !editingId) return
  try {
    const files = await r2ListFiles(tripId)
    const myFiles = files.filter(f => f.filename.startsWith(`${editingId}_`))
    myFiles.forEach(f => {
      const label = f.filename.replace(`${editingId}_`, '')
      if (!pendingLinks.find(l => l.url === f.url)) {
        pendingLinks.push({ url: f.url, label })
      }
    })
    renderLinkList()
  } catch { /* R2 연결 안 되면 조용히 스킵 */ }
}

// ── 시간 드롭다운 채우기 ─────────────────────────────
function populateTimeDropdowns() {
  const arriveEl = document.getElementById('f-arrive')
  const stayEl   = document.getElementById('f-stay')
  if (!arriveEl || !stayEl) return

  // 도착 시간: 5분 간격 전체 하루 + 빈 옵션
  if (arriveEl.options.length <= 1) {
    arriveEl.innerHTML = '<option value="">-</option>'
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 5) {
        const hh = String(h).padStart(2, '0')
        const mm = String(m).padStart(2, '0')
        const val = `${hh}:${mm}`
        arriveEl.appendChild(new Option(val, val))
      }
    }
  }

  // 체류 시간: 10분 단위 최대 5시간
  if (stayEl.options.length <= 1) {
    stayEl.innerHTML = '<option value="">-</option>'
    const steps = [10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200,210,220,230,240,250,260,270,280,290,300]
    steps.forEach(m => {
      const h = Math.floor(m / 60), r = m % 60
      const label = h && r ? `${h}시간 ${r}분` : h ? `${h}시간` : `${r}분`
      stayEl.appendChild(new Option(label, m))
    })
  }
}

// 이동수단 변경 시 OSRM으로 소요시간 자동계산 (도보/자동차/우버)
async function autoCalcDuration() {
  const transport = document.getElementById('f-transport').value
  const status    = document.getElementById('duration-auto-status')

  // 대중교통/비행기/미선택은 자동계산 안 함
  if (!transport || transport === 'transit' || transport === 'flight') {
    if (status) status.textContent = ''
    return
  }

  // 현재 편집 중인 포인트(출발지)와 다음 포인트(목적지) 좌표 필요
  if (!pendingLatLng) { if (status) status.textContent = '위치를 먼저 지정해주세요'; return }

  const tripId = getActiveTripId()
  const points = await loadPoints(tripId)

  // 다음 포인트 찾기: 편집 중이면 현재 포인트의 다음, 신규면 마지막 포인트가 출발지
  let fromPt, toPt
  if (editingId) {
    const idx = points.findIndex(p => p.id === Number(editingId))
    if (idx < 0 || idx >= points.length - 1) {
      if (status) status.textContent = '마지막 장소는 다음 경로 없음'
      return
    }
    fromPt = { lat: pendingLatLng.lat, lng: pendingLatLng.lng }
    toPt   = { lat: points[idx + 1].lat, lng: points[idx + 1].lng }
  } else {
    // 신규 추가: 직전 포인트 → 현재 위치
    if (!prevPointForDuration) {
      if (status) status.textContent = '첫 장소는 이전 경로 없음'
      return
    }
    fromPt = { lat: prevPointForDuration.lat, lng: prevPointForDuration.lng }
    toPt   = { lat: pendingLatLng.lat, lng: pendingLatLng.lng }
  }

  if (status) status.textContent = '⏳ 계산 중...'

  const osrmTransport = (transport === 'walk') ? 'walk' : 'car'
  const route = await fetchOsrmRoute(fromPt, toPt, osrmTransport)

  if (!route) {
    if (status) status.textContent = '경로 없음 (수동 입력)'
    return
  }

  // 초 → 가장 가까운 선택 가능한 분 단위로 반올림
  const rawMin  = Math.ceil(route.duration / 60)
  const options = [5,10,15,20,25,30,45,60,75,90,105,120,150,180,210,240,300,360]
  const nearest = options.reduce((prev, cur) =>
    Math.abs(cur - rawMin) < Math.abs(prev - rawMin) ? cur : prev
  )

  document.getElementById('f-duration').value = nearest
  const distKm = (route.distance / 1000).toFixed(1)
  if (status) status.textContent = `✅ 자동 (${rawMin}분 · ${distKm}km)`
  updateDepartPreview()
}

// 체류시간 변경 시 출발 미리보기 업데이트
function updateDepartPreview() {
  const arrive = document.getElementById('f-arrive').value
  const stay   = parseInt(document.getElementById('f-stay').value) || 0
  const preview = document.getElementById('depart-preview')
  if (!preview) return
  if (arrive && stay) {
    const [h, m] = arrive.split(':').map(Number)
    const total  = h * 60 + m + stay
    const dh = String(Math.floor(total / 60) % 24).padStart(2, '0')
    const dm = String(total % 60).padStart(2, '0')
    preview.textContent = `출발 ${dh}:${dm}`
    preview.style.display = 'block'
  } else {
    preview.style.display = 'none'
  }
}

// ── 시간 연쇄 재계산 ─────────────────────────────────
async function recalcTimesAfter(tripId) {
  const points = await loadPoints(tripId)
  if (!points.length) return

  // 일차별로 분리해서 각각 계산
  const grouped = {}
  points.forEach(p => grouped[p.day || 1] = (grouped[p.day || 1] || []).concat(p))

  for (const dayPts of Object.values(grouped)) {
    dayPts.sort((a, b) => a.order - b.order)
    for (let i = 0; i < dayPts.length; i++) {
      const pt = dayPts[i]
      // 첫 포인트는 arrive_time 그대로 유지
      // depart_time = arrive_time + stay_minutes
      let arrive = pt.arrive_time || ''
      let depart = ''
      if (arrive && pt.stay_minutes) {
        const [h, m] = arrive.split(':').map(Number)
        const total  = h * 60 + m + (pt.stay_minutes || 0)
        depart = `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
      }
      // 다음 포인트 arrive = 현재 depart + duration_minutes
      if (i < dayPts.length - 1 && depart && pt.duration_minutes) {
        const [h, m] = depart.split(':').map(Number)
        const total  = h * 60 + m + (pt.duration_minutes || 0)
        const nextArrive = `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
        const next = dayPts[i + 1]
        // 다음 포인트 arrive_time 업데이트
        if (next.arrive_time !== nextArrive) {
          await updatePoint(next.id, { arrive_time: nextArrive })
          dayPts[i + 1] = { ...next, arrive_time: nextArrive }
        }
      }
      // 현재 포인트 depart_time 업데이트
      if (pt.depart_time !== depart) {
        await updatePoint(pt.id, { depart_time: depart })
      }
    }
  }
}

// ── 장소 모달 ────────────────────────────────────────
async function openPointModal(id) {
  editingId    = id
  pendingLinks = []
  populateTimeDropdowns()
  clearForm()
  document.getElementById('location-confirm').style.display = 'none'

  const title     = document.getElementById('modal-title')
  const deleteBtn = document.getElementById('btn-delete')

  if (id) {
    title.textContent       = '장소 수정'
    deleteBtn.style.display = 'block'
    const tripId = getActiveTripId()
    const points = await loadPoints(tripId)
    const point  = points.find(p => p.id === Number(id))
    if (point) {
      fillForm(point)
      pendingLatLng = { lat: point.lat, lng: point.lng }
      pendingLinks  = [...(point.external_links || [])]
      document.getElementById('location-confirm').style.display = 'block'
    }
    await loadR2Files()
  } else {
    title.textContent       = '장소 추가'
    deleteBtn.style.display = 'none'
    // 신규 추가: 현재 마지막 포인트를 출발지로 저장 (이동수단 선택 시 자동계산에 사용)
    const allPts = await loadPoints(getActiveTripId())
    prevPointForDuration = allPts.length > 0 ? allPts[allPts.length - 1] : null
  }

  renderLinkList()
  document.getElementById('modal-overlay').classList.add('open')
  setTimeout(() => document.getElementById('f-search').focus(), 50)
}

window.closeModal = () => {
  document.getElementById('modal-overlay').classList.remove('open')
  editingId = null; pendingLatLng = null; pendingLinks = []; prevPointForDuration = null
  const status = document.getElementById('duration-auto-status')
  if (status) status.textContent = ''
  clearPreviewMarker(); clearForm(); hideSearchResults()
  document.getElementById('search-status').textContent = ''
  document.getElementById('location-confirm').style.display = 'none'
  document.getElementById('link-list').innerHTML = ''
  document.getElementById('file-status').textContent = ''
}

window.savePoint = async () => {
  const name = document.getElementById('f-name').value.trim()
  if (!name)         { alert('장소명을 입력해주세요.'); return }
  if (!pendingLatLng){ alert('위치를 지정해주세요.'); return }

  const arriveVal = document.getElementById('f-arrive').value
  const stayVal   = parseInt(document.getElementById('f-stay').value) || 0
  let departVal   = ''
  if (arriveVal && stayVal) {
    const [h, m] = arriveVal.split(':').map(Number)
    const total  = h * 60 + m + stayVal
    departVal = `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
  }

  const data = {
    name,
    type:              document.getElementById('f-type').value,
    day:               parseInt(document.getElementById('f-day').value) || 1,
    arrive_time:       arriveVal,
    stay_minutes:      stayVal,
    depart_time:       departVal,
    tag:               document.getElementById('f-tag').value.trim(),
    note:              document.getElementById('f-note').value.trim(),
    transport_to_next: document.getElementById('f-transport').value,
    duration_minutes:  parseInt(document.getElementById('f-duration').value) || 0,
    cost:              parseFloat(document.getElementById('f-cost').value) || 0,
    external_links:    [...pendingLinks],
    lat:               pendingLatLng.lat,
    lng:               pendingLatLng.lng
  }

  const isNew = !editingId
  const savedView = isNew ? null : getMapView()
  const newLat = pendingLatLng.lat, newLng = pendingLatLng.lng

  if (editingId) await updatePoint(Number(editingId), data)
  else           await addPoint(getActiveTripId(), data)

  await recalcTimesAfter(getActiveTripId())

  clearPreviewMarker()
  closeModal()
  await refreshPoints()

  // 새 포인트면 해당 위치로, 수정이면 이전 지도 위치 복원
  if (isNew) flyToPoint(newLat, newLng)
  else if (savedView) setMapView(savedView)
}

window.deletePoint = async () => {
  if (!editingId) return
  if (!confirm('이 장소를 삭제할까요?')) return
  const savedView = getMapView()
  await dbDeletePoint(Number(editingId))
  clearPreviewMarker()
  closeModal()
  await refreshPoints()
  setMapView(savedView)
}

function clearForm() {
  ['f-search','f-name','f-tag','f-note','f-cost','link-url','link-label'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = ''
  })
  document.getElementById('f-type').value      = 'other'
  document.getElementById('f-day').value       = '1'
  document.getElementById('f-transport').value = ''
  document.getElementById('f-duration').value  = ''
  document.getElementById('f-arrive').value    = ''
  document.getElementById('f-stay').value      = ''
  const preview = document.getElementById('depart-preview')
  if (preview) preview.style.display = 'none'
}

function fillForm(p) {
  document.getElementById('f-name').value      = p.name             || ''
  document.getElementById('f-type').value      = p.type             || 'other'
  document.getElementById('f-day').value       = p.day              || 1
  document.getElementById('f-arrive').value    = p.arrive_time      || ''
  document.getElementById('f-stay').value      = p.stay_minutes     || ''
  document.getElementById('f-tag').value       = p.tag              || ''
  document.getElementById('f-note').value      = p.note             || ''
  document.getElementById('f-transport').value = p.transport_to_next|| ''
  document.getElementById('f-duration').value  = p.duration_minutes || ''
  document.getElementById('f-cost').value      = p.cost             || ''
  updateDepartPreview()
}

init()
