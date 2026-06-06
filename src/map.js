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
  map.on('click', (e) => {
    if (onMapClickCallback) onMapClickCallback(e.latlng.lat, e.latlng.lng)
  })
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

export async function renderPoints(points, onMarkerClick, filterDay = null) {
  clearMap()
  if (!points.length) return

  const visible = filterDay != null ? points.filter(p => (p.day || 1) === filterDay) : points

  visible.forEach((point) => {
    const color      = TYPE_COLORS[point.type] || '#607D8B'
    const globalIdx  = points.findIndex(p => p.id === point.id)
    const icon       = createMarkerIcon(color, String(globalIdx + 1))
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
          <button onclick="window.__editPoint('${point.id}')"
            style="flex:1;background:#FF3D5A;color:white;border:none;border-radius:6px;padding:5px;font-size:12px;cursor:pointer">
            수정
          </button>
          ${canGmaps ? `<button onclick="window.__openGmaps('${point.id}')"
            style="flex:1;background:#0f3460;color:white;border:none;border-radius:6px;padding:5px;font-size:12px;cursor:pointer">
            구글지도
          </button>` : ''}
        </div>
      </div>`

    const marker = L.marker([point.lat, point.lng], { icon }).addTo(map)
    marker.bindPopup(popup)
    marker.on('click', () => { if (onMarkerClick) onMarkerClick(point.id) })
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

  if (visible.length === 1) map.setView([visible[0].lat, visible[0].lng], 14)
  else map.fitBounds(L.latLngBounds(visible.map(p => [p.lat, p.lng])), { padding: [50, 50] })
}

export function flyToPoint(lat, lng) {
  map.flyTo([lat, lng], 15, { duration: 0.8 })
}

function fmtDur(m) {
  if (!m) return ''
  const h = Math.floor(m / 60), r = m % 60
  return h && r ? `${h}시간 ${r}분` : h ? `${h}시간` : `${r}분`
}
