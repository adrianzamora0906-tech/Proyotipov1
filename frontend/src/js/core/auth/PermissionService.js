import { authService } from './AuthService.js';
class PermissionService{getPermissions(){return authService.getCurrentUser()?.permissions||[];}can(code){return this.getPermissions().includes(code);}canAny(codes){return codes.some(code=>this.can(code));}canAll(codes){return codes.every(code=>this.can(code));}hasGlobalScope(){return authService.getCurrentUser()?.scope==='GLOBAL';}}
export const permissionService=new PermissionService();export default PermissionService;
