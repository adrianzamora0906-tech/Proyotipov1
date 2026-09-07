import { apiClient } from '../core/api/ApiClient.js';

class InstructorDashboardService {
  static async getDashboard() {
    return apiClient.get('/instructor/dashboard');
  }
}

export default InstructorDashboardService;
