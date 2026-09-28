import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { useGame } from '../context.js'
import { haptic } from '../tg.js'
import { Bar, Paper, PxButton, ScreenTitle, Segmented, Toggle } from '../ui.jsx'

/** Думосвіт: практика з картками й тестами + налаштування нагадувань у чат. */
export default function Dumosvit() {
  const { act, state, catalog } = useGame()
  const [card, setCard] = useState(null)
  const [loading, setLoading] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [answer, setAnswer] = useState(null)
  const [score, setScore] = useState({ right: 0, total: 0 })

  const showCard = useCallback((res) => {
    setLoading(false)
    if (!res) return
    setCard(res.card)
    setFlipped(false)
    setAnswer(null)
  }, [])

  const next = () => {
    setLoading(true)
    act('POST', '/dumosvit/next').then(showCard)
  }

  // Перша картка при відкритті екрана.
  useEffect(() => {
    let ignore = false
    act('POST', '/dumosvit/next').then((res) => !ignore && showCard(res))
    return () => {
      ignore = true
    }
  }, [act, showCard])

  const choose = async (index) => {
    if (answer) return
    const res = await act('POST', '/dumosvit/answer', { token: card.token, index })
    if (!res) return
    setAnswer({ picked: index, ...res })
    setScore((s) => ({ right: s.right + (res.correct ? 1 : 0), total: s.total + 1 }))
    haptic(res.correct ? 'success' : 'error')
  }

  const cap = catalog.config.quizDailyCap
  const earned = state.dumosvit.quizRewardsToday

  return (
    <div className="flex flex-col gap-3">
      <ScreenTitle
        title="Думосвіт"
        subtitle="Іспанська маленькими кроками"
        right={
          score.total > 0 && (
            <span className="font-pixel text-[11px] text-gold">
              {score.right}/{score.total}
            </span>
          )
        }
      />

      <div className="relative min-h-[300px]" style={{ perspective: 900 }}>
        <AnimatePresence mode="wait">
          {card && (
            <motion.div
              key={card.token ?? card.es ?? card.title}
              initial={{ opacity: 0, x: 60, rotate: 4 }}
              animate={{ opacity: 1, x: 0, rotate: 0 }}
              exit={{ opacity: 0, x: -60, rotate: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            >
              {card.kind === 'quiz' ? (
                <Quiz card={card} answer={answer} onChoose={choose} />
              ) : (
                <FlashCard card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <PxButton variant="yellow" size="lg" disabled={loading} onClick={next}>
        {loading ? 'Гортаю…' : card?.kind === 'quiz' && !answer ? 'Пропустити ›' : 'Далі ›'}
      </PxButton>

      <Paper className="p-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold">Нагорода за тести сьогодні</span>
          <span className="font-pixel text-[11px]">
            {earned}/{cap} ✨
          </span>
        </div>
        <Bar value={earned / cap} tone="gold" className="mt-2" />
        <p className="mt-1 text-xs text-ink-soft">
          +{catalog.config.quizReward} ✨ за кожну правильну відповідь, до {cap} на день.
        </p>
      </Paper>

      <Settings />
    </div>
  )
}

function FlashCard({ card, flipped, onFlip }) {
  if (card.type === 'tip') {
    return (
      <Paper className="p-3">
        <p className="font-pixel text-[10px] text-ink-soft">💡 ПОРАДА</p>
        <p className="mt-2 text-lg font-extrabold">{card.title}</p>
        <p className="mt-2 text-sm leading-relaxed">{card.body}</p>
        {card.exampleEs && <p className="mt-3 rounded-sm bg-parch-dark/60 p-2 font-bold">🇪🇸 {card.exampleEs}</p>}
      </Paper>
    )
  }
  const phrase = card.tag === 'phrase' || (card.tag !== 'word' && /\s/.test(card.es.trim()))
  return (
    <button type="button" onClick={() => { haptic('light'); onFlip() }} className="block w-full">
      <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.45 }} style={{ transformStyle: 'preserve-3d' }} className="relative">
        <Paper className="flex min-h-[260px] flex-col items-center justify-center p-4 text-center" style={{ backfaceVisibility: 'hidden' }}>
          <p className="font-pixel text-[10px] text-ink-soft">{phrase ? '💬 ФРАЗА' : '🔤 СЛОВО'}</p>
          <p className="mt-4 text-3xl font-extrabold">🇪🇸 {card.es}</p>
          <p className="mt-6 text-xs text-ink-soft">Торкнись, щоб побачити переклад</p>
        </Paper>
        <Paper
          className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <p className="text-lg font-bold text-ink-soft">🇪🇸 {card.es}</p>
          <p className="mt-3 text-3xl font-extrabold">🇺🇦 {card.uk}</p>
        </Paper>
      </motion.div>
    </button>
  )
}

function Quiz({ card, answer, onChoose }) {
  return (
    <Paper className="p-3">
      <p className="font-pixel text-[10px] text-ink-soft">🧪 ТЕСТ</p>
      <p className="mt-3 text-center text-2xl font-extrabold">🇪🇸 {card.es}</p>
      <p className="mt-1 text-center text-xs text-ink-soft">Обери правильний переклад</p>
      <div className="mt-4 flex flex-col gap-2">
        {card.options.map((o, i) => {
          let variant = 'paper'
          if (answer) {
            if (i === answer.correctIndex) variant = 'green'
            else if (i === answer.picked) variant = 'red'
          }
          return (
            <motion.div key={i} animate={answer && i === answer.picked && !answer.correct ? { x: [0, -6, 6, -4, 0] } : {}}>
              <PxButton variant={variant} className="w-full justify-start! text-left" onClick={() => onChoose(i)}>
                <span className="font-pixel text-[10px] opacity-60">{i + 1}</span> {o}
              </PxButton>
            </motion.div>
          )
        })}
      </div>
      <AnimatePresence>
        {answer && (
          <motion.p
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`mt-3 text-center font-extrabold ${answer.correct ? 'text-[#2d6b18]' : 'text-[#9a2f1d]'}`}
          >
            {answer.correct ? `✅ Вірно!${answer.reward ? ` +${answer.reward} ✨` : ''}` : '❌ Не цього разу'}
          </motion.p>
        )}
      </AnimatePresence>
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
          { value: 1, label: '🐢 Рідко' },
          { value: 2, label: '🐇 Норма' },
          { value: 3, label: '⚡ Часто' },
        ]}
      />
      <p className="text-xs text-ink-soft">{label}</p>
    </Paper>
  )
}
