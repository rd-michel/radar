import { useAuthMe } from '../api/client'

export function UserMenu() {
  const { data: authMe } = useAuthMe()

  if (!authMe?.authEnabled || !authMe?.username) {
    return null
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="truncate max-w-[200px]" title={authMe.username}>
        {authMe.username}
      </span>
      <a
        href="/auth/logout"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Logout
      </a>
    </div>
  )
}
