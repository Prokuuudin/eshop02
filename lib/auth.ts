import { useCompanyStore } from '@/lib/company-store'
import { useAccessRequestStore } from '@/lib/access-request-store'
import { logAuditAction } from '@/lib/audit-log-store'

export const FIRST_LOGIN_PASSWORD =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_FIRST_LOGIN_PASSWORD) || 'Welcome1!'

export type TeamRole = 'viewer' | 'buyer' | 'manager' | 'admin'
export type PlatformRole = 'customer' | 'admin'
export type AdminAccessLevel = 'none' | 'manager' | 'admin'

export type User = {
  id: string
  email: string
  password: string
  name?: string
  platformRole?: PlatformRole

  // B2B multi-user fields (optional)
  companyId?: string // Company this user belongs to
  companyName?: string // Quick reference
  teamRole?: TeamRole // Role within the team (viewer, buyer, manager, admin)
  approvalRequired?: boolean // Does this user's orders need approval?
  auditLoggingEnabled?: boolean // Should this user's actions be logged?

  phone?: string
  cardNumber?: string // Клиентская карта для входа по номеру карты
  avatarUrl?: string // User profile photo (base64 or URL)
  bonusPoints?: number // Accumulated bonus balance
  mustChangePassword?: boolean // Требует обязательной смены пароля при первом входе
  isNewUser?: boolean // Новый пользователь — показать приветствие с предложением заполнить профиль
  createdAt?: string // ISO дата регистрации
}

const USERS_KEY = 'eshop_users'
const CURRENT_KEY = 'eshop_current_user'

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

const findUserByEmail = (users: User[], email: string): User | undefined => {
  const normalizedEmail = normalizeEmail(email)
  return users.find((user) => user.email.toLowerCase() === normalizedEmail)
}

const normalizeUser = (user: Partial<User>): User => ({
  id: user.id ?? `u_${Date.now()}`,
  email: user.email ?? '',
  password: user.password ?? '',
  name: user.name,
  platformRole: user.platformRole === 'admin' ? 'admin' : 'customer',
  companyId: user.companyId,
  companyName: user.companyName,
  teamRole: user.teamRole,
  approvalRequired: user.approvalRequired,
  auditLoggingEnabled: user.auditLoggingEnabled,
  phone: user.phone,
  cardNumber: user.cardNumber,
  avatarUrl: user.avatarUrl ?? '',
  bonusPoints: user.bonusPoints ?? 350,
  mustChangePassword: user.mustChangePassword ?? false,
  isNewUser: user.isNewUser ?? false,
  createdAt: user.createdAt ?? new Date().toISOString(),
})

const notifyAuthChanged = (): void => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('eshop-user-changed'))
}

export const readUsers = (): User[] => {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Array<Partial<User>>
    return parsed.map(normalizeUser).filter((user) => user.email)
  } catch {
    return []
  }
}

