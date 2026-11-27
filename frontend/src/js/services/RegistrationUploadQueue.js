import ApiService from '../core/api/apiService.js';
import { authService } from '../core/auth/AuthService.js';
import { storageService } from '../core/storage/StorageService.js';
import { createDocumentImageSheet } from './DocumentImageSheet.js';

// Files remain in IndexedDB, never in notifications or localStorage.
const database = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('sportmancarRegistrationDocuments', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('jobs', { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new Error('No se pudo conservar la carga. Revisa el espacio del navegador.'));
});
export const uploadJobStore = {
  async operation(mode, action) {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('jobs', mode);
        const request = action(tx.objectStore('jobs'));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = tx.onabort = () => reject(new Error('No se pudo guardar la carga pendiente.'));
      });
    } finally { db.close(); }
  },
  list() { return this.operation('readonly', store => store.getAll()); },
  put(job) { return this.operation('readwrite', store => store.put(job)); },
  remove(id) { return this.operation('readwrite', store => store.delete(id)); },
};

const asDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('No se pudo leer el documento.'));
  reader.readAsDataURL(file);
});
async function imageForPdf(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Una de las fotos no es valida.'));
      img.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const binary = atob(canvas.toDataURL('image/jpeg', 0.88).split(',')[1]);
    return { width: canvas.width, height: canvas.height, bytes: Uint8Array.from(binary, char => char.charCodeAt(0)) };
  } finally { URL.revokeObjectURL(url); }
}
async function uploadDocument(studentId, task, userId) {
  const payload = { type: task.type, name: task.name };
  if (task.cedulaIndicatesBachiller) payload.cedulaIndicatesBachiller = true;
  else {
    let source = task.source;
    if (task.images) source = createDocumentImageSheet(await Promise.all(task.images.map(imageForPdf)), { vertical: true });
    payload.fileUrl = typeof source === 'string' ? source : await asDataUrl(source);
    if (payload.fileUrl.length > 12 * 1024 * 1024) throw new Error('El documento supera el maximo de 9 MB.');
    if (task.type === 'registro_documentos') payload.includesBloodCard = task.includesBloodCard;
  }
  if (authService.getCurrentUser()?.userId !== userId) throw new Error('La sesion cambio. Reintenta con el usuario que registro al estudiante.');
  const response = await ApiService.createDocument(studentId, payload, { compact: true });
  if (!response.success) throw new Error(response.error?.message || response.error || 'No se pudo subir el documento.');
}

export class RegistrationUploadQueue {
  constructor({ store = uploadJobStore, upload = uploadDocument, user = () => authService.getCurrentUser()?.userId,
    notify = publishStatus, onError = showUploadError } = {}) {
    Object.assign(this, { store, upload, user, notify, onError });
    this.running = new Set();
  }
  async enqueue({ studentId, studentName, tasks, userId = this.user() }) {
    if (!userId || userId !== this.user()) throw new Error('La sesion cambio. Vuelve al expediente con el usuario que registro al estudiante.');
    const job = { id: crypto.randomUUID(), userId, studentId, studentName, tasks,
      done: [], status: 'pending', createdAt: new Date().toISOString() };
    await this.store.put(job); // Confirm durable local storage before dismissing the form.
    this.notify(job);
    return job.id;
  }
  async resume() {
    try {
      for (const job of await this.store.list()) {
        if (job.userId === this.user() && job.status !== 'error') void this.run(job.id);
      }
    } catch (_) { /* enqueue reports persistence failures directly to the registration form. */ }
  }
  async retry(id) {
    const job = (await this.store.list()).find(item => item.id === id && item.userId === this.user());
    if (!job || this.running.has(id)) return;
    job.status = 'pending'; job.error = null;
    await this.store.put(job); this.notify(job);
    void this.run(id);
  }
  async run(id) {
    if (this.running.has(id)) return;
    this.running.add(id);
    try {
      const operation = async () => {
        const job = (await this.store.list()).find(item => item.id === id && item.userId === this.user());
        if (!job || job.status === 'error') return;
        try {
          for (let index = 0; index < job.tasks.length; index++) {
            if (job.done.includes(index)) continue;
            if (this.user() !== job.userId) return;
            job.currentDocument = job.tasks[index].name;
            await this.upload(job.studentId, job.tasks[index], job.userId);
            job.done.push(index);
            await this.store.put(job);
            this.notify(job);
          }
          await this.store.remove(id); // Remove personal files after server confirmation.
          this.notify({ ...job, status: 'complete' });
        } catch (error) {
          job.status = 'error'; job.error = String(error.message || 'Error de carga');
          await this.store.put(job);
          this.notify(job);
          if (this.user() === job.userId) this.onError(job);
        }
      };
      // Coordinate two tabs so a document is not uploaded simultaneously.
      if (globalThis.navigator?.locks) await navigator.locks.request('registration-upload:' + id, { ifAvailable: true }, lock => lock && operation());
      else await operation();
    } catch (_) { /* Saved jobs remain recoverable after an interrupted browser transaction. */ }
    finally { this.running.delete(id); }
  }
  start() {
    if (!this.started) {
      this.started = true;
      window.addEventListener('online', () => this.resume());
      window.addEventListener('erp:sessionChanged', () => this.resume());
    }
    void this.resume();
  }
}

