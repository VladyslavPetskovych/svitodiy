import { getWebApp } from '../lib/telegram.js'

export function Container({ className = '', children }) {
  return <div className={`mx-auto w-full max-w-5xl px-4 sm:px-6 ${className}`}>{children}</div>
}

export function SectionTitle({ eyebrow, title, children }) {
  return (
    <div className="mb-8 max-w-2xl">
      <p className="font-pixel text-[10px] leading-relaxed text-accent uppercase sm:text-xs">{eyebrow}</p>
      <h2 className="mt-2 font-display text-2xl leading-tight font-bold sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-muted">{children}</p>}
    </div>
  )
}

export function Card({ className = '', children }) {
  return <div className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</div>
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold transition active:translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const BUTTON_VARIANTS = {
  // «Ігрова» кнопка з тінню-сходинкою, як у піксельних меню.
  primary: 'bg-accent text-accent-text shadow-[0_4px_0_0_var(--accent-shadow)] hover:brightness-105 active:shadow-[0_2px_0_0_var(--accent-shadow)]',
  ghost: 'border border-line bg-surface text-text hover:bg-surface-2',
}

/** Кнопка-посилання. t.me-посилання всередині Telegram відкриваються нативно. */
export function ButtonLink({ href, variant = 'primary', className = '', children }) {
  const onClick = (e) => {
    const wa = getWebApp()
    if (wa && href.startsWith('https://t.me/')) {
      e.preventDefault()
      wa.openTelegramLink(href)
    }
  }
  const external = href.startsWith('http')
  return (
    <a
      href={href}
      onClick={onClick}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </a>
  )
}

export function Button({ variant = 'primary', className = '', ...props }) {
  return <button type="button" className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`} {...props} />
}
