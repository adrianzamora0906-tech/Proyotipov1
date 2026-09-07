import { apiClient } from '../core/api/ApiClient.js';

class InstructorStudentService {
  static async getStudents(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiClient.get(`/instructor/students${qs ? `?${qs}` : ''}`);
  }

  static async getStudent(enrollmentId) {
    return apiClient.get(`/instructor/students/${enrollmentId}`);
  }
}

export default InstructorStudentService;
