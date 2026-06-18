// JaeWalk — 알림 전용 Service Worker
// 앱이 백그라운드여도 타이머를 유지하고 알림을 발송한다.

const ALARM_STORE = 'jaewalk-alarms'

// 등록된 알람 목록 (메모리)
let _alarms = []
let _timers = []

function clearAllTimers() {
  _timers.forEach(t => clearTimeout(t))
  _timers = []
  _alarms = []
}

function scheduleAlarms(alarms) {
  clearAllTimers()
  _alarms = alarms
  const now = Date.now()

  alarms.forEach(alarm => {
    const delay = alarm.fireAt - now
    if (delay <= 0) return

    const t = setTimeout(() => {
      self.registration.showNotification(alarm.title, {
        body:   alarm.body,
        icon:   '/icons/icon-192.png',
        badge:  '/icons/icon-192.png',
        silent: false,
        tag:    'jaewalk-alarm-' + alarm.fireAt
      })
    }, delay)

    _timers.push(t)
  })
}

self.addEventListener('message', (event) => {
  const { type, alarms } = event.data || {}

  if (type === 'SCHEDULE_ALARMS') {
    scheduleAlarms(alarms || [])
    event.ports[0]?.postMessage({ ok: true, count: _timers.length })
  }

  if (type === 'CANCEL_ALARMS') {
    clearAllTimers()
    event.ports[0]?.postMessage({ ok: true })
  }
})

// SW가 활성화되면 기존 클라이언트에 알림
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