export const writeUsers = (users: User[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

export const writeCurrentUser = (user: User): void => {
  localStorage.setItem(CURRENT_KEY, JSON.stringify(user))
}

export const hasAdminUsers = (): boolean => {
  return readUsers().some((user) => user.platformRole === 'admin')
}

export const registerAdminUser = (email: string, password: string, name?: string): { success: boolean; error?: string } => {
  const users = readUsers()

  if (users.some((user) => user.platformRole === 'admin')) {
    return { success: false, error: 'Администратор уже создан' }
  }

  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    return { success: false, error: 'Укажите email администратора' }
  }

  if (findUserByEmail(users, normalizedEmail)) {
    return { success: false, error: 'Пользователь с таким email уже существует' }
  }

  const adminUser: User = {
    id: `u_${Date.now()}`,
    email: normalizedEmail,
    password,
    name: name?.trim() || 'Administrator',
    platformRole: 'admin',
    auditLoggingEnabled: true
  }

  writeUsers([...users, adminUser])
  localStorage.setItem(CURRENT_KEY, JSON.stringify(adminUser))
  notifyAuthChanged()

  return { success: true }
}

// Клиентские submit/approve/reject-функции заявок удалены: заявки подаются
// через POST /api/access-requests, решения — через PATCH
// /api/admin/access-requests/[id] (создаёт держателя карты в Neon).
// Одна карта = один аккаунт; сценария «сотрудник в команду по карте» нет.

export const logout = (): void => {
  localStorage.removeItem(CURRENT_KEY)
  notifyAuthChanged()
}

export const getCurrentUser = (): User | null => {
  try {
    const raw = localStorage.getItem(CURRENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<User>
    return normalizeUser(parsed)
  } catch {
    return null
  }
}

export const isAdminUser = (user: User | null | undefined): boolean => {
  return user?.platformRole === 'admin'
}

export const getAdminAccessLevel = (user: User | null | undefined): AdminAccessLevel => {
  if (!user) return 'none'
  if (isAdminUser(user)) return 'admin'
  if (user.teamRole === 'manager' || user.teamRole === 'admin') return 'manager'
  return 'none'
}

export const canAccessAdminPanel = (user: User | null | undefined): boolean => {
  return getAdminAccessLevel(user) !== 'none'
}

export const hasFullAdminAccess = (user: User | null | undefined): boolean => {
  return getAdminAccessLevel(user) === 'admin'
}

export const canViewOrderHistory = (user: User | null | undefined): boolean => {
  if (!user) return false
  if (isAdminUser(user)) return true
  if (user.companyId) return true
  return true
}

export const canPlaceOrders = (user: User | null | undefined): boolean => {
  if (!user) return true
  if (!user.companyId) return true
  return user.teamRole === 'buyer' || user.teamRole === 'admin'
}

export const listCompanyUsers = (companyId: string): User[] => {
  return readUsers()
    .filter((user) => user.companyId === companyId)
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
}

export const updateUserTeamRole = (
  userId: string,
  nextRole: TeamRole,
  actor?: Pick<User, 'id' | 'email' | 'platformRole'> | null
): { success: boolean; error?: string; user?: User } => {
  if (actor && actor.platformRole !== 'admin') {
    return { success: false, error: 'Изменение ролей доступно только администратору' }
  }

  const users = readUsers()
  const userIndex = users.findIndex((item) => item.id === userId)
  if (userIndex === -1) {
    return { success: false, error: 'Пользователь не найден' }
  }

  const targetUser = users[userIndex]
  if (!targetUser.companyId) {
    return { success: false, error: 'Роль можно менять только у B2B аккаунтов' }
  }

  if (targetUser.platformRole === 'admin') {
    return { success: false, error: 'Роль платформенного администратора изменить нельзя' }
  }

  const company = useCompanyStore.getState().getCompany(targetUser.companyId)
  if (!company) {
    return { success: false, error: 'Компания пользователя не найдена' }
  }

  const updatedUser: User = {
    ...targetUser,
    teamRole: nextRole,
    approvalRequired: company.approvalWorkflowEnabled && nextRole !== 'admin'
  }

  users[userIndex] = updatedUser
  writeUsers(users)

  useCompanyStore.getState().updateTeamMemberRole(targetUser.companyId, targetUser.id, nextRole)

  const currentUser = getCurrentUser()
  if (currentUser?.id === updatedUser.id) {
    writeCurrentUser(updatedUser)
  }

  logAuditAction(
    targetUser.companyId,
    actor?.id ?? updatedUser.id,
    'team_member_role_updated',
    {
      targetUserId: updatedUser.id,
      targetUserEmail: updatedUser.email,
      nextRole
    },
    {
      userEmail: actor?.email
    }
  )

  notifyAuthChanged()
  return { success: true, user: updatedUser }
}

const TEST_ADMIN_ID = 'seed_admin_001'
const TEST_USER_ID = 'seed_user_001'

export const registerCardUser = (data: {
  cardNumber: string
  name?: string
  companyId: string
  companyName: string
}): { success: boolean; error?: string } => {
  const users = readUsers()
  const normalizedCard = normalizeCard(data.cardNumber)

  if (users.some((u) => u.cardNumber && normalizeCard(u.cardNumber) === normalizedCard)) {
    return { success: false, error: 'Аккаунт с этой картой уже зарегистрирован' }
  }

  const companyStore = useCompanyStore.getState()
  const company = companyStore.getCompany(data.companyId)

  // Генерируем внутренний email — клиенту он не показывается
  const internalEmail = `card.${normalizedCard.toLowerCase()}@client.local`

  const user: User = normalizeUser({
    id: `u_${Date.now()}`,
    email: internalEmail,
    password: FIRST_LOGIN_PASSWORD,
    name: data.name,
    cardNumber: normalizedCard,
    platformRole: 'customer',
    companyId: data.companyId,
    companyName: company?.companyName ?? data.companyName,
    teamRole: 'buyer',
    approvalRequired: company?.approvalWorkflowEnabled ?? false,
    auditLoggingEnabled: true,
    mustChangePassword: true,
    isNewUser: true,
  })

  writeUsers([...users, user])

  companyStore.addTeamMember(data.companyId, {
    userId: user.id,
    email: user.email,
    role: 'buyer',
    name: data.name || normalizedCard,
    addedAt: new Date(),
  })

  writeCurrentUser(user)
  notifyAuthChanged()
  return { success: true }
}

export const clearNewUserFlag = (): void => {
  const user = getCurrentUser()
  if (!user) return
  const users = readUsers()
  const idx = users.findIndex((u) => u.id === user.id)
  if (idx === -1) return
  users[idx] = { ...users[idx], isNewUser: false }
  writeUsers(users)
  writeCurrentUser(users[idx])
  notifyAuthChanged()
}

export const forceChangePassword = (newPassword: string): { success: boolean; error?: string } => {
  const user = getCurrentUser()
  if (!user) return { success: false, error: 'Не авторизован' }
  if (newPassword.length < 6) {
    return { success: false, error: 'Пароль должен быть не менее 6 символов' }
  }
  const users = readUsers()
  const idx = users.findIndex((u) => u.id === user.id)
  if (idx === -1) return { success: false, error: 'Пользователь не найден' }
  users[idx] = { ...users[idx], password: newPassword, mustChangePassword: false }
  writeUsers(users)
  writeCurrentUser(users[idx])
  notifyAuthChanged()
  return { success: true }
}

const normalizeCard = (cardNumber: string): string =>
  cardNumber.trim().replace(/\s+/g, '').toUpperCase()

export const submitNoCardRequest = (data: {
  name: string
  email: string
  phone?: string
  certificateData: string
  certificateName: string
  message?: string
  language?: 'ru' | 'en' | 'lv'
}): { success: boolean; error?: string } => {
  const users = readUsers()
  const normalizedEmail = normalizeEmail(data.email)

  if (!normalizedEmail) return { success: false, error: 'Укажите email' }
  if (findUserByEmail(users, normalizedEmail)) return { success: false, error: 'Пользователь с таким email уже существует' }

  const accessRequestStore = useAccessRequestStore.getState()
  if (accessRequestStore.getPendingRequestByEmail(normalizedEmail)) {
    return { success: false, error: 'Заявка с таким email уже ожидает рассмотрения' }
  }

  accessRequestStore.createRequest({
    email: normalizedEmail,
    password: FIRST_LOGIN_PASSWORD,
    name: data.name,
    phone: data.phone,
    companyId: '',
    companyName: '',
    cardNumber: '',
    requestType: 'no-card',
    certificateData: data.certificateData,
    certificateName: data.certificateName,
    message: data.message,
    language: data.language,
  })

  return { success: true }
}

const cardToEmail = (cardNumber: string): string =>
  `card.${normalizeCard(cardNumber).toLowerCase()}@client.local`

/**
 * Authenticates against the server (bcrypt-verified, rate-limited) — the client
 * never decides whether a password is correct. `identifier` may be an email or
 * a client card number; card numbers resolve to their deterministic internal
 * email (same pattern used at card registration) without needing to trust any
 * locally-cached password. On success, the local mirror is refreshed for UI
 * purposes only, with the password field blanked — it is never the source of
 * truth for auth again once a login round-trip has verified the account.
 */
export const loginUserAuto = async (
  identifier: string,
  password: string
): Promise<{ success: boolean; error?: string }> => {
  const trimmed = identifier.trim()
  const isEmail = trimmed.includes('@')
  const email = isEmail ? normalizeEmail(trimmed) : cardToEmail(trimmed)
  const users = readUsers()
  const localUser = findUserByEmail(users, email)

  let res: Response
  try {
    res = await fetch('/api/auth/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: localUser?.id ?? `u_${Date.now()}`,
        email,
        password,
        name: localUser?.name,
        phone: localUser?.phone,
        cardNumber: localUser?.cardNumber ?? (isEmail ? undefined : normalizeCard(trimmed)),
        avatarUrl: localUser?.avatarUrl,
      }),
    })
  } catch {
    return { success: false, error: 'Сервер недоступен. Попробуйте позже.' }
  }

  if (res.status === 429) {
    return { success: false, error: 'Слишком много попыток входа. Попробуйте позже.' }
  }
  if (!res.ok) {
    return { success: false, error: isEmail ? 'Неверный email или пароль' : 'Неверный номер карты или пароль' }
  }

  const verifiedUser: User = localUser
    ? { ...localUser, password: '' }
    : normalizeUser({ id: `u_${Date.now()}`, email, password: '' })

  if (!localUser) {
    writeUsers([...users, verifiedUser])
  } else if (localUser.password) {
    const idx = users.findIndex((u) => u.id === localUser.id)
    if (idx !== -1) {
      users[idx] = verifiedUser
      writeUsers(users)
    }
  }

  if (verifiedUser.companyId) {
    useCompanyStore.getState().setCurrentCompany(verifiedUser.companyId)
  }
  writeCurrentUser(verifiedUser)
  notifyAuthChanged()
  return { success: true }
}

