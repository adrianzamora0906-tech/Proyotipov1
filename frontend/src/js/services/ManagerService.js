import { apiClient } from '../core/api/ApiClient.js';

export default class ManagerService {
  static dashboard(filters = {}) {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    return apiClient.get(`/admin/manager/dashboard?${query}`);
  }
  static people(filters = {}) { const query = new URLSearchParams(Object.entries(filters).filter(([,value]) => value)); return apiClient.get(`/admin/manager/people?${query}`); }
  static servicePeople(filters = {}) { const query = new URLSearchParams(Object.entries(filters).filter(([,value]) => value)); return apiClient.get(`/admin/manager/services?${query}`); }
  static financial(filters = {}) { const query = new URLSearchParams(Object.entries(filters).filter(([,value]) => value)); return apiClient.get(`/admin/manager/financial?${query}`); }
  static academic(filters = {}) { const query = new URLSearchParams(Object.entries(filters).filter(([,value]) => value)); return apiClient.get(`/admin/manager/academic?${query}`); }
  static instructorStudents(filters = {}) { const query = new URLSearchParams(Object.entries(filters).filter(([,value]) => value)); return apiClient.get(`/admin/manager/instructor-students?${query}`); }
  static exportInstructorStudents(filters = {}) { return apiClient.download('/admin/manager/instructor-students/export', filters); }
  static exportPeople(filters = {}) { return apiClient.download('/admin/manager/people/export', filters); }
}
