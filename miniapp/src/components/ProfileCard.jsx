import { Card } from './ui.jsx'

export default function ProfileCard({ user, balance }) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Мандрівник'

  return (
    <Card className="flex items-center gap-4 p-5">
      <Avatar photoUrl={user.photoUrl} name={fullName} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-bold">
          {fullName} {user.isPremium && <span title="Telegram Premium">⭐</span>}
        </h3>
        {user.username && <p className="truncate text-sm text-sea">@{user.username}</p>}
        <p className="text-xs text-muted">ID {user.id}</p>
      </div>
      <div className="rounded-xl bg-surface-2 px-3 py-2 text-right">
        <p className="font-pixel text-base">✨ {balance ?? '—'}</p>
        <p className="text-xs text-muted">промінчики</p>
      </div>
    </Card>
  )
}

function Avatar({ photoUrl, name }) {
  if (photoUrl) {
    return <img src={photoUrl} alt="" className="size-14 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent font-display text-2xl font-bold text-accent-text">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
