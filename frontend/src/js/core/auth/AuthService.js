import ApiService from '../api/apiService.js';
import { apiClient } from '../api/ApiClient.js';

class AuthService {
  constructor() { this.sessionKey = 'erp_session'; this.authorizationPromise = null; this.authorizationKey = null; this.authorizationCheckedAt = 0; }
  initializeUsers() { /* La identidad se administra exclusivamente en PostgreSQL. */ }
  async login(username, password) {
    try {
      // La pantalla de acceso inicia una autenticacion nueva. No debe reutilizar
      // tokens de una sesion anterior para intentar refrescar un login fallido.
      sessionStorage.removeItem(this.sessionKey);
      apiClient.setToken(null);
      this.authorizationPromise=null;this.authorizationKey=null;this.authorizationCheckedAt=0;
      const result = await ApiService.login(username, password);
      if (!result.success || !result.user) return { success:false, message:'Credenciales inválidas' };
      const user=result.user;const session={userId:user.id,username:user.username,name:user.name,email:user.email,
        role:user.role,roles:user.roles||[],branch:user.branch,branch_id:user.branch_id,avatar:user.avatar,
        apiToken:user.token,refreshToken:user.refreshToken,sessionId:user.sessionId,permissions:user.permissions||[],
        scope:user.scope||'BRANCH',instructorType:user.instructorType||null,practiceArea:user.practiceArea||null,
        mustChangePassword:user.mustChangePassword,loginTime:new Date().toISOString()};
      sessionStorage.setItem(this.sessionKey,JSON.stringify(session));apiClient.setToken(user.token);
      return{success:true,message:'Sesión iniciada',user:session};
    }catch(error){return{success:false,message:error.message||'No se pudo conectar con el servidor'};}
  }
  async refreshAuthorization(branchId=null){
    const user=this.getCurrentUser();if(!user)return null;
    const key=String(branchId||user.branch_id||'');
    if(this.authorizationKey===key&&Date.now()-this.authorizationCheckedAt<5000)return user;
    if(this.authorizationPromise&&this.authorizationKey===key)return this.authorizationPromise;
    const q=key?`?branchId=${encodeURIComponent(key)}`:'';
    this.authorizationKey=key;
    this.authorizationPromise=apiClient.get(`/auth/authorization${q}`).then(r=>{
      if(!r?.success||!r.data)throw new Error(r?.error||'No se pudieron actualizar los permisos');
      const current=this.getCurrentUser()||user;
      const hasFreshAuthorization = Array.isArray(r.data.roles) && r.data.roles.length > 0
        && Array.isArray(r.data.permissions) && r.data.permissions.length > 0;
      const nextRoles = hasFreshAuthorization ? r.data.roles : (Array.isArray(current.roles) ? current.roles : []);
      const nextPermissions = hasFreshAuthorization ? r.data.permissions : (Array.isArray(current.permissions) ? current.permissions : []);
      const nextScope = hasFreshAuthorization ? (r.data.scope || current.scope || 'BRANCH') : (current.scope || 'BRANCH');
      const session={
        ...current,
        roles: nextRoles,
        permissions: nextPermissions,
        scope: nextScope,
        instructorType: hasFreshAuthorization ? (r.data.instructorType ?? current.instructorType ?? null) : (current.instructorType ?? null),
        practiceArea: hasFreshAuthorization ? (r.data.practiceArea ?? current.practiceArea ?? null) : (current.practiceArea ?? null),
        mustChangePassword: r.data.mustChangePassword ?? current.mustChangePassword ?? false,
      };
      sessionStorage.setItem(this.sessionKey,JSON.stringify(session));
      this.authorizationCheckedAt=Date.now();
      return session;
    }).finally(()=>{this.authorizationPromise=null;});
    return this.authorizationPromise;
  }
  async logout(){try{if(apiClient.getToken())await apiClient.post('/auth/logout',{});}catch(error){console.warn('No se pudo confirmar el logout:',error.message);}finally{sessionStorage.removeItem(this.sessionKey);apiClient.setToken(null);this.authorizationPromise=null;this.authorizationKey=null;this.authorizationCheckedAt=0;}return{success:true,message:'Sesión cerrada'};}
  getCurrentUser(){try{return JSON.parse(sessionStorage.getItem(this.sessionKey)||'null');}catch{return null;}}
  isAuthenticated(){return Boolean(this.getCurrentUser()?.apiToken);}
  hasRole(role){const user=this.getCurrentUser();return user?.roles?.includes(role)||user?.role===role;}
  can(permission){return this.getCurrentUser()?.permissions?.includes(permission)||false;}
  async updateProfile(updates){const result=await ApiService.updateProfile(updates);const current=this.getCurrentUser();sessionStorage.setItem(this.sessionKey,JSON.stringify({...current,...updates}));return result.user;}
  async updatePassword(currentPassword,newPassword){const result=await ApiService.updatePassword(currentPassword,newPassword);if(result.success){const current=this.getCurrentUser();sessionStorage.setItem(this.sessionKey,JSON.stringify({...current,mustChangePassword:false}));}return result;}
  getAllUsers(){return[];}
}
export const authService=new AuthService();export default AuthService;
