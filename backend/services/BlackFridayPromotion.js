const {createError}=require('../middleware/errorHandler');
const prices=Object.freeze({moto:100,carro:156});
function isActive(now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 const date=values.year+'-'+values.month+'-'+values.day;
 return date>='2026-11-27' && date<='2026-11-28';
}
function validate(benefit,now=new Date()) {
 if(benefit==='BLACK_FRIDAY'&&!isActive(now))throw createError(422,'Black Friday solo esta vigente el 27 y 28 de noviembre de 2026 (hora de Ecuador).');
}
module.exports={prices,isActive,validate};
