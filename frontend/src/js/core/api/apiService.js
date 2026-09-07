/**
 * apiService - Adaptador frontend para la API REST
 * Proporciona métodos específicos del negocio usando ApiClient
 */

import { apiClient } from './ApiClient.js';

class ApiService {
  // ── AUTH ──
  static async login(username, password) {
    return apiClient.login(username, password);
  }

  static async getMe() {
    return apiClient.get('/auth/me');
  }

  static async updateProfile(data) {
    return apiClient.put('/auth/profile', data);
  }

  // ── STUDENTS ──
  static async getStudents(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiClient.get(`/students${qs ? '?' + qs : ''}`);
  }

  static async getStudentReservations(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiClient.get(`/students/reservations${qs ? '?' + qs : ''}`);
  }

  static async getStudent(id) {
    return apiClient.get(`/students/${id}`);
  }

  static async resetStudentAccess(id) {
    return apiClient.post(`/students/${id}/reset-access`, {});
  }

  static async searchStudents(query, params = {}) {
    const qs = new URLSearchParams({ query, ...params }).toString();
    return apiClient.get(`/students/search?${qs}`);
  }

  static async createStudent(data) {
    return apiClient.post('/students', data);
  }

  static async resolveAdditionalPracticeStudent(identification) {
    return apiClient.get(`/students/additional-practices/resolve?identification=${encodeURIComponent(identification)}`);
  }

  static async createAdditionalPractice(studentId, data) {
    return apiClient.post(`/students/${studentId}/additional-practices`, data);
  }
  static async createLicenseRenewal(data) { return apiClient.post('/students/license-renewals', data); }

  static async checkAdditionalPracticeAvailability(params) {
    return apiClient.get(`/students/additional-practices/availability?${new URLSearchParams(params)}`);
  }

  static async updateStudent(id, data) {
    return apiClient.put(`/students/${id}`, data);
  }

  static async updateStudentStatus(id, status) {
    return apiClient.put(`/students/${id}/status`, { status });
  }

  static async getStudentHistory(id) {
    return apiClient.get(`/students/${id}/history`);
  }

  static async getBranches() {
    return apiClient.get('/students/branches/all');
  }

  // ── DOCUMENTS ──
  static async getStudentDocuments(studentId) {
    return apiClient.get(`/students/${studentId}/documents`);
  }

  static async createDocument(studentId, data) {
    return apiClient.post(`/students/${studentId}/documents`, data);
  }

  static async getStudentInstructors(branchId = null) {
    const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
    return apiClient.get(`/students/instructors/branch${query}`);
  }

  static async searchReferralStaff(query) {
    return apiClient.get(`/students/referral-staff?query=${encodeURIComponent(query)}`);
  }

  static async appendBloodCardToRegistrationPdf(studentId, data) {
    return apiClient.post(`/students/${studentId}/documents/append-blood-card`, data);
  }

  static async deleteDocument(id) {
    return apiClient.delete(`/documents/${id}`);
  }

  static async createMobileDocumentUploadToken(data) {
    return apiClient.post('/documents/mobile-upload-token', data);
  }

  static async getMobileDocumentUploadToken(token) {
    return apiClient.get(`/documents/mobile-upload/${encodeURIComponent(token)}`);
  }

  static async completeMobileDocumentUpload(token, data) {
    return apiClient.post(`/documents/mobile-upload/${encodeURIComponent(token)}`, data);
  }

  static async getMobileDocumentUploadResult(token) {
    return apiClient.get(`/documents/mobile-upload-token/${encodeURIComponent(token)}/result`);
  }

  // ── PAYMENTS ──
  static async getPendingPayments() {
    return apiClient.get('/payments/pending');
  }

  static async getStudentBalance(studentId) {
    return apiClient.get(`/students/${studentId}/balance`);
  }

  static async getStudentPayments(studentId) {
    return apiClient.get(`/students/${studentId}/payments`);
  }

  static async getCities() {
    return apiClient.get('/students/locations/cities');
  }

  static async getBranches() {
    return apiClient.get('/students/branches/all');
  }

  static async getBranchCourses(branchId) {
    return apiClient.get(`/students/branches/${branchId}/courses`);
  }

  static async registerPayment(data) {
    return apiClient.post('/payments/register', data);
  }

  static async getPaymentMethods(branchId = '') {
    return apiClient.get(`/payments/methods${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`);
  }

  static async getPaymentStatistics() {
    return apiClient.get('/payments/statistics');
  }

  static async getPaymentHistory() {
    return apiClient.get('/payments/history');
  }

  static async cancelPayment(id, reason) {
    return apiClient.put(`/payments/${id}/cancel`, { reason });
  }

  static async getPendingPaymentVoidRequests() {
    return apiClient.get('/payments/void-requests/pending');
  }

  static async reviewPaymentVoidRequest(id, decision, note = '') {
    return apiClient.put(`/payments/void-requests/${id}/review`, { decision, note });
  }

