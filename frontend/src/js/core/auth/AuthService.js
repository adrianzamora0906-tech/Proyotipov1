import ApiService from '../api/apiService.js';
import { apiClient } from '../api/ApiClient.js';

class AuthService {
  constructor() { this.sessionKey = 'erp_session'; }
  initializeUsers() { /* La identidad se administra exclusivamente en PostgreSQL. */ }
  async login(username, password) {
    try {
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
  async refreshAuthorization(branchId=null){const user=this.getCurrentUser();if(!user)return null;const q=branchId?`?branchId=${encodeURIComponent(branchId)}`:'';const r=await apiClient.get(`/auth/authorization${q}`);const session={...user,roles:r.data.roles||[],permissions:r.data.permissions||[],scope:r.data.scope||'BRANCH',instructorType:r.data.instructorType||null,practiceArea:r.data.practiceArea||null};sessionStorage.setItem(this.sessionKey,JSON.stringify(session));return session;}
  async logout(){try{if(apiClient.getToken())await apiClient.post('/auth/logout',{});}catch(error){console.warn('No se pudo confirmar el logout:',error.message);}finally{sessionStorage.removeItem(this.sessionKey);apiClient.setToken(null);}return{success:true,message:'Sesión cerrada'};}
  getCurrentUser(){try{return JSON.parse(sessionStorage.getItem(this.sessionKey)||'null');}catch{return null;}}
  isAuthenticated(){return Boolean(this.getCurrentUser()?.apiToken);}
  hasRole(role){const user=this.getCurrentUser();return user?.roles?.includes(role)||user?.role===role;}
  can(permission){return this.getCurrentUser()?.permissions?.includes(permission)||false;}
  async updateProfile(updates){const result=await ApiService.updateProfile(updates);const current=this.getCurrentUser();sessionStorage.setItem(this.sessionKey,JSON.stringify({...current,...updates}));return result.user;}
  getAllUsers(){return[];}
}
export const authService=new AuthService();export default AuthService;
