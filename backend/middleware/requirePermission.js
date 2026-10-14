const AuthorizationService = require('../services/AuthorizationService');

function resolveBranchId(req, source) {
  if (typeof source === 'function') return source(req);
  if (source) return req.params[source] || req.body?.[source] || req.query?.[source] || null;
  return req.user?.branch_id || null;
}

function requirePermission(permissionCode, options = {}) {
  return async (req, res, next) => {
    try {
      const requestedBranchId = resolveBranchId(req, options.branchSource);
      const auth = await AuthorizationService.getUserAuthorizationContext(req.user.id, requestedBranchId);
      const acceptedPermissions = [permissionCode, ...(options.anyOf || [])];
      if (!auth || !acceptedPermissions.some(code => auth.permissions.includes(code))) {
        return res.status(403).json({ success: false, error: 'No tienes permiso para esta acción' });
      }
      if (requestedBranchId && !auth.global
        && !auth.roleAssignments.some(role => String(role.branch_id) === String(requestedBranchId))
        && String(auth.operationalCoverage?.operational_branch_id || '') !== String(requestedBranchId)) {
        return res.status(403).json({ success: false, error: 'No tienes acceso a esta sucursal' });
      }
      req.authorization = auth;
      req.user.roles = auth.roles;
      req.user.permissions = auth.permissions;
      req.user.scope = auth.scope;
      req.user.global = auth.global;
      Object.assign(req.requestContext, {
        userId: req.user.id,
        branchId: auth.global ? requestedBranchId : auth.branchId,
        roles: auth.roles,
        scope: auth.scope,
        permissions: auth.permissions,
        operationalCoverage: auth.operationalCoverage || null,
        sessionId: req.user.sessionId || null,
      });
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = requirePermission;
