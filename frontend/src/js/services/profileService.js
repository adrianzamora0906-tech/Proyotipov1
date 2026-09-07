import { apiClient } from '../core/api/ApiClient.js';

class ProfileService {
  static async getProfile() {
    return apiClient.get('/me/profile');
  }

  static async updateProfile(data) {
    return apiClient.put('/me/profile', data);
  }

  static async updatePassword(data) {
    return apiClient.put('/me/password', data);
  }

  static async getInstructorProfile() {
    return apiClient.get('/instructor/profile');
  }
}

export default ProfileService;
