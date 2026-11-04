import DOMPurify from '../lib/dompurify.es.mjs';

export function sanitizeHtml(html) {
  if (!DOMPurify.isSupported) throw new Error('Este navegador no permite mostrar el contenido de forma segura. Actualizalo.');
  return DOMPurify.sanitize(String(html ?? ''), {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'meta'],
    FORBID_ATTR: ['srcdoc'],
  });
}
