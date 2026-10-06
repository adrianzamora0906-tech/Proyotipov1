import PracticalSessionService from '../../services/practicalSessionService.js';
import { stateMessage } from './InstructorHelpers.js';

const TOPICS = [
  ['SEGURIDAD_PREVIA', 'Seguridad previa'], ['ARRANQUE_PARADA', 'Arranque y parada'],
  ['CONTROL_EQUILIBRIO', 'Control y equilibrio'], ['CAMBIOS_ACELERACION', 'Cambios y aceleración'],
  ['FRENADO', 'Frenado'], ['CURVAS_PENDIENTES', 'Curvas y pendientes'],
  ['CIRCULACION_SENALES', 'Circulación y señales'], ['MANIOBRAS_ESTACIONAMIENTO', 'Maniobras y estacionamiento'],
];
const PERFORMANCE_OPTIONS = [
  ['REQUIERE_ACOMPANAMIENTO', 'Requiere acompañamiento', 'Necesitó ayuda constante.'],
  ['EN_DESARROLLO', 'En desarrollo', 'Presentó dificultades, pero mostró avance.'],
  ['CUMPLIO_OBJETIVO', 'Cumplió el objetivo', 'Realizó correctamente lo practicado.'],
  ['DOMINO_PRACTICADO', 'Dominó lo practicado', 'Lo realizó de forma autónoma y segura.'],
];

export async function openCompleteSessionModal(sessionId, onCompleted) {
  let attendance;
  try {
    const response = await PracticalSessionService.getAttendanceQrStatus(sessionId, 'EXIT');
    attendance = response.data;
  } catch (error) {
    window.alert(stateMessage(error));
    return;
  }
  const requiresMileage = attendance.requiresMileage === true;
  const mileageEnabled = attendance.mileageEnabled === true;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active complete-session-overlay';
  overlay.innerHTML = `<div class="modal complete-session-modal" role="dialog" aria-modal="true" aria-labelledby="complete-session-title"><form data-complete-session-form>
    <div class="modal-header"><div><h3 class="modal-title" id="complete-session-title">Finalizar clase</h3><p class="card-subtitle">Registra únicamente lo trabajado y el desempeño de esta clase.</p></div><button type="button" class="modal-close" data-close-complete aria-label="Cerrar">&times;</button></div>
    <div class="modal-body complete-session-body">
      <fieldset class="complete-session-section"><legend>1. ¿Qué se trabajó hoy? <span>*</span></legend><p class="complete-session-help">Selecciona uno o varios temas.</p><div class="complete-session-topic-grid">${TOPICS.map(([value,label])=>`<label><input type="checkbox" name="topicCodes" value="${value}"><span>${label}</span></label>`).join('')}</div></fieldset>
      <fieldset class="complete-session-section complete-session-rating"><legend>2. ¿Cómo fue el desempeño del estudiante? <span>*</span></legend><p class="complete-session-help">Evalúa solamente los temas trabajados hoy.</p><div class="complete-session-rating-grid">${PERFORMANCE_OPTIONS.map(([value,label,help])=>`<label><input type="radio" name="performanceLevel" value="${value}"><span><strong>${label}</strong><small>${help}</small></span></label>`).join('')}</div></fieldset>
      <label class="complete-session-field"><span>3. Observación de la clase <small>(opcional)</small></span><textarea name="observations" class="form-input" rows="3" maxlength="1000" placeholder="Ej.: Buen control al arrancar; debe reforzar el frenado."></textarea></label>
      ${mileageEnabled ? `<label class="complete-session-field"><span>4. Kilometraje final ${requiresMileage ? '<b>*</b>' : '<small>(opcional)</small>'}</span><input name="endMileage" class="form-input" type="text" inputmode="numeric" pattern="[0-9]{3,7}" minlength="3" maxlength="7" title="Ingresa entre 3 y 7 digitos" autocomplete="off" placeholder="Ej.: 45845" ${requiresMileage ? 'required' : ''}></label>` : ''}
    </div><div class="alert alert-error complete-session-error" data-complete-error role="alert" aria-live="assertive" tabindex="-1" hidden></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-complete>Cancelar</button><button type="submit" class="btn btn-success" data-submit-complete disabled>Guardar y finalizar</button></div>
  </form></div>`;
  document.body.appendChild(overlay);
  const form=overlay.querySelector('[data-complete-session-form]');
  const submit=form.querySelector('[data-submit-complete]');
  const errorBox=form.querySelector('[data-complete-error]');
  let saving=false;
  const close=()=>overlay.remove();
  const mileageInput=form.querySelector('[name="endMileage"]');
  const updateSubmit=()=>{submit.disabled=saving||!form.querySelector('[name="topicCodes"]:checked')||!form.querySelector('[name="performanceLevel"]:checked')||((requiresMileage||Boolean(mileageInput?.value))&&!/^\d{3,7}$/.test(mileageInput?.value||''));};
  overlay.querySelectorAll('[data-close-complete]').forEach(button=>button.addEventListener('click',close));
  form.addEventListener('change',updateSubmit);
  mileageInput?.addEventListener('input',()=>{mileageInput.value=mileageInput.value.replace(/\D/g,'').slice(0,7);updateSubmit();});
  overlay.querySelector('[name="topicCodes"]')?.focus();
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(saving)return;
    const values=new FormData(form),topicCodes=values.getAll('topicCodes'),performanceLevel=values.get('performanceLevel'),endMileage=String(values.get('endMileage')||'').trim();
    if(!topicCodes.length||!performanceLevel||((requiresMileage||endMileage!=='')&&!/^\d{3,7}$/.test(endMileage)))return updateSubmit();
    try{
      saving=true;submit.disabled=true;submit.innerHTML='<span class="complete-session-spinner" aria-hidden="true"></span> Guardando...';errorBox.hidden=true;
      const response=await PracticalSessionService.completeSession(sessionId,{attendanceStatus:'Asistio',performanceLevel,observations:String(values.get('observations')||'').trim(),endMileage,topicCodes});
      if(response?.success===false){
        const error=new Error(typeof response.error==='string'?response.error:response.error?.message||'No se pudo finalizar la clase.');
        error.status=response.status;throw error;
      }
      close();onCompleted?.();
    }catch(error){errorBox.textContent=stateMessage(error);errorBox.hidden=false;errorBox.focus();}
    finally{saving=false;submit.textContent='Guardar y finalizar';updateSubmit();}
  });
}
