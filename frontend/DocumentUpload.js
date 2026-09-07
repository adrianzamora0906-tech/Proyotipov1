import DocumentService from '../services/DocumentService.js';
import Toast from './Toast.js';

/**
 * Componente para la subida de documentos.
 * Crea un campo de entrada de archivo y un botón para un tipo de documento específico.
 */
class DocumentUpload {
  /**
   * Renderiza el componente de subida de archivo.
   * @param {string} studentId - El ID del estudiante.
   * @param {string} docType - El tipo de documento (ej: 'cedula').
   * @param {string} docName - El nombre para mostrar (ej: 'Cédula de Identidad').
   * @param {Array} existingDocuments - La lista de documentos que ya tiene el estudiante.
   * @returns {string} - El HTML del componente.
   */
  static render(studentId, docType, docName, existingDocuments) {
    // Verifica si un documento de este tipo ya fue subido (independientemente de su estado)
    const isAlreadyUploaded = existingDocuments.some(doc => doc.type === docType);

    if (isAlreadyUploaded) {
      // Si ya está subido, muestra un estado en lugar del campo de subida
      const doc = existingDocuments.find(d => d.type === docType);
      const statusClasses = {
        aprobado: 'badge-success',
        pendiente: 'badge-warning',
        rechazado: 'badge-danger',
      };
      const statusClass = statusClasses[doc.status] || 'badge-secondary';

      return `
        <div class="document-upload-item document-uploaded">
          <label>${docName}</label>
          <div class="document-status">
            <span>Subido</span>
            <span class="badge ${statusClass}">${doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}</span>
          </div>
        </div>
      `;
    }

    // Si no está subido, muestra el formulario de subida
    return `
      <div class="document-upload-item" data-doc-type="${docType}">
        <label for="file-${docType}">${docName} (PDF)</label>
        <div class="input-group">
          <input type="file" id="file-${docType}" class="file-input" accept=".pdf" name="file-${docType}">
          <button class="button button-primary upload-btn" data-student-id="${studentId}" data-doc-type="${docType}" data-doc-name="${docName}" disabled>Subir</button>
        </div>
        <small class="file-name-display"></small>
      </div>
    `;
  }

  /**
   * Adjunta los event listeners para los componentes de subida en un contenedor.
   * @param {HTMLElement} container - El elemento que contiene los componentes de subida.
   * @param {Function} onUploadSuccess - Callback que se ejecuta tras una subida exitosa.
   */
  static attachEventListeners(container, onUploadSuccess) {
    container.querySelectorAll('.document-upload-item').forEach(item => {
      const fileInput = item.querySelector('.file-input');
      const uploadBtn = item.querySelector('.upload-btn');
      const fileNameDisplay = item.querySelector('.file-name-display');

      if (fileInput && uploadBtn) {
        // Habilitar/deshabilitar botón de subida
        fileInput.addEventListener('change', () => {
          if (fileInput.files.length > 0) {
            uploadBtn.disabled = false;
            fileNameDisplay.textContent = `Archivo: ${fileInput.files[0].name}`;
          } else {
            uploadBtn.disabled = true;
            fileNameDisplay.textContent = '';
          }
        });

        // Lógica de subida (simulada)
        uploadBtn.addEventListener('click', async (e) => {
          const studentId = e.target.dataset.studentId;
          const docType = e.target.dataset.docType;
          const docName = e.target.dataset.docName;
          const file = fileInput.files[0];

          if (!file) return;

          // Simulación de subida
          const result = await DocumentService.uploadDocument(studentId, docType, docName, file.name);

          if (result.success) {
            Toast.show('Documento subido exitosamente.', 'success');
            onUploadSuccess(); // Llama al callback para refrescar la vista
          } else {
            Toast.show(`Error: ${result.error}`, 'danger');
          }
        });
      }
    });
  }
}

export default DocumentUpload;