import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { haptic } from '../../tg.js'
import { Paper, PxButton } from '../../ui.jsx'
import { speak, useSpanishVoice } from './speech.js'

const MAX_BOX = 7
const ACCENT_KEYS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡']

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function Label({ children }) {
  return <p className="font-pixel text-[10px] text-ink-soft">{children}</p>
}

export function SpeakButton({ text, className = '' }) {
  const voice = useSpanishVoice()
  if (!voice) return null
  return (
    <button
      type="button"
      aria-label="Вимовити"
      className={`rounded-sm px-2 py-1 text-lg active:scale-95 ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        haptic('light')
        speak(text)
      }}
    >
      🔊
    </button>
  )
}

function LevelMeter({ box }) {
  if (box == null) return null
  return (
    <span className="mt-1 block font-pixel text-[9px] tracking-widest text-ink-soft">
      РІВЕНЬ {'●'.repeat(box)}
      {'○'.repeat(Math.max(0, MAX_BOX - box))}
    </span>
  )
}

/** Підсумок під вправою: вірно/ні, правильний варіант, ✨ і рівень слова. */
function Verdict({ result, title }) {
  const good = result.correct
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`mt-3 text-center font-extrabold ${good ? 'text-[#2d6b18]' : 'text-[#9a2f1d]'}`}
    >
      <p>
        {title}
        {good && result.reward ? ` +${result.reward} ✨` : ''}
      </p>
      {result.es && (
        <p className="mt-1 flex items-center justify-center gap-1 text-sm font-bold text-ink">
          <span>
            {result.es} — {result.uk}
          </span>
          <SpeakButton text={result.es} className="py-0 text-base" />
        </p>
      )}
      {!good && <p className="text-xs font-bold text-ink-soft">🔁 Повторимо скоро</p>}
      <LevelMeter box={result.box} />
    </motion.div>
  )
}

/* ───────── 🔁 Повторення: картка нового слова ───────── */

export function FlashCard({ card, flipped, onFlip }) {
  if (card.type === 'tip') {
    return (
      <Paper className="p-3">
        <Label>💡 ПОРАДА</Label>
        <p className="mt-2 text-lg font-extrabold">{card.title}</p>
        <p className="mt-2 text-sm leading-relaxed">{card.body}</p>
        {card.exampleEs && (
          <p className="mt-3 flex items-center justify-between gap-2 rounded-sm bg-parch-dark/60 p-2 font-bold">
            <span>{card.exampleEs}</span>
            <SpeakButton text={card.exampleEs} />
          </p>
        )}
      </Paper>
    )
  }
  const phrase = card.tag === 'phrase' || (card.tag !== 'word' && /\s/.test(card.es.trim()))
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        haptic('light')
        onFlip()
      }}
      className="block w-full cursor-pointer"
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.45 }}
        style={{ transformStyle: 'preserve-3d' }}
        className="relative"
      >
        <Paper
          className="flex min-h-[260px] flex-col items-center justify-center p-4 text-center"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <Label>
            {card.isNew && '🆕 НОВЕ · '}
            {phrase ? '💬 ФРАЗА' : '🔤 СЛОВО'}
          </Label>
          <p className="mt-4 text-3xl font-extrabold">{card.es}</p>
          <SpeakButton text={card.es} className="mt-2" />
          <p className="mt-4 text-xs text-ink-soft">Торкнись, щоб побачити переклад</p>
        </Paper>
        <Paper
          className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <p className="text-lg font-bold text-ink-soft">{card.es}</p>
          <p className="mt-3 text-3xl font-extrabold">{card.uk}</p>
          {card.isNew && <p className="mt-6 text-xs text-ink-soft">Запам’ятай — скоро перевіримо в тесті</p>}
        </Paper>
      </motion.div>
    </div>
  )
}

/* ───────── 🧪 Тест (у «Повторенні») і 🎧 Слух ───────── */

export function Quiz({ card, result, onChoose }) {
  const listen = card.kind === 'listen'
  const reverse = card.direction === 'uk-es'

  // На слух: одразу вимовляємо (якщо браузер дозволить без жесту — інакше є кнопка).
  useEffect(() => {
    if (listen) speak(card.speak)
  }, [listen, card.speak])

  return (
    <Paper className="p-3">
      <Label>{listen ? '🎧 НА СЛУХ' : reverse ? '🧠 ЗГАДАЙ ІСПАНСЬКОЮ' : '🧪 ТЕСТ'}</Label>
      {listen ? (
        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="flex gap-2">
            <PxButton variant="blue" onClick={() => speak(card.speak)}>
              🔊 Слухати
            </PxButton>
            <PxButton variant="paper" onClick={() => speak(card.speak, 0.55)}>
              🐢 Повільно
            </PxButton>
          </div>
          <p className="min-h-8 text-center text-2xl font-extrabold">{result ? card.speak : '· · ·'}</p>
        </div>
      ) : (
        <p className="mt-3 flex items-center justify-center gap-1 text-center text-2xl font-extrabold">
          <span>{card.prompt}</span>
          {!reverse && <SpeakButton text={card.prompt} />}
        </p>
      )}
      <p className="mt-1 text-center text-xs text-ink-soft">
        {listen ? 'Що ти почув?' : reverse ? 'Як це буде іспанською?' : 'Обери правильний переклад'}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {card.options.map((o, i) => {
          let variant = 'paper'
          if (result) {
            if (i === result.correctIndex) variant = 'green'
            else if (i === result.picked) variant = 'red'
          }
          return (
            <motion.div
              key={i}
              animate={result && i === result.picked && !result.correct ? { x: [0, -6, 6, -4, 0] } : {}}
            >
              <PxButton variant={variant} className="w-full justify-start! text-left" onClick={() => onChoose(i)}>
                <span className="font-pixel text-[10px] opacity-60">{i + 1}</span> {o}
              </PxButton>
            </motion.div>
          )
        })}
      </div>
      {result && <Verdict result={result} title={result.correct ? '✅ Вірно!' : '❌ Не цього разу'} />}
    </Paper>
  )
}

/* ───────── ✍️ Письмо ───────── */

const WRITE_VERDICT = {
  exact: '✅ Ідеально!',
  accents: '✅ Зараховано — але зверни увагу на наголоси',
  typo: '✅ Майже! Є описка',
  wrong: '❌ Не цього разу',
}

export function WriteExercise({ card, result, onSubmit }) {
  const [text, setText] = useState('')
  const [hint, setHint] = useState(false)
  const inputRef = useRef(null)

  const insert = (ch) => {
    const el = inputRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    setText(text.slice(0, start) + ch + text.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + ch.length, start + ch.length)
    })
  }

  const submit = (e) => {
    e?.preventDefault()
    if (!result && text.trim()) onSubmit(text)
  }

  return (
    <Paper className="p-3">
      <Label>✍️ НАПИШИ ІСПАНСЬКОЮ</Label>
      <p className="mt-3 text-center text-2xl font-extrabold">{card.prompt}</p>
      <div className="mt-1 text-center text-xs text-ink-soft">
        {hint || result ? (
          <span className="font-mono text-sm tracking-[0.2em] text-ink">{card.hint}</span>
        ) : (
          <button type="button" className="underline" onClick={() => setHint(true)}>
            💡 Підказка: перші літери
          </button>
        )}
      </div>

      <form onSubmit={submit} className="mt-3">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!!result}
          lang="es"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="Пиши тут…"
          className="w-full rounded-sm border-2 border-wood-dark bg-cream px-3 py-2 text-lg font-bold text-ink outline-none focus:border-gold"
        />
      </form>

      {!result && (
        <>
          <div className="mt-2 grid grid-cols-9 gap-1">
            {ACCENT_KEYS.map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => insert(ch)}
                className="rounded-sm bg-parch-dark/70 py-1.5 text-base font-extrabold text-ink active:scale-95"
              >
                {ch}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <PxButton variant="paper" onClick={() => onSubmit('')}>
              Не знаю
            </PxButton>
            <PxButton variant="green" onClick={submit} disabled={!text.trim()}>
              Перевірити
            </PxButton>
          </div>
        </>
      )}

      {result && <Verdict result={result} title={WRITE_VERDICT[result.verdict] ?? WRITE_VERDICT.wrong} />}
    </Paper>
  )
}

/* ───────── 🧱 Речення ───────── */

export function BuildExercise({ card, result, onSubmit }) {
  const [chosen, setChosen] = useState([]) // індекси плиток у порядку вибору

  const add = (i) => {
    if (result) return
    haptic('select')
    setChosen((c) => [...c, i])
  }
  const remove = (pos) => {
    if (result) return
    haptic('select')
    setChosen((c) => c.filter((_, k) => k !== pos))
  }

  return (
    <Paper className="p-3">
      <Label>🧱 СКЛАДИ РЕЧЕННЯ {card.isNew && '· 🆕'}</Label>
      <p className="mt-3 text-center text-xl font-extrabold">{card.prompt}</p>
      <p className="mt-1 text-center text-xs text-ink-soft">
        Склади іспанською з {card.count} слів — {card.tiles.length - card.count} зайві
      </p>

      <div className="mt-3 flex min-h-14 flex-wrap content-start gap-1.5 rounded-sm border-2 border-dashed border-wood-dark/50 bg-cream/60 p-2">
        {chosen.map((i, pos) => (
          <motion.button
            layout
            key={`c${i}`}
            type="button"
            onClick={() => remove(pos)}
            className="rounded-sm bg-gold px-2.5 py-1.5 font-extrabold text-ink shadow-[inset_0_-3px_0_#c9a12a]"
          >
            {card.tiles[i]}
          </motion.button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {card.tiles.map((t, i) =>
          chosen.includes(i) ? (
            <span key={`p${i}`} className="rounded-sm px-2.5 py-1.5 font-extrabold text-transparent">
              {t}
            </span>
          ) : (
            <motion.button
              layout
              key={`p${i}`}
              type="button"
              onClick={() => add(i)}
              className="rounded-sm bg-parch-dark px-2.5 py-1.5 font-extrabold text-ink shadow-[inset_0_-3px_0_#b39a62] active:scale-95"
            >
              {t}
            </motion.button>
          )
        )}
      </div>

      {!result && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <PxButton variant="paper" onClick={() => setChosen([])} disabled={!chosen.length}>
            Скинути
          </PxButton>
          <PxButton
            variant="green"
            disabled={!chosen.length}
            onClick={() => onSubmit(chosen.map((i) => card.tiles[i]).join(' '))}
          >
            Перевірити
          </PxButton>
        </div>
      )}

      {result && <Verdict result={result} title={result.correct ? '✅ Чудово!' : '❌ Порядок інший'} />}
    </Paper>
  )
}

/* ───────── 🧩 Пари ───────── */

export function PairsExercise({ card, result, onFinish }) {
  const voice = useSpanishVoice()
  const [right] = useState(() => shuffle(card.pairs.map((p) => p.uk)))
  const [selEs, setSelEs] = useState(null)
  const [selUk, setSelUk] = useState(null)
  const [matched, setMatched] = useState(() => new Set())
  const [mistakes, setMistakes] = useState({})
  const [wrong, setWrong] = useState(null)
  const startedAt = useRef(null) // timeStamp першого дотику — старт раунду
  const [seconds, setSeconds] = useState(null)

  const ukOf = (es) => card.pairs.find((p) => p.es === es)?.uk

  const tryMatch = (es, uk, at) => {
    startedAt.current ??= at
    if (!es || !uk) return
    if (ukOf(es) === uk) {
      haptic('success')
      const next = new Set(matched).add(es)
      setMatched(next)
      setSelEs(null)
      setSelUk(null)
      if (next.size === card.pairs.length) {
        setSeconds(Math.round((at - startedAt.current) / 1000))
        onFinish(card.pairs.map((p) => ({ es: p.es, mistakes: mistakes[p.es] ?? 0 })))
      }
    } else {
      haptic('error')
      setMistakes((m) => ({ ...m, [es]: (m[es] ?? 0) + 1 }))
      setWrong({ es, uk })
      setTimeout(() => setWrong(null), 400)
      setSelEs(null)
      setSelUk(null)
    }
  }

  const tile = (active, done, bad) =>
    `w-full rounded-sm px-2 py-2.5 text-sm font-extrabold transition ${
      done
        ? 'bg-good/30 text-ink/40'
        : bad
          ? 'shake bg-bad/40 text-ink'
          : active
            ? 'bg-gold text-ink shadow-[inset_0_-3px_0_#c9a12a]'
            : 'bg-parch-dark text-ink shadow-[inset_0_-3px_0_#b39a62] active:scale-95'
    }`

  const doneUk = new Set([...matched].map(ukOf))
  const clean = card.pairs.filter((p) => !mistakes[p.es]).length

  return (
    <Paper className="p-3">
      <Label>🧩 ЗНАЙДИ ПАРИ</Label>
      <p className="mt-1 text-xs text-ink-soft">Торкнись іспанського слова, потім — його перекладу.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          {card.pairs.map((p) => (
            <button
              key={p.es}
              type="button"
              disabled={matched.has(p.es) || !!result}
              className={tile(selEs === p.es, matched.has(p.es), wrong?.es === p.es)}
              onClick={(e) => {
                haptic('select')
                if (voice) speak(p.es)
                setSelEs(p.es)
                tryMatch(p.es, selUk, e.timeStamp)
              }}
            >
              {p.es}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {right.map((uk) => (
            <button
              key={uk}
              type="button"
              disabled={doneUk.has(uk) || !!result}
              className={tile(selUk === uk, doneUk.has(uk), wrong?.uk === uk)}
              onClick={(e) => {
                haptic('select')
                setSelUk(uk)
                tryMatch(selEs, uk, e.timeStamp)
              }}
            >
              {uk}
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {result && (
          <motion.p
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-3 text-center font-extrabold text-[#2d6b18]"
          >
            🧩 Готово{seconds != null ? ` за ${seconds} с` : ''} · без помилок {clean}/{card.pairs.length}
            {clean < card.pairs.length && (
              <span className="block text-xs font-bold text-ink-soft">Слова з помилками повторимо скоро</span>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </Paper>
  )
}

/* ───────── Режим ще закритий ───────── */

export function Locked({ text, action, onAction }) {
  return (
    <Paper className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-3xl">🔒</p>
      <p className="text-sm font-bold">{text}</p>
      {action && (
        <PxButton variant="blue" onClick={onAction}>
          {action}
        </PxButton>
      )}
    </Paper>
  )
}
