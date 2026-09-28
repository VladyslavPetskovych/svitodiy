import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '../data.js'
import { useGame } from '../context.js'
import { haptic } from '../tg.js'
import { Paper, PxButton, ScreenTitle, Sheet } from '../ui.jsx'

/** Дошка «Настя» — та сама, що в боті (nastia/boardStore.js). */
export default function Board() {
  const { act } = useGame()
  const [notes, setNotes] = useState(null)
  const [maxLen, setMaxLen] = useState(250)
  const [editing, setEditing] = useState(null) // { id?: string, text: string }
  const [confirmDelete, setConfirmDelete] = useState(false)

  const apply = useCallback((res) => {
    if (!res) return
    setNotes(res.notes)
    setMaxLen(res.maxLen)
  }, [])
  const load = useCallback(() => act('GET', '/board').then(apply), [act, apply])

  useEffect(() => {
    let ignore = false
    act('GET', '/board').then((res) => !ignore && apply(res))
    return () => {
      ignore = true
    }
  }, [act, apply])

  const save = async () => {
    const text = editing.text.trim()
    if (!text) return
    const res = editing.id ? await act('PATCH', `/board/${editing.id}`, { text }) : await act('POST', '/board', { text })
    if (!res) return
    haptic('success')
    setEditing(null)
    load()
  }

  const remove = async () => {
    const id = editing.id
    setConfirmDelete(false)
    setEditing(null)
    if (await act('DELETE', `/board/${id}`)) load()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-sm border-4 border-wood-dark">
        <img src="/game/art/board.webp" alt="" className="h-40 w-full object-cover" />
        <div className="absolute inset-0 flex items-end bg-linear-to-t from-black/75 to-transparent p-3">
          <ScreenTitle title="🌸 Настя" subtitle="Спільна дошка записів" />
        </div>
      </div>

      <PxButton variant="yellow" onClick={() => setEditing({ text: '' })}>
        ✍️ Новий запис
      </PxButton>

      {notes == null ? (
        <p className="text-center text-sky">Відкриваю дошку…</p>
      ) : notes.length === 0 ? (
        <Paper className="p-4 text-center text-sm text-ink-soft">Дошка порожня — залиш перший запис 💌</Paper>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {[...notes].reverse().map((n, i) => (
              <motion.button
                key={n.id}
                type="button"
                layout
                initial={{ opacity: 0, rotate: i % 2 ? 1.5 : -1.5, y: 10 }}
                animate={{ opacity: 1, rotate: i % 2 ? 0.6 : -0.6, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => setEditing({ id: n.id, text: n.text })}
                className="text-left"
              >
                <Paper className="p-2">
                  <p className="text-[15px] whitespace-pre-wrap wrap-break-word">{n.text}</p>
                  <p className="mt-2 text-xs text-ink-soft">
                    {n.authorName} · {formatDate(n.createdAt)}
                    {n.editedBy && ` · ред. ${n.editedBy}`}
                  </p>
                </Paper>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Редагувати запис' : 'Новий запис'}>
        {editing && (
          <div className="flex flex-col gap-2">
            <textarea
              autoFocus
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value.slice(0, maxLen) })}
              rows={5}
              className="w-full resize-none rounded-sm border-2 border-ink/30 bg-cream/70 p-2 text-[15px] text-ink outline-none focus:border-wood"
              placeholder="Напиши щось приємне…"
            />
            <p className="text-right text-xs text-ink-soft">
              {editing.text.length}/{maxLen}
            </p>
            <PxButton variant="green" disabled={!editing.text.trim()} onClick={save}>
              Зберегти
            </PxButton>
            {editing.id && (
              <PxButton variant="red" onClick={() => setConfirmDelete(true)}>
                🗑 Видалити
              </PxButton>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Видалити запис?">
        <p className="text-center text-sm text-ink-soft">Запис зникне і з дошки в боті.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <PxButton variant="paper" onClick={() => setConfirmDelete(false)}>
            Ні
          </PxButton>
          <PxButton variant="red" onClick={remove}>
            Видалити
          </PxButton>
        </div>
      </Sheet>
    </div>
  )
}
