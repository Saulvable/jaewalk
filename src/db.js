// db.js — Dexie(IndexedDB) 기반 데이터 레이어

import Dexie from 'dexie'

// ── DB 스키마 ──────────────────────────────────────
export const db = new Dexie('jaewalk')

db.version(1).stores({
  trips:  '++id, name, created_at',
  points: '++id, trip_id, order, day, name, type'
})

// ── 색상/유형 상수 ─────────────────────────────────
export const TYPE_COLORS = {
  departure:  '#95A5A6',   // 출발지
  airport:    '#2980B9',   // 공항
  hotel:      '#E74C3C',   // 숙소
  food:       '#E67E22',   // 식당
  attraction: '#2ECC71',   // 관광지
  shopping:   '#F39C12',   // 쇼핑
  transport:  '#8E44AD',   // 교통
  other:      '#607D8B',   // 기타
}

export const TYPE_LABELS = {
  departure:  '🏠 출발지',
  airport:    '✈️ 공항',
  hotel:      '🏨 숙소',
  food:       '🍽️ 식당',
  attraction: '🗺️ 관광지',
  shopping:   '🛍️ 쇼핑',
  transport:  '🚌 교통',
  other:      '📍 기타',
}

export const TRANSPORT_COLORS = {
  walk:   '#2ECC71',
  car:    '#2980B9',
  uber:   '#2980B9',
  transit:'#8E44AD',
  flight: '#95A5A6',
}

export const TRANSPORT_LABELS = {
  walk:    '🚶 도보',
  car:     '🚗 자동차',
  uber:    '🚕 우버/택시',
  transit: '🚌 버스/전철',
  flight:  '✈️ 비행기',
}

// ── Trip CRUD ──────────────────────────────────────

export async function loadTrips() {
  return db.trips.orderBy('created_at').toArray()
}

export async function addTrip({ name, description = '' }) {
  const id = await db.trips.add({
    name,
    description,
    created_at: new Date().toISOString()
  })
  return db.trips.get(id)
}

export async function updateTrip(id, updates) {
  await db.trips.update(id, updates)
  return db.trips.get(id)
}

export async function deleteTrip(id) {
  await db.transaction('rw', db.trips, db.points, async () => {
    await db.trips.delete(id)
    await db.points.where('trip_id').equals(id).delete()
  })
}

// ── Active Trip ────────────────────────────────────

export function getActiveTripId() {
  const v = localStorage.getItem('jaewalk_active_trip')
  return v ? Number(v) : null
}

export function setActiveTripId(id) {
  if (id != null) localStorage.setItem('jaewalk_active_trip', String(id))
  else localStorage.removeItem('jaewalk_active_trip')
}

// ── Point CRUD ─────────────────────────────────────

export async function loadPoints(tripId) {
  const pts = await db.points.where('trip_id').equals(tripId).toArray()
  return pts.sort((a, b) => a.order - b.order)
}

export async function addPoint(tripId, data) {
  const existing = await db.points.where('trip_id').equals(tripId).toArray()
  const maxOrder = existing.length ? Math.max(...existing.map(p => p.order)) : 0
  const id = await db.points.add({
    trip_id:           tripId,
    order:             maxOrder + 1,
    day:               data.day               || 1,
    name:              data.name              || '새 장소',
    type:              data.type              || 'other',
    lat:               data.lat,
    lng:               data.lng,
    arrive_time:       data.arrive_time       || '',
    stay_minutes:      data.stay_minutes      || 0,
    depart_time:       data.depart_time       || '',
    tag:               data.tag               || '',
    note:              data.note              || '',
    transport_to_next: data.transport_to_next || '',
    duration_minutes:  data.duration_minutes  || 0,
    cost:              data.cost              || 0,
    external_links:    data.external_links    || [],
    created_at:        new Date().toISOString()
  })
  return db.points.get(id)
}

export async function updatePoint(id, updates) {
  await db.points.update(id, updates)
  return db.points.get(id)
}

export async function deletePoint(id) {
  const point = await db.points.get(id)
  if (!point) return
  await db.points.delete(id)
  const remaining = (await db.points.where('trip_id').equals(point.trip_id).toArray())
    .sort((a, b) => a.order - b.order)
  await Promise.all(remaining.map((p, i) => db.points.update(p.id, { order: i + 1 })))
}

export async function movePointUp(id) {
  const point = await db.points.get(id)
  if (!point) return false
  const pts = (await db.points.where('trip_id').equals(point.trip_id).toArray())
    .sort((a, b) => a.order - b.order)
  const idx = pts.findIndex(p => p.id === id)
  if (idx <= 0) return false
  await db.points.update(pts[idx - 1].id, { order: pts[idx].order })
  await db.points.update(pts[idx].id,     { order: pts[idx - 1].order })
  return true
}

