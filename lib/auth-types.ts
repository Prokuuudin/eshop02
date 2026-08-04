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
  passwordChangeSoft?: boolean // Сервер уже посчитал isPasswordChangeSoft — сырой pkLast3 клиенту не передаётся
  avatarUrl?: string // User profile photo (base64 or URL)
  bonusPoints?: number // Accumulated bonus balance
  mustChangePassword?: boolean // Требует обязательной смены пароля при первом входе
  isNewUser?: boolean // Новый пользователь — показать приветствие с предложением заполнить профиль
  createdAt?: string // ISO дата регистрации
}

export type PasswordChangeGateUser = {
  mustChangePassword?: boolean | null
  pkLast3?: string | null
  companyId?: string | null
}

// mustChangePassword is "soft" only when it came from a verified, per-person
// card+PK login (register-card individual branch) — not from a credential
// shared with other people (B2B FIRST_LOGIN_PASSWORD, access-request
// Welcome1!, or an admin-forced reset). Soft accounts get full site access
// and a dismissible recommendation instead of a blocking gate.
export function isPasswordChangeSoft(user: PasswordChangeGateUser): boolean {
  return Boolean(user.mustChangePassword) && user.pkLast3 != null && user.companyId == null
}
