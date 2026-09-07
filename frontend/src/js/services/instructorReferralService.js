import { apiClient } from '../core/api/ApiClient.js';

export default class InstructorReferralService {
  static getAll() { return apiClient.get('/instructor/referrals'); }
  static reserve(data) { return apiClient.post('/instructor/referrals/reservations', data); }
  static cancel(id) { return apiClient.delete(`/instructor/referrals/reservations/${id}`); }
}
