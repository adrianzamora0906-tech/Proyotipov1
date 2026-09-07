/**
 * Validator
 * Utilidades de validación de formularios
 */

class Validator {
  /**
   * Valida un email
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Valida una cédula de 10 dígitos sin separadores
   */
  static isValidCedula(cedula) {
    const cedulaRegex = /^\d{10}$/;
    return cedulaRegex.test(cedula.toString());
  }

  /**
   * Valida un número de teléfono
   */
  static isValidPhone(phone) {
    const phoneRegex = /^[\d\s\-\(\)\+]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 7;
  }

  /**
   * Valida una URL
   */
  static isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Valida una fecha
   */
  static isValidDate(date) {
    return date instanceof Date && !isNaN(date);
  }

  /**
   * Valida que no esté vacío
   */
  static isNotEmpty(value) {
    return value !== null && value !== undefined && value !== '';
  }

  /**
   * Valida longitud mínima
   */
  static minLength(value, length) {
    return value.toString().length >= length;
  }

  /**
   * Valida longitud máxima
   */
  static maxLength(value, length) {
    return value.toString().length <= length;
  }

  /**
   * Valida que sea un número
   */
  static isNumber(value) {
    return !isNaN(parseFloat(value)) && isFinite(value);
  }

  /**
   * Valida que sea un entero
   */
  static isInteger(value) {
    return Number.isInteger(Number(value));
  }

  /**
   * Valida que sea positivo
   */
  static isPositive(value) {
    return Number(value) > 0;
  }

  /**
   * Valida un rango de números
   */
  static inRange(value, min, max) {
    const num = Number(value);
    return num >= min && num <= max;
  }

  /**
   * Validar una fecha de nacimiento (debe ser mayor de 16 años)
   */
  static isValidBirthDate(dateString) {
    const birthDate = new Date(dateString);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      return age - 1 >= 16;
    }
    return age >= 16;
  }

  /**
   * Valida que dos campos sean iguales
   */
  static fieldsMatch(value1, value2) {
    return value1 === value2;
  }

  /**
   * Valida un patrón personalizado
   */
  static matches(value, pattern) {
    return pattern.test(value);
  }

  /**
   * Valida múltiples reglas
   */
  static validate(value, rules) {
    const errors = [];

    for (const rule of rules) {
      const { type, params, message } = rule;

      let isValid = false;
      switch (type) {
        case 'required':
          isValid = this.isNotEmpty(value);
          break;
        case 'email':
          isValid = this.isValidEmail(value);
          break;
        case 'minLength':
          isValid = this.minLength(value, params);
          break;
        case 'maxLength':
          isValid = this.maxLength(value, params);
          break;
        case 'number':
          isValid = this.isNumber(value);
          break;
        case 'phone':
          isValid = this.isValidPhone(value);
          break;
        case 'cedula':
          isValid = this.isValidCedula(value);
          break;
        case 'birthDate':
          isValid = this.isValidBirthDate(value);
          break;
        default:
          isValid = true;
      }

      if (!isValid) {
        errors.push(message || `Validation failed for rule: ${type}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

export default Validator;
