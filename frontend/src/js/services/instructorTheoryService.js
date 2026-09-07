import { apiClient } from '../core/api/ApiClient.js';

export default class InstructorTheoryService {
  static dashboard(){return apiClient.get('/instructor/theory-dashboard');}
  static groups(){return apiClient.get('/instructor/theory-groups');}
  static roster(groupId){return apiClient.get(`/instructor/theory-groups/${groupId}`);}
  static save(groupId,data){return apiClient.put(`/instructor/theory-groups/${groupId}/attendance`,data);}
}
