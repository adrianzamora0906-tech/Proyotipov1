const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export default class AtmNominaEditor {
  constructor(host, onChange, lookupIdentity) {
    this.host = host;
    this.onChange = onChange;
    this.lookupIdentity = lookupIdentity;
    this.identityVersion = 0;
    this.rows = [];
    this.added = new Map();
    this.manual = [];
    this.excluded = new Set();
    this.editIndex = null;
    host.innerHTML = `<div class="atm-section-heading"><div><h3>Nómina de alumnos</h3></div></div>
      <div class="atm-nomina-scroll"><table class="atm-nomina-table"><thead><tr><th>Incluir</th><th>Apellidos y nombres</th><th>Identificación</th><th>Origen</th><th>Acciones</th></tr></thead><tbody></tbody></table></div>
      <details class="atm-manual-editor"><summary>Añadir alumno manualmente</summary>
        <div class="atm-form-grid">
          <label>Cédula o pasaporte *<input data-manual-key="identification" maxlength="20" placeholder="Identificación"></label>
          <label>Apellidos y nombres *<input data-manual-key="student_name" maxlength="200" placeholder="Apellidos y nombres completos"></label>
          <label>Fecha de nacimiento<input type="date" data-manual-key="birth_date"></label>
          <label>Tipo de sangre<select data-manual-key="blood_type"><option value="">Sin dato</option>${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(value=>`<option>${value}</option>`).join('')}</select></label>
          <label>Nacionalidad<input data-manual-key="nationality" maxlength="80" value="ECUATORIANO"></label>
          <label>Observaciones<input data-manual-key="observation" maxlength="500" placeholder="Opcional"></label>
        </div>
        <p class="atm-manual-error" role="alert"></p>
        <div class="atm-manual-buttons"><button type="button" class="btn btn-secondary" data-manual-save>Añadir a la nómina</button><button type="button" class="btn" data-manual-clear>Limpiar</button></div>
      </details>`;
    host.querySelector('[data-manual-save]').addEventListener('click',()=>this.save());
    host.querySelector('[data-manual-clear]').addEventListener('click',()=>this.clear());
    host.querySelector('tbody').addEventListener('change', event => {
      const id = event.target.dataset.enrollment;
      if (!id) return;
      if (event.target.checked) this.excluded.delete(id); else this.excluded.add(id);
      this.onChange();
    });
    host.querySelector('tbody').addEventListener('click',event=>{
      const button = event.target.closest('[data-edit],[data-remove]');
      if (!button) return;
      if (button.dataset.edit !== undefined) {
        this.editIndex = Number(button.dataset.edit);
        for (const field of host.querySelectorAll('[data-manual-key]')) field.value = this.manual[this.editIndex][field.dataset.manualKey] || '';
        host.querySelector('details').open = true;
        host.querySelector('[data-manual-save]').textContent = 'Guardar cambios de la fila';
        host.querySelector('[data-manual-key]').focus();
      } else {
        this.manual.splice(Number(button.dataset.remove),1);
        this.clear();
        this.renderRows();
        this.onChange();
      }
    });
    host.querySelector('[data-manual-key="identification"]').addEventListener('blur',()=>this.checkIdentity());
    host.querySelector('[data-manual-key="identification"]').addEventListener('input',()=>{this.identityVersion++;this.checkedIdentification=null;this.identityResult=null;});
    this.renderRows();
  }
  async checkIdentity() {
    const field=this.host.querySelector('[data-manual-key="identification"]');
    const identification=field.value.trim().toUpperCase();
    if(!/^[A-Z0-9-]{5,20}$/.test(identification))return false;
    const version=++this.identityVersion;
    const error=this.host.querySelector('.atm-manual-error');
    error.textContent='Verificando identificación…';
    try {
      if(!this.lookupIdentity)throw Error('No se pudo verificar la identificación.');
      const response=await this.lookupIdentity(identification);
      if(version!==this.identityVersion)return false;
      const result=response.data||response;
      this.identityResult=result;this.checkedIdentification=identification;
      if(result.student)for(const key of ['student_name','birth_date','blood_type','nationality'])this.host.querySelector('[data-manual-key="'+key+'"]').value=result.student[key]||'';
      error.textContent=result.registered?result.message:'Identificación no registrada. Puedes completar los datos para esta nómina.';
      return true;
    }catch(e){if(version===this.identityVersion){this.checkedIdentification=null;error.textContent=e.message==='Selecciona una sucursal antes de verificar la cédula.'?e.message:'No se pudo verificar la identificación. Intenta nuevamente antes de añadir.';}return false;}
  }
  clear() {
    this.editIndex = null;
    this.identityVersion++;this.checkedIdentification=null;this.identityResult=null;
    for (const field of this.host.querySelectorAll('[data-manual-key]')) field.value = '';
    this.host.querySelector('[data-manual-key="nationality"]').value = 'ECUATORIANO';
    this.host.querySelector('[data-manual-save]').textContent = 'Añadir a la nómina';
    this.host.querySelector('.atm-manual-error').textContent = '';
  }
  async save() {
    const identification=this.host.querySelector('[data-manual-key="identification"]').value.trim().toUpperCase();
    if(this.checkedIdentification!==identification && !await this.checkIdentity())return;
    if(this.identityResult?.registered){
      const result=this.identityResult,error=this.host.querySelector('.atm-manual-error');
      if(result.blocked||!result.enrollment){error.textContent=result.message;return;}
      const row=result.enrollment;
      if(this.rows.some(other=>other.identification===row.identification&&!this.excluded.has(other.enrollment_id))||this.manual.some(other=>other.identification===row.identification)){error.textContent='Esta identificación ya está incluida en la nómina.';return;}
      this.added.set(row.enrollment_id,row);
      this.excluded.delete(row.enrollment_id);
      if(!this.rows.some(other=>other.enrollment_id===row.enrollment_id))this.rows.push(row);
      this.clear();this.renderRows();this.onChange();
      error.textContent='Estudiante registrado añadido con su matrícula existente. Quedará excluido de futuras nóminas al confirmar la compra.';
      return;
    }
    const row = Object.fromEntries([...this.host.querySelectorAll('[data-manual-key]')].map(field=>[field.dataset.manualKey,field.value.trim().toUpperCase()]));
    row.nationality ||= 'ECUATORIANO';
    row.identification = row.identification.toUpperCase();
    const error = this.host.querySelector('.atm-manual-error');
    if (row.student_name.length < 3 || !/^[A-Z0-9-]{5,20}$/.test(row.identification)) {
      error.textContent = 'Completa apellidos y nombres y una identificación válida de 5 a 20 caracteres.'; return;
    }
    const duplicate = this.manual.some((other,index)=>index!==this.editIndex && other.identification===row.identification)
      || this.rows.some(other=>!this.excluded.has(other.enrollment_id) && String(other.identification).toUpperCase()===row.identification);
    if (duplicate) {error.textContent='Esta identificación ya está incluida en la nómina.';return;}
    if (row.birth_date && (Number.isNaN(Date.parse(row.birth_date)) || row.birth_date>new Date().toISOString().slice(0,10))) {error.textContent='Revisa la fecha de nacimiento.';return;}
    if (this.editIndex === null) {
      if (this.manual.length >= 200) {error.textContent='Se permiten hasta 200 filas manuales.';return;}
      this.manual.push(row);
    } else this.manual[this.editIndex] = row;
    this.clear();
    this.renderRows();
    this.onChange();
  }
  setRows(rows) { this.rows=[...rows,...[...this.added.values()].filter(row=>!rows.some(other=>other.enrollment_id===row.enrollment_id))]; this.renderRows(); }
  reset() {this.added.clear();this.rows=[];this.manual=[];this.excluded.clear();this.clear();this.renderRows();}
  get registeredCount() {return this.rows.filter(row=>!this.excluded.has(row.enrollment_id)).length;}
  get count() {return this.registeredCount+this.manual.length;}
  payload() {return {manualStudents:this.manual,excludedEnrollmentIds:[...this.excluded],includedEnrollmentIds:[...this.added.keys()].filter(id=>!this.excluded.has(id))};}
  renderRows() {
    this.host.querySelector('tbody').innerHTML = this.rows.map(row=>({name:row.last_name_first||row.student_name,html:`<tr><td><input type="checkbox" aria-label="Incluir a ${esc(row.last_name_first||row.student_name)}" data-enrollment="${esc(row.enrollment_id)}" ${this.excluded.has(row.enrollment_id)?'':'checked'}></td><td>${esc(row.last_name_first||row.student_name)}</td><td>${esc(row.identification)}</td><td>Sistema</td><td>—</td></tr>`}))
      .concat(this.manual.map((row,index)=>({name:row.student_name,html:`<tr class="atm-manual-row"><td>✓</td><td>${esc(row.last_name_first||row.student_name)}</td><td>${esc(row.identification)}</td><td>Manual · solo nómina</td><td><button type="button" class="btn btn-small" data-edit="${index}">Editar</button><button type="button" class="btn btn-small" data-remove="${index}">Quitar</button></td></tr>`})))
      .sort((a,b)=>a.name.trim().localeCompare(b.name.trim(),'es',{sensitivity:'base'}))
      .map(row=>row.html).join('')
      || '<tr><td colspan="5">Sin alumnos en la nómina. Selecciona un curso y sus fechas o añade una fila manual.</td></tr>';
  }
}
