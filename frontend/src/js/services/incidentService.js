import { apiClient } from '../core/api/ApiClient.js';

class IncidentService {
  static async getIncidents() {
    return apiClient.get('/instructor/incidents');
  }

  static async createIncident(data) {
    return apiClient.post('/instructor/incidents', data);
  }
}

export default IncidentService;
