import { apiClient } from '../core/api/ApiClient.js';

export default class AdminDashboardService {
  static get(filters = {}) {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    return apiClient.get(`/admin/dashboard?${query}`);
  }
}
