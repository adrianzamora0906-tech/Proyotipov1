export function isCashReportUser(user) {
  const roles = user?.roles || [];
  if (roles.includes('ADMIN_SYSTEM') || roles.includes('GENERAL_MANAGER')) return false;
  return ['caja', 'secretaria_caja'].includes(String(user?.role || '').trim().toLowerCase()) || roles.includes('CASHIER');
}
export function reportPermission(user) {
  return isCashReportUser(user) ? 'PAYMENT_VIEW' : 'REPORT_VIEW';
}
