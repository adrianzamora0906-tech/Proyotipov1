const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export default class AtmNominaEditor {
  constructor(host, onChange) {
    this.host = host;
    this.onChange = onChange;
    this.rows = [];
    this.manual = [];
    this.excluded = new Set();
    this.editIndex = null;
    host.innerHTML = `<div class="atm-section-heading"><div><h3>Nómina de alumnos</h3><p>Revisa los alumnos del sistema y añade filas manuales solo para esta nómina.</p></div></div>
      <div class="atm-nomina-scroll"><table class="atm-nomina-table"><thead><tr><th>Incluir</th><th>Apellidos y nombres</th><th>Identificación</th><th>Origen</th><th>Acciones</th></tr></thead><tbody></tbody></table></div>
      <details class="atm-manual-editor"><summary>Añadir alumno manualmente</summary>
        <p>No crea estudiantes ni matrículas en el ERP. Los campos con * son obligatorios.</p>
        <div class="atm-form-grid">
          <label>Apellidos y nombres *<input data-manual-key="student_name" maxlength="200" placeholder="Apellidos y nombres completos"></label>
          <label>Cédula o pasaporte *<input data-manual-key="identification" maxlength="20" placeholder="Identificación"></label>
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
    this.renderRows();
  }
  clear() {
    this.editIndex = null;
    for (const field of this.host.querySelectorAll('[data-manual-key]')) field.value = '';
    this.host.querySelector('[data-manual-key="nationality"]').value = 'ECUATORIANO';
    this.host.querySelector('[data-manual-save]').textContent = 'Añadir a la nómina';
    this.host.querySelector('.atm-manual-error').textContent = '';
  }
  save() {
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
  setRows(rows) { this.rows=rows; this.renderRows(); }
  reset() {this.rows=[];this.manual=[];this.excluded.clear();this.clear();this.renderRows();}
  get registeredCount() {return this.rows.filter(row=>!this.excluded.has(row.enrollment_id)).length;}
  get count() {return this.registeredCount+this.manual.length;}
  payload() {return {manualStudents:this.manual,excludedEnrollmentIds:[...this.excluded]};}
  renderRows() {
    this.host.querySelector('tbody').innerHTML = this.rows.map(row=>`<tr><td><input type="checkbox" aria-label="Incluir a ${esc(row.student_name)}" data-enrollment="${esc(row.enrollment_id)}" ${this.excluded.has(row.enrollment_id)?'':'checked'}></td><td>${esc(row.student_name)}</td><td>${esc(row.identification)}</td><td>Sistema</td><td>—</td></tr>`).join('')
      + this.manual.map((row,index)=>`<tr class="atm-manual-row"><td>✓</td><td>${esc(row.student_name)}</td><td>${esc(row.identification)}</td><td>Manual · solo nómina</td><td><button type="button" class="btn btn-small" data-edit="${index}">Editar</button><button type="button" class="btn btn-small" data-remove="${index}">Quitar</button></td></tr>`).join('')
      || '<tr><td colspan="5">Sin alumnos en la nómina. Selecciona un curso y sus fechas o añade una fila manual.</td></tr>';
  }
}
