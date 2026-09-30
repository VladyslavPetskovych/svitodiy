import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { useGame } from '../context.js'
import { PxButton, ScreenTitle, Segmented } from '../ui.jsx'

/** Ті самі вкладки, що в боті (telegram-bot/src/admin/handlers.js). */
const VIEWS = [
  { value: 'server', label: '🖥 Сервер' },
  { value: 'docker', label: '🐳 Docker' },
  { value: 'procs', label: '⚙️ Процеси' },
]

/**
 * Адмін · сервер. Звіт приходить тим самим HTML, що бот шле в чат
 * (лише <b>/<i>/<code>, текст уже екранований на сервері), — розкладаємо його по рядках.
 */
export default function Admin() {
  const { act } = useGame()
  const [view, setView] = useState('server')
  const [reports, setReports] = useState({}) // view → { html, at }
  const [loading, setLoading] = useState(true)

  const fetchReport = useCallback(
    (v) =>
      act('GET', `/admin/${v}`).then((res) => {
        setLoading(false)
        if (res) setReports((r) => ({ ...r, [v]: { html: res.html, at: res.at } }))
      }),
    [act]
  )
  const load = (v) => {
    setLoading(true)
    fetchReport(v)
  }
  const switchView = (v) => {
    setView(v)
    if (!reports[v]) load(v)
  }

  // Перша вкладка — одразу при відкритті екрана.
  useEffect(() => {
    fetchReport('server')
  }, [fetchReport])

  const report = reports[view]

  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle
        title="Адмін · сервер"
        subtitle="Стан сервера, контейнерів і процесів — як у чаті з ботом"
        right={
          <PxButton
            variant="blue"
            size="sm"
            disabled={loading}
            onClick={() => load(view)}
          >
            <motion.span animate={loading ? { rotate: 360 } : { rotate: 0 }} transition={loading ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}>
              🔄
            </motion.span>
          </PxButton>
        }
      />
      <Segmented options={VIEWS} value={view} onChange={switchView} />

      <div className="relative min-h-60 overflow-hidden rounded-sm border-4 border-wood-dark bg-[#0b1620] shadow-[inset_0_3px_0_#0008,0_4px_0_#0006]">
        {/* сканлайни, як у старого монітора */}
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,#ffffff06_0_1px,transparent_1px_3px)]" />
        <AnimatePresence mode="wait">
          {report ? (
            <motion.div
              key={`${view}-${report.at}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: loading ? 0.45 : 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="admin-report relative p-3"
            >
              <ReportLines html={report.html} />
            </motion.div>
          ) : (
            <motion.div key="loading" exit={{ opacity: 0 }} className="flex flex-col gap-2 p-3">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="h-3.5 animate-pulse rounded-sm bg-white/10" style={{ width: `${55 + ((i * 37) % 40)}%` }} />
              ))}
              <p className="mt-2 text-center text-xs text-sky/70">Збираю дані… (1–2 с)</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** «🖥 <b>Сервер</b>» — рядок-заголовок секції. */
const HEADING = /^\S+\s+<b>[^<]+<\/b>(\s*<i>.*<\/i>)?$/

function ReportLines({ html }) {
  const lines = html.split('\n')
  return (
    <div className="flex flex-col">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-3" />
        const heading = HEADING.test(line)
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i, 30) * 0.015 }}
            className={
              heading
                ? 'mb-1 border-b border-gold/25 pb-1 text-[13px] font-extrabold text-gold'
                : 'py-0.5 text-[12.5px] leading-snug wrap-break-word text-cream/90'
            }
            // HTML формує наш сервер з уже екранованих даних (див. admin/format.js escapeHtml).
            dangerouslySetInnerHTML={{ __html: line }}
          />
        )
      })}
    </div>
  )
}