export type ActivatePayload = {
  email: string
  name?: string
  cardNumber: string
  phone?: string
  password: string
  companyId: string
  companyName: string
}

export const activateRegistration = (data: ActivatePayload): { success: boolean; error?: string } => {
  const users = readUsers()
  if (findUserByEmail(users, data.email)) {
    return { success: false, error: 'Пользователь с таким email уже существует' }
  }

  const companyStore = useCompanyStore.getState()
  const company = companyStore.getCompany(data.companyId)

  const user: User = normalizeUser({
    id: `u_${Date.now()}`,
    email: normalizeEmail(data.email),
    password: data.password,
    name: data.name,
    phone: data.phone,
    cardNumber: data.cardNumber,
    platformRole: 'customer',
    companyId: data.companyId,
    companyName: company?.companyName ?? data.companyName,
    teamRole: 'buyer',
    approvalRequired: company?.approvalWorkflowEnabled ?? false,
    auditLoggingEnabled: true,
  })

  writeUsers([...users, user])
  notifyAuthChanged()
  return { success: true }
}

export const seedTestAccounts = (): void => {
  if (typeof window === 'undefined') return
  // Never inject demo admin/user accounts (admin@test.com / admin123) into production browsers.
  if (process.env.NODE_ENV === 'production') return

  const users = readUsers()

  const hasAdmin = users.some((u) => u.id === TEST_ADMIN_ID || u.platformRole === 'admin')
  const hasTestUser = users.some((u) => u.id === TEST_USER_ID)

  if (hasAdmin && hasTestUser) return

  const next = [...users]

  if (!hasAdmin) {
    next.push(normalizeUser({
      id: TEST_ADMIN_ID,
      email: 'admin@test.com',
      password: 'admin123',
      name: 'Test Admin',
      platformRole: 'admin',
      auditLoggingEnabled: true,
      bonusPoints: 0,
    }))
  }

  if (!hasTestUser) {
    next.push(normalizeUser({
      id: TEST_USER_ID,
      email: 'user@test.com',
      password: 'user123',
      name: 'Test User',
      platformRole: 'customer',
      bonusPoints: 350,
    }))
  }

  writeUsers(next)
}

