const {createError}=require('../middleware/errorHandler');
module.exports=function validateComboSize(benefit,size){
  if(benefit!=='COMBO')return null;
  const count=Number(size);
  if(!Number.isSafeInteger(count)||count<2||count>100)throw createError(422,'El combo requiere entre 2 y 100 personas que se inscriben juntas.');
  return count;
};
