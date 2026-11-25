const {createError}=require('../middleware/errorHandler');

function isActive(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  const date=`${values.year}-${values.month}-${values.day}`;
  return date>='2026-10-28' && date<='2026-10-31';
}

function validateHalloweenPromotion(benefit,now=new Date()) {
  if(benefit==='HALLOWEEN' && !isActive(now))throw createError(422,'Promo Halloween solo esta vigente del 28 al 31 de octubre de 2026 (hora de Ecuador)');
}

module.exports=validateHalloweenPromotion;
module.exports.isActive=isActive;
