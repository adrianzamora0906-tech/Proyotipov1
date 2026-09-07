/**
 * StringHelper
 * Utilidades para manejo de strings
 */

class StringHelper {
  /**
   * Capitaliza la primera letra
   */
  static capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Convierte a mayúsculas
   */
  static toUpperCase(str) {
    return str?.toUpperCase() || '';
  }

  /**
   * Convierte a minúsculas
   */
  static toLowerCase(str) {
    return str?.toLowerCase() || '';
  }

  /**
   * Trunca un string
   */
  static truncate(str, length = 50, suffix = '...') {
    if (str.length > length) {
      return str.substring(0, length) + suffix;
    }
    return str;
  }

  /**
   * Elimina espacios en blanco
   */
  static trim(str) {
    return str?.trim() || '';
  }

  /**
   * Verifica si está vacío
   */
  static isEmpty(str) {
    return !str || str.trim().length === 0;
  }

  /**
   * Reemplaza variables en un string
   */
  static replace(template, variables) {
    return template.replace(/{(\w+)}/g, (match, key) => variables[key] || match);
  }

  /**
   * Normaliza una cédula eliminando cualquier carácter no numérico
   */
  static normalizeCedula(cedula) {
    if (cedula === null || cedula === undefined) return '';
    return cedula.toString().replace(/\D/g, '');
  }

  /**
   * Convierte a slug
   */
  static toSlug(str) {
    return str
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Genera un nombre aleatorio
   */
  static generateRandomString(length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }

  /**
   * Capitaliza cada palabra
   */
  static titleCase(str) {
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Obtiene iniciales
   */
  static getInitials(fullName) {
    return fullName
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  /**
   * Verifica si contiene substring
   */
  static includes(str, substring) {
    return str?.toLowerCase().includes(substring.toLowerCase()) || false;
  }
}

export default StringHelper;
