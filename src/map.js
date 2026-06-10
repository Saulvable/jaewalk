// map.js — Leaflet 지도 + OSRM 경로선
import { TYPE_COLORS, TRANSPORT_COLORS, TRANSPORT_LABELS, fetchOsrmRoute, googleMapsUrl } from './db.js'

let map = null
let markers   = []
let polylines = []
let onMapClickCallback = null

export function initMap() {
  map = L.map('map', { center: [49.2827, -123.1207], zoom: 12 })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19
  }).addTo(map)
  // 지도 클릭 시 아무 동작 없음 — 포인트는 "+ 장소 추가" 버튼으로만 추가
  return map
}

export function onMapClick(cb) { onMapClickCallback = cb }

function createMarkerIcon(color, label) {
  return L.divIcon({
    className: '',
    html: `<div style="
        background:${color}; width:32px; height:32px;
        border-radius:50% 50% 50% 0; transform:rotate(-45deg);
        border:3px solid white; box-shadow:0 2px 8px rgba(0,0,0,0.4);
        display:flex; align-items:center; justify-content:center;">
        <span style="transform:rotate(45deg);font-size:12px;font-weight:700;color:white">${label}</span>
      </div>`,
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34]
  })
}

export function clearMap() {
  markers.forEach(m => map.removeLayer(m))
  polylines.forEach(p => map.removeLayer(p))
  markers = []; polylines = []
}

// ⑤ 같은 위치 마커를 조금씩 분산시키는 함수
function spreadOffset(points, index) {
  const pt = points[index]
  const THRESH = 0.00005 // 약 5m 이내면 같은 위치로 간주
  const sameGroup = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => Math.abs(p.lat - pt.lat) < THRESH && Math.abs(p.lng - pt.lng) < THRESH)
  if (sameGroup.length <= 1) return { lat: pt.lat, lng: pt.lng }
  const posInGroup = sameGroup.findIndex(({ i }) => i === index)
  const angle = (2 * Math.PI * posInGroup) / sameGroup.length
  const radius = 0.00008 // 약 8m — 최대 줌에서 확실히 분리, 인접 건물 침범 안 함
  return {
    lat: pt.lat + radius * Math.cos(angle),
    lng: pt.lng + radius * Math.sin(angle)
  }
}

