// ui.js — 사이드바 렌더링
import { TYPE_COLORS, TYPE_LABELS, TRANSPORT_LABELS, TRANSPORT_COLORS } from './db.js'

function fmtDur(m) {
  if (!m) return ''
  const h = Math.floor(m / 60), r = m % 60
  return h && r ? `${h}시간 ${r}분` : h ? `${h}시간` : `${r}분`
}

// ── 여행 목록 ──────────────────────────────────────
export function renderTripList(trips, callbacks) {
  const list = document.getElementById('point-list')
  list.innerHTML = ''

  const header = document.createElement('div')
  header.style.cssText = 'padding:8px 4px 12px;font-size:11px;color:#555;letter-spacing:0.5px;text-transform:uppercase;'
  header.textContent = '내 여행 목록'
  list.appendChild(header)

  if (!trips.length) {
    const empty = document.createElement('div')
    empty.style.cssText = 'text-align:center;color:#444;padding:40px 20px;font-size:13px;line-height:1.9;'
    empty.innerHTML = '아직 여행이 없어요.<br>아래 버튼으로 만들어보세요.'
    list.appendChild(empty)
    return
  }

  trips.forEach(trip => {
    const card = document.createElement('div')
    card.className = 'point-item'
    card.style.cursor = 'pointer'
    card.innerHTML = `
      <div class="point-header" style="margin-bottom:4px">
        <div class="point-dot" style="background:#FF3D5A"></div>
        <div class="point-name" style="flex:1">${trip.name}</div>
        <button class="order-btn trip-edit-btn" data-id="${trip.id}" title="수정" style="width:28px;height:28px;font-size:13px;">✏️</button>
        <button class="order-btn trip-del-btn"  data-id="${trip.id}" title="삭제" style="width:28px;height:28px;font-size:13px;margin-left:2px;">🗑</button>
      </div>
      ${trip.description ? `<div style="font-size:11px;color:#555;margin-top:2px">${trip.description}</div>` : ''}`

    card.addEventListener('click', (e) => {
      if (e.target.closest('.trip-edit-btn') || e.target.closest('.trip-del-btn')) return
      callbacks.onSelect?.(trip.id)
    })
    card.querySelector('.trip-edit-btn').addEventListener('click', (e) => { e.stopPropagation(); callbacks.onEdit?.(trip.id) })
    card.querySelector('.trip-del-btn').addEventListener('click',  (e) => { e.stopPropagation(); callbacks.onDelete?.(trip.id) })
    list.appendChild(card)
  })
}

