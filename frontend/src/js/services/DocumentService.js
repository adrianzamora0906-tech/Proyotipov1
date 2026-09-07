/**
 * Document Service
 * Servicio de gestión de documentos
 */

import { storageService } from '../core/storage/StorageService.js';

class DocumentService {
  static requiredDocumentTypes = ['cedula', 'certificado_bachiller', 'carnet_tipo_sangre'];

  /**
   * Crea un documento simulado
   */
  static createDocument(studentId, documentType, file = null, uploadedBy = null) {
    const document = storageService.insert('documents', {
      studentId,
      type: documentType,
      name: this.getDocumentName(documentType),
      uploadedAt: file ? new Date().toISOString() : '',
      expiresAt: this.calculateExpiration(documentType),
      observations: '',
      file: file ? this.buildFileMetadata(file, uploadedBy) : null,
    });

    return document;
  }

  static ensureRequiredDocuments(studentId) {
    const documents = this.getStudentDocuments(studentId);
    this.requiredDocumentTypes.forEach(type => {
      const exists = documents.some(doc => doc.type === type);
      if (!exists) this.createDocument(studentId, type);
    });
    return this.getStudentDocuments(studentId);
  }

  static uploadDocumentFile(documentId, file, uploadedBy = null) {
    if (!file) return null;
    return storageService.update('documents', documentId, {
      uploadedAt: new Date().toISOString(),
      file: this.buildFileMetadata(file, uploadedBy),
      observations: '',
    });
  }

  static uploadStudentDocument(studentId, documentType, file, uploadedBy = null) {
    if (!file) return null;
    const documents = this.ensureRequiredDocuments(studentId);
    const document = documents.find(doc => doc.type === documentType);
    if (document) return this.uploadDocumentFile(document.id, file, uploadedBy);
    return this.createDocument(studentId, documentType, file, uploadedBy);
  }

  static buildFileMetadata(file, uploadedBy = null) {
    return {
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : '',
      uploadedBy: uploadedBy ? {
        name: uploadedBy.name || uploadedBy.username || 'Usuario',
        role: uploadedBy.role || '',
      } : null,
    };
  }

  /**
   * Obtiene documentos de un estudiante
   */
  static getStudentDocuments(studentId) {
    return storageService.findBy('documents', { studentId });
  }

  /**
   * Actualiza estado de documento
   */
  

  /**
   * Verifica si todos los documentos están aprobados
   */
  

  /**
   * Obtiene nombre del documento
   */
  static getDocumentName(type) {
    const names = {
      cedula: 'Cédula de Identidad',
      carnet_tipo_sangre: 'Carnet de Tipo de Sangre',
      certificado_bachiller: 'Certificado de estudio',
      licencia: 'Licencia de Conducir',
      comprobante_domicilio: 'Comprobante de Domicilio',
      certificado_antecedentes: 'Certificado de Antecedentes Penales',
      foto: 'Fotografía',
    };
    return names[type] || type;
  }

  /**
   * Calcula fecha de expiración
   */
  static calculateExpiration(type) {
    const date = new Date();
    if (type === 'licencia') {
      date.setFullYear(date.getFullYear() + 5);
    } else {
      date.setFullYear(date.getFullYear() + 1);
    }
    return date.toISOString();
  }

  /**
   * Obtiene documentos pendientes
   */
  static getMissingDocuments() {
    const documents = storageService.findAll('documents');
    return documents.filter(document => !document.file);
  }

  /**
   * Obtiene documentos vencidos
   */
  static getExpiredDocuments() {
    const documents = storageService.findAll('documents');
    const now = new Date();
    return documents.filter(doc => new Date(doc.expiresAt) < now);
  }
}

export default DocumentService;
