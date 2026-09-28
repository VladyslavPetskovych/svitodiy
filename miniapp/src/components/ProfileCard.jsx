export default function ProfileCard({ user, balance }) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Мандрівник'

  return (
    <section className="flex items-center gap-4 rounded-2xl bg-tg-section p-4">
      <Avatar photoUrl={user.photoUrl} name={fullName} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold">
          {fullName} {user.isPremium && <span title="Telegram Premium">⭐</span>}
        </h1>
        {user.username && <p className="truncate text-sm text-tg-link">@{user.username}</p>}
        <p className="text-xs text-tg-hint">ID {user.id}</p>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold">✨ {balance ?? '—'}</p>
        <p className="text-xs text-tg-hint">промінчики</p>
      </div>
    </section>
  )
}

function Avatar({ photoUrl, name }) {
  if (photoUrl) {
    return <img src={photoUrl} alt="" className="size-14 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-tg-button text-xl font-semibold text-tg-button-text">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