// ── 포인트 리스트 (일차 분리) ──────────────────────
export function renderSidebar(points, callbacks) {
  const list = document.getElementById('point-list')
  list.innerHTML = ''

  // 일차 필터 버튼 바 — sticky (인라인 스타일 없이 CSS 클래스만 사용)
  const days = [...new Set(points.map(p => p.day || 1))].sort((a, b) => a - b)
  if (days.length > 1) {
    const bar = document.createElement('div')
    bar.className = 'day-filter-bar'
    const allBtn = document.createElement('button')
    allBtn.className = 'day-filter-btn active'
    allBtn.textContent = '전체'
    allBtn.dataset.day = 'all'
    bar.appendChild(allBtn)
    days.forEach(d => {
      const btn = document.createElement('button')
      btn.className = 'day-filter-btn'
      btn.textContent = `${d}일차`
      btn.dataset.day = d
      bar.appendChild(btn)
    })
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.day-filter-btn')
      if (!btn) return
      bar.querySelectorAll('.day-filter-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      const day = btn.dataset.day === 'all' ? null : Number(btn.dataset.day)
      callbacks.onDayFilter?.(day)
    })
    list.appendChild(bar)
  }

  if (!points.length) {
    list.innerHTML += `<div style="text-align:center;color:#444;padding:40px 20px;font-size:13px;line-height:1.9">
      아직 장소가 없어요.<br>지도를 클릭하거나<br>아래 버튼으로 추가하세요.</div>`
    return
  }

  // 일차별 그룹
  const grouped = {}
  points.forEach(p => { const d = p.day || 1; (grouped[d] = grouped[d] || []).push(p) })

  Object.keys(grouped).map(Number).sort((a, b) => a - b).forEach(day => {
    const dayPts = grouped[day]

    // 일차 구분선
    const div = document.createElement('div')
    div.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 4px 6px;font-size:11px;font-weight:700;color:#FF3D5A;letter-spacing:1px;'
    div.innerHTML = `<span>${day}일차</span><div style="flex:1;height:1px;background:#1e1e3a;"></div>`
    list.appendChild(div)

    dayPts.forEach((point) => {
      const globalIdx = points.findIndex(p => p.id === point.id)
      const isFirst   = globalIdx === 0
      const isLast    = globalIdx === points.length - 1
      const color     = TYPE_COLORS[point.type] || '#607D8B'
      const timeStr   = [point.arrive_time, point.depart_time].filter(Boolean).join(' ~ ')

      const item = document.createElement('div')
      item.className = 'point-item'
      item.dataset.id = point.id
      item.innerHTML = `
        <div class="point-header">
          <div class="point-dot" style="background:${color}"></div>
          <div class="point-name">${globalIdx + 1}. ${point.name}</div>
          <div class="point-order-btns">
            <button class="order-btn" data-action="up"   data-id="${point.id}" ${isFirst ? 'disabled style="opacity:0.2"' : ''}>▲</button>
            <button class="order-btn" data-action="down" data-id="${point.id}" ${isLast  ? 'disabled style="opacity:0.2"' : ''}>▼</button>
            <button class="order-btn" data-action="copy" data-id="${point.id}" title="복사" style="margin-top:2px;font-size:11px;color:#3ecfb2">⧉</button>
          </div>
        </div>
        <div class="point-meta">
          ${timeStr ? `<span class="point-time">⏰ ${timeStr}</span>` : ''}
          ${point.tag  ? `<span style="color:#888">${point.tag}</span>` : ''}
          <span style="color:#555">${TYPE_LABELS[point.type] || ''}</span>
        </div>`

      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('order-btn')) return
        callbacks.onEdit?.(point.id)
      })
      item.querySelectorAll('.order-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          if      (btn.dataset.action === 'up')   callbacks.onMoveUp?.(btn.dataset.id)
          else if (btn.dataset.action === 'down') callbacks.onMoveDown?.(btn.dataset.id)
          else if (btn.dataset.action === 'copy') callbacks.onCopy?.(btn.dataset.id)
        })
      })
      list.appendChild(item)

      // 이동 구간
      if (!isLast) {
        const next = points[globalIdx + 1]
        const isDayBreak = (next?.day || 1) !== day
        const seg = document.createElement('div')
        seg.className = 'segment-item'

        if (isDayBreak) {
          seg.innerHTML = `<div class="segment-line" style="background:#1e1e3a;height:30px;"></div>
            <div class="segment-info" style="color:#333;font-size:11px;">─ 다음 일차로 ─</div>`
        } else if (point.transport_to_next) {
          const segColor = TRANSPORT_COLORS[point.transport_to_next] || '#555'
          const dur  = point.duration_minutes ? ` · ${fmtDur(point.duration_minutes)}` : ''
          const cost = point.cost ? ` · $${point.cost}` : ''
          seg.innerHTML = `<div class="segment-line" style="background:${segColor}"></div>
            <div class="segment-info">
              ${TRANSPORT_LABELS[point.transport_to_next] || ''}
              <span style="color:#555">${dur}${cost}</span>
            </div>`
        } else {
          seg.innerHTML = `<div class="segment-line" style="background:#2a2a4a"></div>
            <div class="segment-info" style="color:#444;font-size:11px;">이동수단 미입력</div>`
        }
        list.appendChild(seg)
      }
    })
  })
}

// ── 요약 패널 — 한줄 ───────────────────────────────
export function renderSummary(tripName, points) {
  const totalCost = points.reduce((s, p) => s + (p.cost || 0), 0)
  const days      = [...new Set(points.map(p => p.day || 1))].length
  const panel     = document.getElementById('summary-panel')
  if (!panel) return
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#777;white-space:nowrap;overflow:hidden;">
      <span style="font-weight:700;color:#FF3D5A;font-size:12px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;max-width:100px">${tripName}</span>
      <span style="flex-shrink:0">${days}일</span>
      <span style="flex-shrink:0">${points.length}곳</span>
      <span style="color:#F39C12;flex-shrink:0">$${totalCost.toFixed(0)}</span>
    </div>`
}