export const adjustUserBonusPoints = (
  userId: string,
  delta: number
): { success: boolean; newBalance?: number; error?: string } => {
  const users = readUsers()
  const idx = users.findIndex((u) => u.id === userId)
  if (idx === -1) return { success: false, error: 'Пользователь не найден' }

  const newBalance = Math.max(0, (users[idx].bonusPoints ?? 0) + delta)
  users[idx] = { ...users[idx], bonusPoints: newBalance }
  writeUsers(users)

  const current = getCurrentUser()
  if (current?.id === userId) {
    writeCurrentUser({ ...current, bonusPoints: newBalance })
    notifyAuthChanged()
  }

  // Sync to DB — fire-and-forget
  if (typeof window !== 'undefined') {
    fetch('/api/user/bonus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta, userId }),
    }).catch(() => {})
  }

  return { success: true, newBalance }
}

// Подтянуть баланс баллов из БД в localStorage — сервер сам дебетует/кредитует
// его при создании заказа, клиенту начислять напрямую запрещено (403 на положительную дельту).
export const syncBonusBalanceFromServer = async (): Promise<void> => {
  try {
    const res = await fetch('/api/user/bonus')
    if (!res.ok) return
    const { bonusPoints } = (await res.json()) as { bonusPoints?: number }
    const current = getCurrentUser()
    if (!current || typeof bonusPoints !== 'number') return

    const users = readUsers()
    const idx = users.findIndex((u) => u.id === current.id)
    if (idx !== -1) {
      users[idx] = { ...users[idx], bonusPoints }
      writeUsers(users)
    }
    writeCurrentUser({ ...current, bonusPoints })
    notifyAuthChanged()
  } catch { /* ignore — баланс подтянется на странице аккаунта */ }
}
