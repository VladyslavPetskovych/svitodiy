import { useEffect, useState } from 'react'

/** Іспанський голос пристрою (спершу кастильський). Голоси підвантажуються асинхронно. */
function spanishVoice() {
  const voices = window.speechSynthesis?.getVoices?.() ?? []
  const es = voices.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('es'))
  return es.find((v) => v.lang.toLowerCase().replace('_', '-') === 'es-es') ?? es[0] ?? null
}

/** true, коли пристрій уміє вимовляти іспанською (в Android WebView голосів часто немає). */
export function useSpanishVoice() {
  const [ok, setOk] = useState(() => !!spanishVoice())
  useEffect(() => {
    const synth = window.speechSynthesis
    if (!synth) return
    const update = () => setOk(!!spanishVoice())
    update()
    synth.addEventListener?.('voiceschanged', update)
    return () => synth.removeEventListener?.('voiceschanged', update)
  }, [])
  return ok
}

/** Вимовити іспанський текст. rate < 1 — повільніше. */
export function speak(text, rate = 0.9) {
  const synth = window.speechSynthesis
  if (!synth) return
  synth.cancel()
  const u = new SpeechSynthesisUtterance(String(text).replace(/…/g, ''))
  u.lang = 'es-ES'
  const voice = spanishVoice()
  if (voice) u.voice = voice
  u.rate = rate
  synth.speak(u)
}
