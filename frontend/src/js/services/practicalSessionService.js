import { apiClient } from '../core/api/ApiClient.js';

class PracticalSessionService {
  static async getSession(sessionId) {
    return apiClient.get(`/instructor/sessions/${sessionId}`);
  }

  static async startSession(sessionId) {
    return apiClient.post(`/instructor/sessions/${sessionId}/start`);
  }

  static async createAttendanceQr(sessionId, phase = 'ENTRY') {
    return apiClient.post(`/instructor/sessions/${sessionId}/attendance-qr`, { phase });
  }

  static async getAttendanceQrStatus(sessionId, phase = 'ENTRY') {
    return apiClient.get(`/instructor/sessions/${sessionId}/attendance-qr/status?phase=${encodeURIComponent(phase)}`);
  }

  static async resetQrTestSession(sessionId) {
    return apiClient.post(`/instructor/sessions/${sessionId}/reset-qr-test`);
  }

  static async completeSession(sessionId, data) {
    return apiClient.post(`/instructor/sessions/${sessionId}/complete`, data);
  }
}

export default PracticalSessionService;
