import test from'node:test';import assert from'node:assert/strict';
global.sessionStorage={data:new Map(),getItem(k){return this.data.get(k)||null;},setItem(k,v){this.data.set(k,v);},removeItem(k){this.data.delete(k);}};
const{permissionService}=await import('../src/js/core/auth/PermissionService.js');
test('can y canAny usan permisos efectivos de la sesión',()=>{sessionStorage.setItem('erp_session',JSON.stringify({apiToken:'x',permissions:['STUDENT_VIEW','PAYMENT_CREATE'],scope:'BRANCH'}));assert.equal(permissionService.can('PAYMENT_CREATE'),true);assert.equal(permissionService.can('USER_CREATE'),false);assert.equal(permissionService.canAny(['USER_CREATE','STUDENT_VIEW']),true);});
test('hasGlobalScope distingue alcance global',()=>{sessionStorage.setItem('erp_session',JSON.stringify({apiToken:'x',permissions:[],scope:'GLOBAL'}));assert.equal(permissionService.hasGlobalScope(),true);});
