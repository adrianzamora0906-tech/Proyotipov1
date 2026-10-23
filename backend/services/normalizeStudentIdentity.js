const {createError}=require('../middleware/errorHandler');
module.exports=function normalizeStudentIdentity(data){
 const result={...data};
 for(const key of ['firstName','lastName','address','notes','nationality']){
  if(typeof result[key]==='string')result[key]=result[key].trim().toLocaleUpperCase('es');
 }
 if(result.nationality!==undefined&&result.nationality!==null){
  if(typeof result.nationality!=='string'||result.nationality.length>100)throw createError(422,'Nacionalidad invalida (maximo 100 caracteres)');
  result.nationality=result.nationality||null;
 }
 return result;
};
