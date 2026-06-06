// main.js — JaeWalk 앱 메인
import { initMap, onMapClick, renderPoints, flyToPoint, clearMap } from './map.js'
import { renderSidebar, renderTripList, renderSummary } from './ui.js'
import {
  loadTrips, addTrip, updateTrip, deleteTrip,
  getActiveTripId, setActiveTripId,
  loadPoints, addPoint, updatePoint, deletePoint as dbDeletePoint,
  movePointUp, movePointDown,
  migrateOldData,
  exportTripJson, importTripJson,
  r2Upload, r2ListFiles, r2Delete,
  googleMapsUrl
} from './db.js'

let editingId      = null
let editingTripId  = null
let pendingLatLng  = null
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
    if (!document.getElementById('modal-overlay').classList.contains('open')) openPointModal(null)
  })

  document.getElementById('add-btn').addEventListener('click', () => {
    if (currentView === 'trips') openTripModal(null)
    else openPointModal(null)
  })

  document.getElementById('back-btn').addEventListener('click', showTripList)

  // 내보내기/가져오기
  document.getElementById('export-btn').addEventListener('click', handleExport)
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
  document.getElementById('map-hint').textContent = '지도를 클릭해서 장소를 추가하세요'
  document.getElementById('export-btn').style.display = 'block'
  document.getElementById('summary-panel').style.display = 'block'

  await refreshPoints()
}

async function refreshPoints() {
  const tripId = getActiveTripId()
  if (!tripId) return
  const trips  = await loadTrips()
  const trip   = trips.find(t => t.id === tripId)
  const points = await loadPoints(tripId)

  renderSidebar(points, {
    onEdit:      openPointModal,
    onMoveUp:    async (id) => { await movePointUp(Number(id));   refreshPoints() },
    onMoveDown:  async (id) => { await movePointDown(Number(id)); refreshPoints() },
    onDayFilter: (day) => {
      currentDayFilter = day
      renderPoints(points, highlightSidebarItem, day)
    }
  })

  renderSummary(trip?.name || '', points)
  await renderPoints(points, highlightSidebarItem, currentDayFilter)
}

function highlightSidebarItem(id) {
  document.querySelectorAll('.point-item').forEach(el => {
    el.classList.toggle('active', String(el.dataset.id) === String(id))
  })
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
  previewMarker.on('drag',    e => { const p = e.target.getLatLng(); pendingLatLng = { lat: p.lat, lng: p.lng } })
  previewMarker.on('dragend', e => { const p = e.target.getLatLng(); pendingLatLng = { lat: p.lat, lng: p.lng } })
  document.getElementById('location-confirm').style.display = 'block'
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

// ── 장소 모달 ────────────────────────────────────────
async function openPointModal(id) {
  editingId    = id
  pendingLinks = []
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
  }

  renderLinkList()
  document.getElementById('modal-overlay').classList.add('open')
  setTimeout(() => document.getElementById('f-search').focus(), 50)
}

window.closeModal = () => {
  document.getElementById('modal-overlay').classList.remove('open')
  editingId = null; pendingLatLng = null; pendingLinks = []
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

  const data = {
    name,
    type:              document.getElementById('f-type').value,
    day:               parseInt(document.getElementById('f-day').value) || 1,
    arrive_time:       document.getElementById('f-arrive').value,
    depart_time:       document.getElementById('f-depart').value,
    tag:               document.getElementById('f-tag').value.trim(),
    note:              document.getElementById('f-note').value.trim(),
    transport_to_next: document.getElementById('f-transport').value,
    duration_minutes:  parseInt(document.getElementById('f-duration').value) || 0,
    cost:              parseFloat(document.getElementById('f-cost').value) || 0,
    external_links:    [...pendingLinks],
    lat:               pendingLatLng.lat,
    lng:               pendingLatLng.lng
  }

  if (editingId) await updatePoint(Number(editingId), data)
  else           await addPoint(getActiveTripId(), data)

  clearPreviewMarker()
  closeModal()
  await refreshPoints()
}

window.deletePoint = async () => {
  if (!editingId) return
  if (!confirm('이 장소를 삭제할까요?')) return
  await dbDeletePoint(Number(editingId))
  clearPreviewMarker()
  closeModal()
  await refreshPoints()
}

function clearForm() {
  ['f-search','f-name','f-tag','f-note','f-arrive','f-depart','f-cost','link-url','link-label'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = ''
  })
  document.getElementById('f-type').value      = 'other'
  document.getElementById('f-day').value       = '1'
  document.getElementById('f-transport').value = ''
  document.getElementById('f-duration').value  = ''
}

function fillForm(p) {
  document.getElementById('f-name').value      = p.name             || ''
  document.getElementById('f-type').value      = p.type             || 'other'
  document.getElementById('f-day').value       = p.day              || 1
  document.getElementById('f-arrive').value    = p.arrive_time      || ''
  document.getElementById('f-depart').value    = p.depart_time      || ''
  document.getElementById('f-tag').value       = p.tag              || ''
  document.getElementById('f-note').value      = p.note             || ''
  document.getElementById('f-transport').value = p.transport_to_next|| ''
  document.getElementById('f-duration').value  = p.duration_minutes || ''
  document.getElementById('f-cost').value      = p.cost             || ''
}

init()