  static async getMyReviewedPaymentVoidRequests() {
    return apiClient.get('/payments/void-requests/mine/reviewed');
  }

  static async acknowledgePaymentVoidRequest(id) {
    return apiClient.put(`/payments/void-requests/${id}/acknowledge`, {});
  }

  static async voidPaymentDirectly(id, reason) {
    return apiClient.put(`/payments/${id}/void-direct`, { reason });
  }

  // ── RECEIPTS ──
  static async getReceipts() {
    return apiClient.get('/receipts');
  }

  static async getReceipt(id) {
    return apiClient.get(`/receipts/${id}`);
  }

  static async getReceiptPrintHTML(id) {
    return apiClient.get(`/receipts/${id}/print`);
  }

  static async getStudentReceipts(studentId) {
    return apiClient.get(`/receipts/student/${studentId}`);
  }

  static async getDocumentStudentSummaries() {
    return apiClient.get('/documents');
  }

  // ── SCHEDULES ──
  static async getSchedules() {
    return apiClient.get('/schedules');
  }

  static async getSchedulesByCourse(course) {
    return apiClient.get(`/schedules/course/${course}`);
  }

  static async getStudentSchedule(studentId) {
    return apiClient.get(`/schedules/student/${studentId}`);
  }

  static async selectSchedule(scheduleId, studentId) {
    return apiClient.post(`/schedules/${scheduleId}/select`, { studentId });
  }

  static async cancelScheduleAssignment(scheduleId, studentId) {
    return apiClient.delete(`/schedules/${scheduleId}/student/${studentId}`);
  }

  // ── COURSE CYCLES ──
  static async getCourseCycles(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiClient.get(`/course-cycles${qs ? '?' + qs : ''}`);
  }

  static async getCourseCycleDashboard(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiClient.get(`/course-cycles/dashboard${qs ? '?' + qs : ''}`);
  }

  static async getCourseEnrollmentOptions(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiClient.get(`/course-cycles/enrollment-options${qs ? '?' + qs : ''}`);
  }

  static async getTheoryEnrollmentOptions(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiClient.get(`/course-cycles/theory-options${qs ? '?' + qs : ''}`);
  }

  static async getInstructorFirstAvailability(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiClient.get(`/course-cycles/instructor-first-availability?${qs}`);
  }

  // ── NOTIFICATIONS ──
  static async reserveCourseCycleSchedule(data) {
    return apiClient.post('/course-cycles/reservations', data);
  }

  static async previewCourseCycleInstructor(data) {
    return apiClient.post('/course-cycles/instructor-preview', data);
  }

  static async getStudentScheduleChangeOptions(studentId) {
    return apiClient.get(`/course-cycles/student/${studentId}/schedule-change-options`);
  }

  static async changeStudentScheduleDay(data) {
    return apiClient.post('/course-cycles/schedule-changes', data);
  }

  static async getNotifications() {
    return apiClient.get('/notifications');
  }

  static async getUnreadNotifications() {
    return apiClient.get('/notifications/unread');
  }

  static async markNotificationAsRead(id) {
    return apiClient.put(`/notifications/${id}/read`);
  }

  // ── INSTRUCTORS ──
  static async getInstructors(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiClient.get(`/instructors${qs ? '?' + qs : ''}`);
  }

  static async getInstructorCalendar(instructorId, cycleId = null) {
    const params = new URLSearchParams();
    if (cycleId) params.set('cycleId', cycleId);
    const query = params.toString();
    return apiClient.get(`/instructors/${instructorId}/calendar${query ? `?${query}` : ''}`);
  }

  static async getMonthlyInstructorAvailability(month, modality = 'normal', vehicleType = 'carro') {
    return apiClient.get(`/instructors/availability/monthly?month=${encodeURIComponent(month)}&modality=${encodeURIComponent(modality)}&vehicleType=${encodeURIComponent(vehicleType)}`);
  }

  static async getInstructorPerformance(instructorId, month) {
    return apiClient.get(`/instructors/${instructorId}/performance?month=${encodeURIComponent(month)}`);
  }

  static async getInstructorPerformanceReport(instructorId, month) {
    return apiClient.get(`/instructors/${instructorId}/performance-report?month=${encodeURIComponent(month)}`);
  }

  static async exportInstructorPerformanceReport(instructorId, month) {
    return apiClient.download(`/instructors/${instructorId}/performance-report/export`, { month });
  }

  static async assignInstructor(data) {
    return apiClient.post('/instructors/assignments', data);
  }

  static async updateInstructorGroupAssignments(changes) {
    return apiClient.put('/instructors/groups', { changes });
  }

  static async getInstructorAvailabilityOverrides(instructorId, startDate, endDate) {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return apiClient.get(`/instructors/${instructorId}/availability-overrides?${params.toString()}`);
  }

  static async saveInstructorAvailabilityOverrides(instructorId, overrides, startDate, endDate) {
    return apiClient.put(`/instructors/${instructorId}/availability-overrides`, { overrides, startDate, endDate });
  }
}

export default ApiService;
