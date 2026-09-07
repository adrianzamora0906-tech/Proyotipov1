import { apiClient } from '../core/api/ApiClient.js';

class InstructorAgendaService {
  static async getAgenda(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiClient.get(`/instructor/agenda${qs ? `?${qs}` : ''}`);
  }

}

export default InstructorAgendaService;
