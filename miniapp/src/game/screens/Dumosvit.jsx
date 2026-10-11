import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useGame } from '../context.js'
import { haptic } from '../tg.js'
import { Bar, Paper, PxButton, ScreenTitle, Segmented, Toggle } from '../ui.jsx'
import { BuildExercise, FlashCard, Locked, PairsExercise, Quiz, WriteExercise } from './dumosvit/modes.jsx'
import { useSpanishVoice } from './dumosvit/speech.js'

/**
 * Думосвіт: кілька режимів поверх одних інтервальних повторень —
 * усе, що ти робиш у будь-якому режимі, рухає слова по коробках і рахується в ціль дня.
 */
const MODES = [
  { id: 'review', icon: '🔁', label: 'Повтор', about: 'Нові слова й тести — головний режим.' },
  { id: 'write', icon: '✍️', label: 'Письмо', about: 'Пишеш слово сам — запам’ятовується найміцніше.' },
  { id: 'listen', icon: '🎧', label: 'Слух', about: 'Чуєш іспанською — обираєш переклад.' },
  { id: 'build', icon: '🧱', label: 'Речення', about: 'Складаєш фразу зі слів — тренує граматику.' },
  { id: 'pairs', icon: '🧩', label: 'Пари', about: 'Швидкий раунд: з’єднай слова з перекладами.' },
]
const MODE_KEY = 'dumosvit:mode'

function savedMode() {
  try {
    const m = localStorage.getItem(MODE_KEY)
    return MODES.some((x) => x.id === m) ? m : 'review'
  } catch {
    return 'review'
  }
}

