import { useCompanyStore } from '@/lib/company-store'
import { logAuditAction } from '@/lib/audit-log-store'

// Not the real shared welcome password: that constant is server-only (see
// lib/auth-constants.ts) precisely so it never ends up in this client bundle.
// The stored hash built from this placeholder is never read for gating —
// register-card checks the User.mustChangePassword flag + the plaintext
// welcome password against the server-side constant directly, not this hash.
const NO_CARD_REQUEST_PLACEHOLDER_PASSWORD = 'no-card-request-pending-review'

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
  void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {
    // Best-effort: local state clears regardless, same as before this call existed.
  })
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

export type RegisterCardErrorCode =
  | 'card_not_found'
  | 'card_already_registered'
  | 'wrong_password'
  | 'too_many_attempts'
  | 'network_error'
  | 'server_error'

/**
 * Registers a B2B customer against a real company card number. Validates the
 * card and creates the account server-side (Prisma + session cookie) via
 * /api/auth/register-card — never locally. A local-only account would look
 * logged in but be invisible to every server-authoritative endpoint (orders,
 * bonus, addresses), so this must round-trip the server like loginUserAuto.
 */
export const registerCardUser = async (data: {
  cardNumber: string
  password: string
  name?: string
  privacyAcknowledged?: boolean
  marketingConsent?: boolean
}): Promise<{ success: boolean; errorCode?: RegisterCardErrorCode }> => {
  const normalizedCard = normalizeCard(data.cardNumber)

  let res: Response
  try {
    res = await fetch('/api/auth/register-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardNumber: normalizedCard,
        password: data.password,
        name: data.name,
        privacyAcknowledged: data.privacyAcknowledged === true,
        marketingConsent: data.marketingConsent === true,
      }),
    })
  } catch {
    return { success: false, errorCode: 'network_error' }
  }

  if (res.status === 404) return { success: false, errorCode: 'card_not_found' }
  if (res.status === 409) return { success: false, errorCode: 'card_already_registered' }
  if (res.status === 401) return { success: false, errorCode: 'wrong_password' }
  if (res.status === 429) return { success: false, errorCode: 'too_many_attempts' }
  if (!res.ok) return { success: false, errorCode: 'server_error' }

  const payload = (await res.json()) as { user?: Partial<User> & { id: string; email: string } }
  if (!payload.user) return { success: false, errorCode: 'server_error' }

  const verifiedUser = normalizeUser({ ...payload.user, password: '', isNewUser: true })
  const users = readUsers().filter((u) => u.id !== verifiedUser.id)
  writeUsers([...users, verifiedUser])
  writeCurrentUser(verifiedUser)

  if (verifiedUser.companyId) {
    useCompanyStore.getState().setCurrentCompany(verifiedUser.companyId)
  }

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

// Forced first-login password change. Writes the new password to the DB (bcrypt) via the
// session — the old version mutated only localStorage, so the real hash never changed and the
// user was locked to the default password on their next login.
export const forceChangePassword = async (
  newPassword: string
): Promise<{ success: boolean; error?: string }> => {
  const user = getCurrentUser()
  if (!user) return { success: false, error: 'Не авторизован' }
  if (newPassword.length < 6) {
    return { success: false, error: 'Пароль должен быть не менее 6 символов' }
  }

  let res: Response
  try {
    res = await fetch('/api/user/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword }),
    })
  } catch {
    return { success: false, error: 'Сервер недоступен. Попробуйте позже.' }
  }
  if (!res.ok) {
    return { success: false, error: 'Не удалось сменить пароль. Попробуйте позже.' }
  }

  const users = readUsers()
  const idx = users.findIndex((u) => u.id === user.id)
  if (idx !== -1) {
    users[idx] = { ...users[idx], password: '', mustChangePassword: false }
    writeUsers(users)
    writeCurrentUser(users[idx])
  } else {
    writeCurrentUser({ ...user, password: '', mustChangePassword: false })
  }
  notifyAuthChanged()
  return { success: true }
}

const normalizeCard = (cardNumber: string): string =>
  cardNumber.trim().replace(/\s+/g, '').toUpperCase()

export const submitNoCardRequest = async (data: {
  name: string
  email: string
  phone?: string
  certificateData: string
  certificateName: string
  message?: string
  language?: 'ru' | 'en' | 'lv'
  turnstileToken?: string
  privacyAcknowledged?: boolean
  marketingConsent?: boolean
}): Promise<{ success: boolean; error?: string }> => {
  const normalizedEmail = normalizeEmail(data.email)

  if (!normalizedEmail) return { success: false, error: 'Укажите email' }
  // Remove sensitive drafts left by the legacy persisted request store.
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('access-request-store')
  }

  let response: Response
  try {
    response = await fetch('/api/access-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        password: NO_CARD_REQUEST_PLACEHOLDER_PASSWORD,
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
        turnstileToken: data.turnstileToken,
        privacyAcknowledged: data.privacyAcknowledged === true,
        marketingConsent: data.marketingConsent === true,
      }),
    })
  } catch {
    return { success: false, error: 'Сервер недоступен. Попробуйте позже.' }
  }

  if (response.ok) return { success: true }

  const payload = await response.json().catch(() => ({})) as { error?: string }
  const errors: Record<string, string> = {
    pending_exists: 'Заявка с таким email уже ожидает рассмотрения.',
    rate_limited: 'Слишком много попыток. Попробуйте позже.',
    captcha_required: 'Подтвердите, что вы не робот.',
    captcha_failed: 'Проверка CAPTCHA не пройдена. Попробуйте ещё раз.',
    captcha_not_configured: 'Отправка заявок временно недоступна.',
    certificate_too_large: 'Файл слишком большой.',
    invalid_certificate: 'Недопустимый формат сертификата.',
    privacy_acknowledgement_required: 'Подтвердите, что вы ознакомились с Политикой конфиденциальности.',
  }
  return {
    success: false,
    error: errors[payload.error ?? ''] ?? 'Не удалось сохранить заявку. Попробуйте позже.',
  }
}

/**
 * Authenticates against the server (bcrypt-verified, rate-limited) — the client
 * never decides whether a password is correct. `identifier` may be an email or
 * a client card number; the server looks up User.email or User.cardNumber
 * directly without trusting any locally-cached directory. On success, the local mirror is refreshed for UI
 * purposes only, with the password field blanked — it is never the source of
 * truth for auth again once a login round-trip has verified the account.
 */
export const loginUserAuto = async (
  identifier: string,
  password: string
): Promise<{ success: boolean; error?: string }> => {
  const trimmed = identifier.trim()
  const isEmail = trimmed.includes('@')
  const users = readUsers()

  let res: Response
  try {
    res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: trimmed,
        password,
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

  const payload = await res.json().catch(() => ({})) as {
    user?: Partial<User> & { id: string; email: string }
  }
  if (!payload.user) {
    return { success: false, error: 'Не удалось загрузить аккаунт' }
  }

  const verifiedUser = normalizeUser({ ...payload.user, password: '' })
  const nextUsers = users.filter((u) => u.id !== verifiedUser.id && u.email !== verifiedUser.email)
  writeUsers([...nextUsers, verifiedUser])

  if (verifiedUser.companyId) {
    useCompanyStore.getState().setCurrentCompany(verifiedUser.companyId)
  }
  writeCurrentUser(verifiedUser)
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