function publishStatus(job) {
  const previous = storageService.findBy('notifications', { userId: job.userId, uploadJobId: job.id })[0];
  const failed = job.status === 'error', complete = job.status === 'complete';
  const values = {
    userId: job.userId, studentId: job.studentId, uploadJobId: job.id, uploadStatus: job.status,
    title: failed ? 'Error al subir documentos' : complete ? 'Documentos guardados' : 'Guardando documentos',
    message: `${job.studentName}: ${failed ? job.currentDocument + '. ' + job.error : complete ? 'Todos los documentos quedaron guardados.' : `${job.done.length} de ${job.tasks.length} documentos guardados. Puedes continuar trabajando.`}`,
    type: failed ? 'error' : complete ? 'success' : 'info', read: false,
  };
  if (previous) storageService.update('notifications', previous.id, values);
  else storageService.insert('notifications', values);
}

const pendingErrors = new Map();
function showUploadError(job) {
  pendingErrors.set(job.id, job);
  presentNextError();
}
function presentNextError() {
  if (document.getElementById('registration-upload-error')) return;
  const job = [...pendingErrors.values()].find(item => item.userId === authService.getCurrentUser()?.userId);
  if (!job) return;
  pendingErrors.delete(job.id);
  const dialog = document.createElement('dialog');
  dialog.id = 'registration-upload-error';
  dialog.className = 'card';
  dialog.style.cssText = 'max-width:480px;width:90%;padding:24px;border:0;border-radius:12px;';
  const title = document.createElement('h2'); title.textContent = 'No se pudo subir un documento';
  const text = document.createElement('p');
  text.textContent = `${job.studentName}: ${job.currentDocument}. ${job.error}. La inscripcion se conserva. Puedes reintentar desde tus notificaciones.`;
  const retry = document.createElement('button'); retry.className = 'btn btn-primary'; retry.textContent = 'Reintentar carga';
  retry.onclick = () => { dialog.close(); void registrationUploadQueue.retry(job.id).catch(() => showUploadError(job)); };
  const close = document.createElement('button'); close.className = 'btn btn-secondary'; close.textContent = 'Continuar trabajando';
  close.onclick = () => dialog.close();
  dialog.append(title, text, retry, close); document.body.append(dialog);
  const clear = () => { dialog.remove(); presentNextError(); };
  dialog.addEventListener('close', clear, { once: true });
  const sessionChanged = () => { if (authService.getCurrentUser()?.userId !== job.userId) dialog.close(); };
  window.addEventListener('erp:sessionChanged', sessionChanged);
  dialog.addEventListener('close', () => window.removeEventListener('erp:sessionChanged', sessionChanged), { once: true });
  dialog.showModal();
}
export const registrationUploadQueue = new RegistrationUploadQueue();
