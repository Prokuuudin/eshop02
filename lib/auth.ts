import { useCompanyStore } from '@/lib/company-store'
import { useAccessRequestStore } from '@/lib/access-request-store'
import { logAuditAction } from '@/lib/audit-log-store'

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
  auditLoggingEnabled: user.auditLoggingEnabled
})

const notifyAuthChanged = (): void => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('eshop-user-changed'))
}

const readUsers = (): User[] => {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Array<Partial<User>>
    return parsed.map(normalizeUser).filter((user) => user.email)
  } catch {
    return []
  }
}

const writeUsers = (users: User[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

const writeCurrentUser = (user: User): void => {
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

export const submitAccessRequest = (email: string, password: string, name?: string, barcode?: string): { success: boolean; error?: string; companyName?: string } => {
  const users = readUsers()
  const normalizedEmail = normalizeEmail(email)

  if (!normalizedEmail) return { success: false, error: 'Укажите email' }
  if (findUserByEmail(users, normalizedEmail)) return { success: false, error: 'Пользователь с таким email уже существует' }

  const normalizedBarcode = barcode?.trim()
  if (!normalizedBarcode) return { success: false, error: 'Укажите баркод клиента' }

  const companyStore = useCompanyStore.getState()
  const company = companyStore.getCompanyByBarcode(normalizedBarcode)
  if (!company) return { success: false, error: 'Клиент с таким баркодом не найден' }

  const accessRequestStore = useAccessRequestStore.getState()
  if (accessRequestStore.getPendingRequestByEmail(normalizedEmail)) {
    return { success: false, error: 'Заявка с таким email уже ожидает одобрения' }
  }

  accessRequestStore.createRequest({
    email: normalizedEmail,
    password,
    name,
    companyId: company.companyId,
    companyName: company.companyName,
    barcode: normalizedBarcode
  })

  logAuditAction(
    company.companyId,
    `request_${normalizedEmail}`,
    'access_request_submitted',
    {
      email: normalizedEmail,
      companyName: company.companyName,
      barcode: normalizedBarcode
    },
    {
      userName: name,
      userEmail: normalizedEmail
    }
  )

  return { success: true, companyName: company.companyName }
}

const createApprovedUser = (params: {
  email: string
  password: string
  name?: string
  companyId: string
  companyName: string
  teamRole: TeamRole
  approvalRequired: boolean
  addedBy?: string
}): User => {
  const users = readUsers()
  const user: User = {
    id: `u_${Date.now()}`,
    email: params.email,
    password: params.password,
    name: params.name,
    platformRole: 'customer',
    companyId: params.companyId,
    companyName: params.companyName,
    teamRole: params.teamRole,
    approvalRequired: params.approvalRequired,
    auditLoggingEnabled: true
  }

  users.push(user)
  writeUsers(users)

  useCompanyStore.getState().addTeamMember(params.companyId, {
    userId: user.id,
    email: user.email,
    role: params.teamRole,
    name: user.name || user.email,
    addedAt: new Date(),
    addedBy: params.addedBy
  })

  return user
}

export const approveAccessRequest = (
  requestId: string,
  teamRole: TeamRole,
  reviewer?: Pick<User, 'id' | 'email'> | null,
  reviewNote?: string
): { success: boolean; error?: string; user?: User } => {
  const accessRequestStore = useAccessRequestStore.getState()
  const request = accessRequestStore.getRequest(requestId)
  if (!request || request.status !== 'pending') {
    return { success: false, error: 'Заявка не найдена или уже обработана' }
  }

  const users = readUsers()
  if (findUserByEmail(users, request.email)) {
    accessRequestStore.rejectRequest(requestId, {
      reviewedByUserId: reviewer?.id,
      reviewedByEmail: reviewer?.email,
      reviewNote: 'Аккаунт с таким email уже существует'
    })
    return { success: false, error: 'Пользователь с таким email уже существует' }
  }

  const companyStore = useCompanyStore.getState()
  const company = companyStore.getCompany(request.companyId)
  if (!company) {
    return { success: false, error: 'Компания для заявки не найдена' }
  }

  const user = createApprovedUser({
    email: request.email,
    password: request.password,
    name: request.name,
    companyId: company.companyId,
    companyName: company.companyName,
    teamRole,
    approvalRequired: company.approvalWorkflowEnabled && teamRole !== 'admin',
    addedBy: reviewer?.id
  })

  accessRequestStore.approveRequest(requestId, {
    reviewedByUserId: reviewer?.id,
    reviewedByEmail: reviewer?.email,
    reviewNote,
    approvedTeamRole: teamRole
  })

  logAuditAction(
    company.companyId,
    reviewer?.id ?? user.id,
    'access_request_approved',
    {
      requestId,
      approvedEmail: user.email,
      teamRole
    },
    {
      userEmail: reviewer?.email
    }
  )

  return { success: true, user }
}

export const rejectAccessRequest = (
  requestId: string,
  reviewer?: Pick<User, 'id' | 'email'> | null,
  reviewNote?: string
): { success: boolean; error?: string } => {
  const accessRequestStore = useAccessRequestStore.getState()
  const request = accessRequestStore.getRequest(requestId)
  if (!request || request.status !== 'pending') {
    return { success: false, error: 'Заявка не найдена или уже обработана' }
  }

  accessRequestStore.rejectRequest(requestId, {
    reviewedByUserId: reviewer?.id,
    reviewedByEmail: reviewer?.email,
    reviewNote
  })

  logAuditAction(
    request.companyId,
    reviewer?.id ?? `request_${request.email}`,
    'access_request_rejected',
    {
      requestId,
      rejectedEmail: request.email,
      reviewNote
    },
    {
      userEmail: reviewer?.email
    }
  )

  return { success: true }
}

export const loginUser = (email: string, password: string): { success: boolean; error?: string } => {
  const users = readUsers()
  const normalizedEmail = normalizeEmail(email)
  const user = users.find((u) => u.email.toLowerCase() === normalizedEmail && u.password === password)
  if (!user) return { success: false, error: 'Неверный email или пароль' }
  if (user.companyId) {
    useCompanyStore.getState().setCurrentCompany(user.companyId)
  }
  writeCurrentUser(user)
  notifyAuthChanged()
  return { success: true }
}

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