export async function renderPoints(points, onMarkerClick, filterDay = null, onMarkerDragEnd = null, isInitial = false, isReadOnly = false) {
  clearMap()
  if (!points.length) return

  const visible = filterDay != null ? points.filter(p => (p.day || 1) === filterDay) : points

  visible.forEach((point) => {
    const color      = TYPE_COLORS[point.type] || '#607D8B'
    const globalIdx  = points.findIndex(p => p.id === point.id)
    const icon       = createMarkerIcon(color, String(globalIdx + 1))
    const visIdx     = visible.findIndex(p => p.id === point.id)
    const pos        = spreadOffset(visible, visIdx)
    const timeStr    = [point.arrive_time, point.depart_time].filter(Boolean).join(' ~ ')
    const linksHtml  = (point.external_links || [])
      .map(l => `<a href="${l.url}" target="_blank" style="color:#FF3D5A;font-size:11px;display:block;margin-top:3px">🔗 ${l.label || l.url}</a>`)
      .join('')

    const nextPoint  = points[globalIdx + 1]
    const canGmaps   = point.transport_to_next && nextPoint

    const popup = `
      <div style="min-width:200px;font-family:-apple-system,sans-serif">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px;color:#1a1a2e">${globalIdx + 1}. ${point.name}</div>
        ${point.tag  ? `<div style="font-size:11px;color:#888;margin-bottom:4px">${point.tag}</div>` : ''}
        ${timeStr    ? `<div style="font-size:12px;color:#2980B9;margin-bottom:4px">⏰ ${timeStr}</div>` : ''}
        ${point.note ? `<div style="font-size:12px;color:#555;border-top:1px solid #eee;padding-top:6px;margin-bottom:4px;white-space:pre-wrap">${point.note}</div>` : ''}
        ${linksHtml}
        <div style="margin-top:8px;padding-top:6px;border-top:1px solid #eee;display:flex;gap:6px">
          ${!isReadOnly ? `<button onclick="window.__editPoint('${point.id}')"
            style="flex:1;background:#FF3D5A;color:white;border:none;border-radius:6px;padding:5px;font-size:12px;cursor:pointer">
            수정
          </button>` : ''}
          ${canGmaps ? `<button onclick="window.__openGmaps('${point.id}')"
            style="flex:1;background:#0f3460;color:white;border:none;border-radius:6px;padding:5px;font-size:12px;cursor:pointer">
            구글지도
          </button>` : ''}
        </div>
      </div>`

    const marker = L.marker([pos.lat, pos.lng], { icon, draggable: !isReadOnly }).addTo(map)
    marker.bindPopup(popup)
    marker.on('click',     () => { if (onMarkerClick) onMarkerClick(point.id) })
    marker.on('dragstart', () => { map.dragging.disable(); marker.closePopup() })
    marker.on('dragend',   (e) => {
      map.dragging.enable()
      const { lat, lng } = e.target.getLatLng()
      if (onMarkerDragEnd) onMarkerDragEnd(point.id, lat, lng)
    })
    markers.push(marker)
  })

  // ── 경로선 ──────────────────────────────────────
  const OSRM_TYPES = new Set(['walk', 'car', 'uber'])

  for (let i = 0; i < visible.length - 1; i++) {
    const from = visible[i]
    const to   = visible[i + 1]
    if ((from.day || 1) !== (to.day || 1)) continue

    const transport = from.transport_to_next
    const color     = TRANSPORT_COLORS[transport] || '#555'
    const isDashed  = transport === 'flight'

    if (transport && OSRM_TYPES.has(transport)) {
      const route = await fetchOsrmRoute(from, to, transport)
      if (route) {
        const dist = (route.distance / 1000).toFixed(1)
        const dur  = Math.round(route.duration / 60)
        const line = L.polyline(route.coords, { color, weight: 3, opacity: 0.85 }).addTo(map)
        line.bindTooltip(`${TRANSPORT_LABELS[transport]} · ${dist}km · ${dur}분`, { sticky: true })
        polylines.push(line)
        continue
      }
    }

    // 직선 fallback
    const line = L.polyline(
      [[from.lat, from.lng], [to.lat, to.lng]],
      { color, weight: isDashed ? 2 : 3, opacity: 0.7, dashArray: isDashed ? '8,6' : null }
    ).addTo(map)
    if (transport) {
      const durStr = from.duration_minutes ? ` · ${fmtDur(from.duration_minutes)}` : ''
      line.bindTooltip(`${TRANSPORT_LABELS[transport] || transport}${durStr}`, { sticky: true })
    }
    polylines.push(line)
  }

  // ⑥ 초기 로드 시에만 지도 범위 맞춤, 수정/이동 시엔 현재 뷰 유지
  if (isInitial) {
    if (visible.length === 1) map.setView([visible[0].lat, visible[0].lng], 14)
    else map.fitBounds(L.latLngBounds(visible.map(p => [p.lat, p.lng])), { padding: [50, 50] })
  }
}

export function flyToPoint(lat, lng) {
  map.flyTo([lat, lng], 15, { duration: 0.8 })
}

function fmtDur(m) {
  if (!m) return ''
  const h = Math.floor(m / 60), r = m % 60
  return h && r ? `${h}시간 ${r}분` : h ? `${h}시간` : `${r}분`
}

export function getMapView() {
  const c = map.getCenter()
  return { lat: c.lat, lng: c.lng, zoom: map.getZoom() }
}

export function setMapView(view) {
  map.setView([view.lat, view.lng], view.zoom, { animate: false })
}