export async function movePointDown(id) {
  const point = await db.points.get(id)
  if (!point) return false
  const pts = (await db.points.where('trip_id').equals(point.trip_id).toArray())
    .sort((a, b) => a.order - b.order)
  const idx = pts.findIndex(p => p.id === id)
  if (idx >= pts.length - 1) return false
  await db.points.update(pts[idx + 1].id, { order: pts[idx].order })
  await db.points.update(pts[idx].id,     { order: pts[idx + 1].order })
  return true
}

// ── localStorage → IndexedDB 마이그레이션 ─────────

export async function migrateOldData() {
  const oldTrips  = localStorage.getItem('jaewalk_trips')
  const oldPoints = localStorage.getItem('jaewalk_points')
  if (!oldTrips && !oldPoints) return

  const existingCount = await db.trips.count()
  if (existingCount > 0) {
    localStorage.removeItem('jaewalk_trips')
    localStorage.removeItem('jaewalk_points')
    return
  }

  try {
    if (oldTrips) {
      for (const t of JSON.parse(oldTrips)) {
        await db.trips.add({
          name: t.name || '기존 여행',
          description: t.description || '',
          created_at: t.created_at || new Date().toISOString()
        })
      }
    }
    if (oldPoints) {
      const firstTrip = await db.trips.toCollection().first()
      const targetId = firstTrip?.id
      if (targetId) {
        for (const p of JSON.parse(oldPoints)) {
          await db.points.add({
            trip_id: targetId,
            order: p.order || 1, day: p.day || 1,
            name: p.name || '장소', type: p.type || 'other',
            lat: p.lat, lng: p.lng,
            arrive_time: p.arrive_time || '', depart_time: p.depart_time || '',
            tag: p.tag || '', note: p.note || '',
            transport_to_next: p.transport_to_next || '',
            duration_minutes: p.duration_minutes || 0,
            cost: p.cost || 0, external_links: [],
            created_at: p.created_at || new Date().toISOString()
          })
        }
      }
    }
    localStorage.removeItem('jaewalk_trips')
    localStorage.removeItem('jaewalk_points')
    console.log('[JaeWalk] localStorage → IndexedDB 마이그레이션 완료')
  } catch (e) {
    console.error('[JaeWalk] 마이그레이션 실패:', e)
  }
}

// ── OSRM 경로 계산 ─────────────────────────────────

export async function fetchOsrmRoute(fromPoint, toPoint, transport) {
  const profile = transport === 'walk' ? 'foot' : 'car'
  const url = `https://router.project-osrm.org/route/v1/${profile}/` +
    `${fromPoint.lng},${fromPoint.lat};${toPoint.lng},${toPoint.lat}` +
    `?overview=full&geometries=geojson`
  try {
    const res  = await fetch(url)
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes.length) return null
    const route = data.routes[0]
    return {
      coords:   route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distance: route.distance,
      duration: route.duration
    }
  } catch { return null }
}

// ── 구글지도 딥링크 ────────────────────────────────

export function googleMapsUrl(fromPoint, toPoint, transport) {
  const travelmode = transport === 'transit' ? 'transit'
                   : transport === 'flight'  ? 'flying'
                   : 'driving'
  return `https://www.google.com/maps/dir/?api=1` +
    `&origin=${fromPoint.lat},${fromPoint.lng}` +
    `&destination=${toPoint.lat},${toPoint.lng}` +
    `&travelmode=${travelmode}`
}

// ── R2 파일 업로드/다운로드 ────────────────────────
// AWS S3 호환 API (Cloudflare R2)
// 브라우저에서 직접 AWS Signature V4 서명 구현

const R2_BUCKET   = 'jaewalk-files'
const R2_ENDPOINT = 'https://473f09a0aacfd4d14196fa139cfefee0.r2.cloudflarestorage.com'
const R2_ACCESS   = 'cb1d09162972ac56e7f5b23841698586'
const R2_SECRET   = '8b8bd986cf5f41e8d75745c4fe2ab3cc57110857031ab7510f33109ebd3c69c5'
const R2_REGION   = 'auto'

