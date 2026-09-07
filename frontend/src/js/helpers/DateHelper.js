/**
 * DateHelper
 * Utilidades para manejo de fechas
 */

class DateHelper {
  /**
   * Formatea una fecha a string
   */
  static format(date, format = 'DD/MM/YYYY') {
    if (!date) return 'N/A';

    if (typeof date === 'string') {
      date = new Date(date);
    }

    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'N/A';

    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    const formats = {
      'DD/MM/YYYY': `${day}/${month}/${year}`,
      'YYYY-MM-DD': `${year}-${month}-${day}`,
      'DD/MM/YYYY HH:MM': `${day}/${month}/${year} ${hours}:${minutes}`,
      'DD/MM/YYYY HH:MM:SS': `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`,
      'HH:MM': `${hours}:${minutes}`,
      'HH:MM:SS': `${hours}:${minutes}:${seconds}`,
    };

    return formats[format] || date.toString();
  }

  /**
   * Obtiene el día actual
   */
  static today() {
    return new Date();
  }

  /**
   * Suma días a una fecha
   */
  static addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Calcula diferencia en días
   */
  static daysBetween(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((date1 - date2) / oneDay));
  }

  /**
   * Calcula la edad
   */
  static calculateAge(birthDate) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  /**
   * Verifica si una fecha es hoy
   */
  static isToday(date) {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }

  /**
   * Obtiene el nombre del mes
   */
  static getMonthName(monthIndex) {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return months[monthIndex] || '';
  }

  /**
   * Obtiene el nombre del día
   */
  static getDayName(dayIndex) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[dayIndex] || '';
  }

  /**
   * Formatea tiempo relativo (hace X minutos)
   */
  static formatRelative(date) {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Hace unos segundos';
    if (diffMins < 60) return `Hace ${diffMins} minuto${diffMins > 1 ? 's' : ''}`;
    if (diffHours < 24) return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    if (diffDays < 7) return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;

    return this.format(date, 'DD/MM/YYYY');
  }
}

export default DateHelper;
