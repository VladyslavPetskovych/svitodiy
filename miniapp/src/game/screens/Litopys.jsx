import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '../data.js'
import { useGame } from '../context.js'
import { haptic } from '../tg.js'
import { Paper, PxButton, ScreenTitle } from '../ui.jsx'

/** Значення для <input type="datetime-local"> у локальному часі. */
function toLocalInput(ms) {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function preset(kind) {
  const d = new Date()
  if (kind === 'hour') return Date.now() + 60 * 60 * 1000
  if (kind === 'evening') {
    d.setHours(20, 0, 0, 0)
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
    return d.getTime()
  }
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d.getTime()
}

const PRESETS = [
  ['hour', 'Через годину'],
  ['evening', 'О 20:00'],
  ['morning', 'Завтра 9:00'],
]

/** Літописець: ті самі завдання, що й у боті; нагадування надсилає бот у чат. */
export default function Litopys() {
  const { act } = useGame()
  const [tasks, setTasks] = useState(null)
  const [title, setTitle] = useState('')
  const [remindAt, setRemindAt] = useState(null)
  const [presetKey, setPresetKey] = useState(null)
  const [showDone, setShowDone] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => act('GET', '/tasks').then((res) => res && setTasks(res.tasks)), [act])

  useEffect(() => {
    let ignore = false
    act('GET', '/tasks').then((res) => !ignore && res && setTasks(res.tasks))
    return () => {
      ignore = true
    }
  }, [act])

  const add = async () => {
    if (!title.trim()) return
    setSaving(true)
    const res = await act('POST', '/tasks', { title, remindAt })
    setSaving(false)
    if (!res) return
    haptic('success')
    setTitle('')
    setRemindAt(null)
    setPresetKey(null)
    load()
  }

  const done = async (t) => {
    haptic('success')
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, done: true } : x)))
    if (!(await act('POST', `/tasks/${t.id}/done`))) load()
  }

  const remove = async (t) => {
    haptic('rigid')
    setTasks((list) => list.filter((x) => x.id !== t.id))
    if (!(await act('DELETE', `/tasks/${t.id}`))) load()
  }

  const open = tasks?.filter((t) => !t.done) ?? []
  const finished = tasks?.filter((t) => t.done) ?? []

  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle title="Літописець" subtitle="Завдання й нагадування — бот напише в чат вчасно" />

      <Paper className="flex flex-col gap-2 p-2">
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 500))}
          placeholder="Що потрібно зробити?"
          rows={2}
          className="w-full resize-none rounded-sm border-2 border-ink/30 bg-cream/70 p-2 text-[15px] text-ink outline-none placeholder:text-ink-soft/70 focus:border-wood"
        />
        <div className="flex flex-wrap gap-1">
          {PRESETS.map(([k, label]) => {
            const active = presetKey === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  haptic('select')
                  setPresetKey(active ? null : k)
                  setRemindAt(active ? null : preset(k))
                }}
                className={`rounded-sm border-2 px-2 py-1 text-xs font-bold ${active ? 'border-wood bg-wood text-cream' : 'border-ink/25 bg-parch-dark/40'}`}
              >
                🔔 {label}
              </button>
            )
          })}
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-ink-soft">
          Або дата:
          <input
            type="datetime-local"
            value={remindAt ? toLocalInput(remindAt) : ''}
            onChange={(e) => {
              setPresetKey(null)
              setRemindAt(e.target.value ? new Date(e.target.value).getTime() : null)
            }}
            className="flex-1 rounded-sm border-2 border-ink/25 bg-cream/70 px-1 py-1 text-ink"
          />
        </label>
        <PxButton variant="green" disabled={!title.trim() || saving} onClick={add}>
          {remindAt ? `➕ Додати · 🔔 ${formatDate(remindAt)}` : '➕ Додати без нагадування'}
        </PxButton>
      </Paper>

      {tasks == null ? (
        <p className="text-center text-sky">Гортаю літопис…</p>
      ) : open.length === 0 ? (
        <Paper className="p-4 text-center">
          <span className="text-4xl">🪶</span>
          <p className="mt-2 text-sm text-ink-soft">Усе зроблено! Додай нове завдання вище.</p>
        </Paper>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {open.map((t) => (
              <TaskRow key={t.id} task={t} onDone={() => done(t)} onDelete={() => remove(t)} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {finished.length > 0 && (
        <>
          <button type="button" onClick={() => setShowDone((v) => !v)} className="text-left text-sm font-bold text-sky">
            {showDone ? '▾' : '▸'} Виконані ({finished.length})
          </button>
          {showDone && (
            <div className="flex flex-col gap-2 opacity-75">
              <AnimatePresence initial={false}>
                {finished.map((t) => (
                  <TaskRow key={t.id} task={t} onDelete={() => remove(t)} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TaskRow({ task, onDone, onDelete }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 60 }}>
      <Paper className="flex items-center gap-2 p-1.5">
        <button
          type="button"
          disabled={task.done}
          onClick={onDone}
          aria-label="Виконано"
          className={`flex size-8 shrink-0 items-center justify-center rounded-sm border-2 border-ink/50 ${task.done ? 'bg-good' : 'bg-cream/70'}`}
        >
          {task.done && '✓'}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold wrap-break-word ${task.done ? 'line-through' : ''}`}>{task.title}</p>
          {task.remindAt && !task.done && <p className="text-xs text-wood">🔔 {formatDate(task.remindAt)}</p>}
        </div>
        <button type="button" onClick={onDelete} aria-label="Видалити" className="px-2 text-lg opacity-60 active:opacity-100">
          🗑
        </button>
      </Paper>
    </motion.div>
  )
}
