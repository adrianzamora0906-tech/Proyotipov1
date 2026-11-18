function compactDocumentResponse(document) {
  if (Array.isArray(document)) return document.map(compactDocumentResponse);
  if (!document || typeof document !== 'object') return document;
  return Object.fromEntries(Object.entries(document)
    .filter(([key]) => key !== 'file_url' && key !== 'file_path' && key !== 'fileUrl')
    .map(([key, value]) => [key, compactDocumentResponse(value)]));
}
module.exports = compactDocumentResponse;