export default function Dumosvit() {
  const { act, state, catalog, reward } = useGame()
  const voice = useSpanishVoice()
  const [mode, setMode] = useState(savedMode)
  const [card, setCard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [flipped, setFlipped] = useState(false)
  const [result, setResult] = useState(null)
  const [score, setScore] = useState({ right: 0, total: 0 })
  const [progress, setProgress] = useState(null)
  const reqId = useRef(0)

  const needsVoice = mode === 'listen' && !voice

  const load = useCallback(
    (m) => {
      const id = ++reqId.current
      act('POST', '/dumosvit/next', { mode: m }).then((res) => {
        if (id !== reqId.current) return // користувач уже перемкнув режим
        setLoading(false)
        if (!res) return
        setCard(res.card)
        setFlipped(false)
        setResult(null)
        if (res.progress) setProgress(res.progress)
      })
    },
    [act]
  )

  useEffect(() => {
    if (needsVoice) {
      reqId.current++ // відкинути відповідь, що ще летить, — екран покаже підказку про голос
      return
    }
    load(mode)
  }, [mode, needsVoice, load])

  const switchMode = (m) => {
    if (m === mode) return
    haptic('select')
    setLoading(true)
    setMode(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* ignore */
    }
  }

  /** Спільна обробка відповіді будь-якого режиму. */
  const onResult = (res, extra = {}) => {
    if (!res) return
    setResult({ ...res, ...extra })
    if (res.progress) setProgress(res.progress)
    if ('correct' in res) {
      setScore((s) => ({ right: s.right + (res.correct ? 1 : 0), total: s.total + 1 }))
      haptic(res.correct ? 'success' : 'error')
    }
    if (res.goal?.reachedNow) {
      reward({
        title: 'Ціль дня виконано!',
        icon: '🎯',
        subtitle: `+${res.goal.bonus} ✨`,
        lines: [`🔥 Серія: ${res.goal.streak} дн.`, 'Завтра повертайся — не обривай серію!'],
        tone: 'epic',
      })
    }
  }

  const choose = async (index) => {
    if (result) return
    const res = await act('POST', '/dumosvit/answer', { token: card.token, index })
    onResult(res, { picked: index })
  }
  const submitText = async (text) => {
    if (result) return
    onResult(await act('POST', '/dumosvit/check', { token: card.token, text }))
  }
  const finishPairs = async (results) => {
    onResult(await act('POST', '/dumosvit/pairs', { token: card.token, results }))
  }

  const answerable = card && !card.locked && card.kind !== 'card'
  const nextLabel = loading
    ? 'Гортаю…'
    : card?.kind === 'pairs'
      ? 'Новий раунд ›'
      : answerable && !result
        ? 'Пропустити ›'
        : 'Далі ›'

  const goal = state.dumosvit.goal
  const cap = catalog.config.quizDailyCap
  const earned = state.dumosvit.quizRewardsToday
  const modeInfo = MODES.find((m) => m.id === mode)

  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle
        title="Думосвіт"
        subtitle="Іспанська з інтервальними повтореннями"
        right={
          score.total > 0 && (
            <span className="font-pixel text-[11px] text-gold">
              {score.right}/{score.total}
            </span>
          )
        }
      />

      {goal && <Goal g={goal} />}

      <div className="px-wood grid grid-cols-5 gap-1 p-0.5">
        {MODES.map((m) => {
          const active = m.id === mode
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => switchMode(m.id)}
              className={`relative flex flex-col items-center rounded-sm py-1.5 transition ${active ? 'text-ink' : 'text-cream/80'}`}
            >
              {active && (
                <motion.span
                  layoutId="dumosvit-mode"
                  className="absolute inset-0 rounded-sm bg-parch shadow-[inset_0_-3px_0_#c9ad73]"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative text-lg leading-none">{m.icon}</span>
              <span className="relative mt-1 text-[10px] font-extrabold">{m.label}</span>
            </button>
          )
        })}
      </div>
      <p className="-mt-1 text-center text-xs text-cream/80">{modeInfo.about}</p>

      <div className="relative min-h-[300px]" style={{ perspective: 900 }}>
        <AnimatePresence mode="wait">
          {needsVoice ? (
            <motion.div key="no-voice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Locked
                text="На цьому пристрої немає іспанського голосу для озвучення. Спробуй інший режим або додай іспанський голос у налаштуваннях телефона (Мова → Синтез мовлення)."
                action="✍️ До письма"
                onAction={() => switchMode('write')}
              />
            </motion.div>
          ) : (
            card && (
              <motion.div
                key={card.token ?? card.es ?? card.title ?? card.mode}
                initial={{ opacity: 0, x: 60, rotate: 4 }}
                animate={{ opacity: 1, x: 0, rotate: 0 }}
                exit={{ opacity: 0, x: -60, rotate: -4 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              >
                <CardView
                  card={card}
                  result={result}
                  flipped={flipped}
                  onFlip={() => setFlipped((f) => !f)}
                  onChoose={choose}
                  onSubmit={submitText}
                  onFinishPairs={finishPairs}
                  onGoReview={() => switchMode('review')}
                />
              </motion.div>
            )
          )}
        </AnimatePresence>
      </div>

      {!needsVoice && !card?.locked && (
        <PxButton
          variant="yellow"
          size="lg"
          disabled={loading}
          onClick={() => {
            setLoading(true)
            load(mode)
          }}
        >
          {nextLabel}
        </PxButton>
      )}

      {progress && <Progress p={progress} />}

      <Paper className="p-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold">Нагорода за вправи сьогодні</span>
          <span className="font-pixel text-[11px]">
            {earned}/{cap} ✨
          </span>
        </div>
        <Bar value={earned / cap} tone="gold" className="mt-2" />
        <p className="mt-1 text-xs text-ink-soft">
          +{catalog.config.quizReward} ✨ за кожну правильну відповідь (тест, письмо, слух, речення), до {cap} на
          день. Ціль дня — ще +{goal?.reward} ✨ бонусом.
        </p>
      </Paper>

      <Settings />
    </div>
  )
}

function CardView({ card, result, flipped, onFlip, onChoose, onSubmit, onFinishPairs, onGoReview }) {
  if (card.locked) return <Locked text={card.message} action="🔁 До повторення" onAction={onGoReview} />
  switch (card.kind) {
    case 'quiz':
    case 'listen':
      return <Quiz card={card} result={result} onChoose={onChoose} />
    case 'write':
      return <WriteExercise card={card} result={result} onSubmit={onSubmit} />
    case 'build':
      return <BuildExercise card={card} result={result} onSubmit={onSubmit} />
    case 'pairs':
      return <PairsExercise card={card} result={result} onFinish={onFinishPairs} />
    default:
      return <FlashCard card={card} flipped={flipped} onFlip={onFlip} />
  }
}

/** Ціль дня й серія — щоб вчитися щодня, а не «залпами». */
function Goal({ g }) {
  return (
    <Paper className="p-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold">🎯 Ціль дня {g.doneToday && '✅'}</span>
        <span className="font-pixel text-[11px]">
          {g.done}/{g.goal}
        </span>
      </div>
      <Bar value={g.done / g.goal} tone="gold" className="mt-2" />
      <p className="mt-1 flex justify-between text-xs text-ink-soft">
        <span>
          🔥 Серія: <b className="text-ink">{g.streak}</b> дн.
          {g.best > g.streak && ` · рекорд ${g.best}`}
        </span>
        <span>{g.doneToday ? 'Виконано — до завтра!' : `ще ${g.goal - g.done} вправ`}</span>
      </p>
    </Paper>
  )
}

function Progress({ p }) {
  const stats = [
    { label: 'Вивчено', value: p.learned },
    { label: 'У процесі', value: p.learning },
    { label: 'Повторити', value: p.due },
  ]
  return (
    <Paper className="p-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        {stats.map((x) => (
          <div key={x.label}>
            <p className="font-pixel text-[13px]">{x.value}</p>
            <p className="text-xs text-ink-soft">{x.label}</p>
          </div>
        ))}
      </div>
      <Bar value={p.total ? p.learned / p.total : 0} tone="gold" className="mt-2" />
      <p className="mt-1 text-xs text-ink-soft">
        Нових сьогодні: {p.newToday}/{p.newPerDay} · у словнику {p.total} слів і фраз
      </p>
    </Paper>
  )
}

function Settings() {
  const { act, state, catalog } = useGame()
  const { intensity, reminders } = state.dumosvit
  const label = catalog.dumosvitIntensity.find((x) => x.level === intensity)?.label
  return (
    <Paper className="flex flex-col gap-2 p-2">
      <p className="font-pixel text-[10px] text-ink-soft">КАРТКИ В ЧАТ</p>
      <Toggle
        checked={reminders}
        label="Надсилати картки в чат з ботом"
        onChange={(v) => act('POST', '/dumosvit/settings', { reminders: v })}
      />
      <p className="text-sm font-bold">Частота</p>
      <Segmented
        value={intensity}
        onChange={(v) => act('POST', '/dumosvit/settings', { intensity: v })}
        options={[
          { value: 1, label: '🐢' },
          { value: 2, label: '🐇' },
          { value: 3, label: '⚡' },
          { value: 4, label: '🔥' },
        ]}
      />
      <p className="text-xs text-ink-soft">{label}</p>
    </Paper>
  )
}