async function hmacSha256(key, data) {
  const k = typeof key === 'string'
    ? new TextEncoder().encode(key)
    : key
  const cryptoKey = await crypto.subtle.importKey(
    'raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data)))
}

async function sha256Hex(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function signedR2Request(method, key, body = null, contentType = 'application/octet-stream') {
  const now     = new Date()
  const date    = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '').slice(0, 15) + 'Z'
  const dateStr = date.slice(0, 8)

  const url    = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`
  const host   = new URL(url).host
  const path   = `/${R2_BUCKET}/${key}`

  const bodyBuf     = body ? (body instanceof ArrayBuffer ? body : await body.arrayBuffer()) : null
  const payloadHash = bodyBuf ? await sha256Hex(bodyBuf) : await sha256Hex('')

  const headers = {
    'host':                host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date':          date,
    ...(body ? { 'content-type': contentType } : {})
  }

  const signedHeaders = Object.keys(headers).sort().join(';')
  const canonicalHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}\n`).join('')

  const canonicalRequest = [
    method, path, '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n')

  const scope         = `${dateStr}/${R2_REGION}/s3/aws4_request`
  const stringToSign  = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${await sha256Hex(canonicalRequest)}`

  const kDate    = await hmacSha256(`AWS4${R2_SECRET}`, dateStr)
  const kRegion  = await hmacSha256(kDate,    R2_REGION)
  const kService = await hmacSha256(kRegion,  's3')
  const kSigning = await hmacSha256(kService, 'aws4_request')
  const signature = toHex(await hmacSha256(kSigning, stringToSign))

  const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const fetchHeaders = { ...headers, Authorization: authorization }
  delete fetchHeaders.host

  return fetch(url, {
    method,
    headers: fetchHeaders,
    body: bodyBuf || undefined
  })
}

export async function r2Upload(tripId, filename, file) {
  const key = `trips/${tripId}/${filename}`
  const res = await signedR2Request('PUT', key, file, file.type || 'application/octet-stream')
  if (!res.ok) throw new Error(`R2 업로드 실패: ${res.status}`)
  return `${R2_ENDPOINT}/${R2_BUCKET}/${key}`
}

export async function r2Delete(tripId, filename) {
  const key = `trips/${tripId}/${filename}`
  const res = await signedR2Request('DELETE', key)
  if (!res.ok) throw new Error(`R2 삭제 실패: ${res.status}`)
}

export async function r2ListFiles(tripId) {
  const prefix = `trips/${tripId}/`
  const key    = `?prefix=${encodeURIComponent(prefix)}&list-type=2`
  const now    = new Date()
  const date   = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '').slice(0, 15) + 'Z'
  const dateStr = date.slice(0, 8)
  const host   = new URL(R2_ENDPOINT).host
  const path   = `/${R2_BUCKET}/`
  const query  = `list-type=2&prefix=${encodeURIComponent(prefix)}`
  const payloadHash = await sha256Hex('')

  const headers = {
    'host': host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': date,
  }
  const signedHeaders = Object.keys(headers).sort().join(';')
  const canonicalHeaders = Object.entries(headers).sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>`${k}:${v}\n`).join('')

  const canonicalRequest = ['GET', path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${dateStr}/${R2_REGION}/s3/aws4_request`
  const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${await sha256Hex(canonicalRequest)}`

  const kDate    = await hmacSha256(`AWS4${R2_SECRET}`, dateStr)
  const kRegion  = await hmacSha256(kDate, R2_REGION)
  const kService = await hmacSha256(kRegion, 's3')
  const kSigning = await hmacSha256(kService, 'aws4_request')
  const signature = toHex(await hmacSha256(kSigning, stringToSign))
  const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const fetchHeaders = { ...headers, Authorization: authorization }
  delete fetchHeaders.host

  const res = await fetch(`${R2_ENDPOINT}/${R2_BUCKET}/${key}`, { headers: fetchHeaders })
  const text = await res.text()

  const keys = [...text.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1])
  return keys.map(k => ({
    key: k,
    filename: k.replace(prefix, ''),
    url: `${R2_ENDPOINT}/${R2_BUCKET}/${k}`
  }))
}

// ── 여행 공유 링크 (R2) ────────────────────────────

// JSON을 R2 shares/ 에 올리고 공개 URL 반환
// 같은 tripId로 덮어쓰면 URL 그대로 → 항상 최신 내용
export async function r2ShareUpload(tripId, jsonStr) {
  const key         = `shares/${tripId}.json`
  const blob        = new Blob([jsonStr], { type: 'application/json' })
  const res         = await signedR2Request('PUT', key, blob, 'application/json')
  if (!res.ok) throw new Error(`공유 업로드 실패: ${res.status}`)
  return `${R2_ENDPOINT}/${R2_BUCKET}/${key}`
}

// 공유 URL에서 JSON 로드 (서명된 GET — 퍼블릭 액세스 불필요)
export async function r2ShareLoad(tripId) {
  const key = `shares/${tripId}.json`
  const res = await signedR2Request('GET', key)
  if (!res.ok) throw new Error(`공유 데이터 로드 실패: ${res.status}`)
  return res.text()
}

// ── JSON 내보내기 / 가져오기 ───────────────────────

export async function exportTripJson(tripId) {
  const trip   = await db.trips.get(tripId)
  const points = await loadPoints(tripId)
  return JSON.stringify({ version: 1, trip, points }, null, 2)
}

export async function importTripJson(jsonStr) {
  const { trip, points } = JSON.parse(jsonStr)
  const newTrip = await addTrip({ name: trip.name, description: trip.description || '' })
  for (const p of points) await addPoint(newTrip.id, p)
  return newTrip
}
