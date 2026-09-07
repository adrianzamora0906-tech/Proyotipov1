/**
 * Storage Service
 * Capa de abstracción para LocalStorage simulando una base de datos
 */

class StorageService {
  constructor() {
    this.prefix = 'erp_';
    this.version = '1.0.0';
    this.initializeDatabase();
  }

  /**
   * Inicializa la base de datos con colecciones por defecto
   */
  initializeDatabase() {
    const collections = [
      'users',
      'students',
      'payments',
      'documents',
      'notifications',
      'schedules',
      'settings',
      'history',
      'courses',
      'enrollments',
      // Cash module collections
      'paymentHistory',
      'receipts',
      'cashRegister',
      'cashNotifications',
    ];

    collections.forEach(collection => {
      if (!this.exists(collection)) {
        this.createCollection(collection);
      }
    });
  }

  /**
   * Crea una nueva colección
   */
  createCollection(name) {
    const key = this.prefix + name;
    localStorage.setItem(key, JSON.stringify([]));
  }

  /**
   * Verifica si una colección existe
   */
  exists(name) {
    const key = this.prefix + name;
    return localStorage.getItem(key) !== null;
  }

  /**
   * Obtiene todos los documentos de una colección
   */
  findAll(collection) {
    try {
      const key = this.prefix + collection;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error(`Error reading collection ${collection}:`, error);
      return [];
    }
  }

  /**
   * Encuentra un documento por ID
   */
  findById(collection, id) {
    const items = this.findAll(collection);
    return items.find(item => item.id === id);
  }

  /**
   * Encuentra documentos que coincidan con un criterio
   */
  findBy(collection, criteria) {
    const items = this.findAll(collection);
    return items.filter(item => {
      return Object.keys(criteria).every(key => item[key] === criteria[key]);
    });
  }

  /**
   * Inserta un nuevo documento
   */
  insert(collection, document) {
    try {
      const items = this.findAll(collection);
      const newDocument = {
        id: this.generateId(),
        ...document,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      items.push(newDocument);
      this.save(collection, items);
      this.dispatchDataChange(collection, 'insert', newDocument);
      return newDocument;
    } catch (error) {
      console.error(`Error inserting document in ${collection}:`, error);
      return null;
    }
  }

  /**
   * Actualiza un documento
   */
  update(collection, id, updates) {
    try {
      const items = this.findAll(collection);
      const index = items.findIndex(item => item.id === id);
      if (index === -1) return null;

      items[index] = {
        ...items[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      this.save(collection, items);
      this.dispatchDataChange(collection, 'update', items[index]);
      return items[index];
    } catch (error) {
      console.error(`Error updating document in ${collection}:`, error);
      return null;
    }
  }

  /**
   * Elimina un documento
   */
  delete(collection, id) {
    try {
      const items = this.findAll(collection);
      const filtered = items.filter(item => item.id !== id);
      this.save(collection, filtered);
      this.dispatchDataChange(collection, 'delete', { id });
      return true;
    } catch (error) {
      console.error(`Error deleting document in ${collection}:`, error);
      return false;
    }
  }

  /**
   * Dispara un evento de cambio de datos local para sincronización
   */
  dispatchDataChange(collection, action, document) {
    try {
      const event = new CustomEvent('erp:dataChanged', {
        detail: { collection, action, document },
      });
      window.dispatchEvent(event);
    } catch (error) {
      console.warn('No se pudo despachar evento de cambio de datos:', error);
    }
  }

  /**
   * Guarda datos en una colección
   */
  save(collection, data) {
    const key = this.prefix + collection;
    localStorage.setItem(key, JSON.stringify(data));
  }

  /**
   * Genera un ID único
   */
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Limpia toda la base de datos
   */
  clear() {
    Object.keys(localStorage)
      .filter(key => key.startsWith(this.prefix))
      .forEach(key => localStorage.removeItem(key));
    this.initializeDatabase();
  }

  /**
   * Exporta toda la base de datos
   */
  export() {
    const data = {};
    Object.keys(localStorage)
      .filter(key => key.startsWith(this.prefix))
      .forEach(key => {
        const collectionName = key.replace(this.prefix, '');
        data[collectionName] = JSON.parse(localStorage.getItem(key));
      });
    return data;
  }

  /**
   * Importa datos a la base de datos
   */
  import(data) {
    Object.keys(data).forEach(collection => {
      const key = this.prefix + collection;
      localStorage.setItem(key, JSON.stringify(data[collection]));
    });
  }

  /**
   * Cuenta documentos en una colección
   */
  count(collection) {
    return this.findAll(collection).length;
  }
}

// Exportar instancia singleton
export const storageService = new StorageService();
export default StorageService;
