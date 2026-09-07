import { apiClient } from "../core/api/ApiClient.js";
const query = (params) => {
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
};
export default class AdminService {
  static universalReport(params = {}) {
    return apiClient.get(`/admin/reports/universal${query(params)}`);
  }
  static reportAssistant(data = {}) {
    return apiClient.post('/admin/reports/assistant', data);
  }
  static exportUniversalReport(params = {}) {
    return apiClient.download("/admin/reports/universal/export", params);
  }
  static generateAtmAuthorization(data) {
    return apiClient.download("/admin/atm-authorizations/generate", data);
  }
  static atmAuthorizations(params = {}) {
    return apiClient.get(`/admin/atm-authorizations${query(params)}`);
  }
  static atmAuthorizationBranches() {
    return apiClient.get("/admin/atm-authorizations/branches");
  }
  static downloadAtmAuthorization(id, attachment = "") {
    return apiClient.downloadGet(`/admin/atm-authorizations/${id}/download${attachment ? `?attachment=${attachment}` : ""}`);
  }
  static exportPermitStudents(params = {}) {
    return apiClient.downloadGet(`/admin/atm-authorizations/permit-students/export${query(params)}`);
  }
  static exportPermitStudentIdentifications(params = {}) {
    return apiClient.downloadGet(`/admin/atm-authorizations/permit-students/identifications.zip${query(params)}`);
  }
  static permitCourseOptions(params = {}) {
    return apiClient.get(`/admin/atm-authorizations/permit-courses${query(params)}`);
  }
  static deleteAtmAuthorization(id) {
    return apiClient.delete(`/admin/atm-authorizations/${id}`);
  }
  static courseReports(params = {}) {
    return apiClient.get(`/admin/reports/courses${query(params)}`);
  }
  static courseReportStudents(cycleId) {
    return apiClient.get(`/admin/reports/courses/${cycleId}/students`);
  }
  static exportCourseReportStudents(cycleId) {
    return apiClient.download(`/admin/reports/courses/${cycleId}/students/export`, {});
  }
  static users(params = {}) {
    return apiClient.get(`/admin/users${query(params)}`);
  }
  static user(id, params = {}) {
    return apiClient.get(`/admin/users/${id}${query(params)}`);
  }
  static createUser(data) {
    return apiClient.post("/admin/users", data);
  }
  static updateUser(id, data) {
    return apiClient.put(`/admin/users/${id}`, data);
  }
  static instructorAvailability(id, branchId = "") {
    return apiClient.get(`/admin/users/${id}/instructor-availability${query({ branchId })}`);
  }
  static saveInstructorAvailability(id, slots, practiceArea, branchAssignment = null) {
    return apiClient.put(`/admin/users/${id}/instructor-availability`, { slots, practiceArea, branchAssignment });
  }
  static setActive(id, active, reason = "") {
    return apiClient.put(`/admin/users/${id}/active`, { active, reason });
  }
  static resetUserAccess(id, reason = "") {
    return apiClient.post(`/admin/users/${id}/reset-access`, { reason });
  }
  static revokeUserSessions(id, reason = "") {
    return apiClient.post(`/admin/users/${id}/sessions/revoke`, { reason });
  }
  static updateUserPermissions(id, data) {
    return apiClient.put(`/admin/users/${id}/permissions`, data);
  }
  static grantPermission(id, data) {
    return apiClient.post(`/admin/users/${id}/permissions`, data);
  }
  static revokePermission(userId, id, reason) {
    return apiClient.delete(`/admin/users/${userId}/permissions/${id}`, {
      reason,
    });
  }
  static roles() {
    return apiClient.get("/admin/roles");
  }
  static permissions() {
    return apiClient.get("/admin/permissions");
  }
  static sessions() {
    return apiClient.get("/admin/sessions");
  }
  static revokeSession(id, reason) {
    return apiClient.post(`/admin/sessions/${id}/revoke`, { reason });
  }
  static branches(params = {}) {
    return apiClient.get(`/admin/branches${query(params)}`);
  }
  static branchLocations() {
    return apiClient.get("/admin/branches/locations/catalog");
  }
  static branchMapConfig() {
    return apiClient.get("/admin/branches/locations/map-config");
  }
  static createBranch(data) {
    return apiClient.post("/admin/branches", data);
  }
  static updateBranch(id, data) {
    return apiClient.put(`/admin/branches/${id}`, data);
  }
  static branch(id) {
    return apiClient.get(`/admin/branches/${id}`);
  }
  static branchSummary(id, params = {}) {
    return apiClient.get(`/admin/branches/${id}/summary${query(params)}`);
  }
  static branchStaff(id, params = {}) {
    return apiClient.get(`/admin/branches/${id}/staff${query(params)}`);
  }
  static branchWorkflow(id) {
    return apiClient.get(`/admin/branches/${id}/workflow`);
  }
  static updateBranchWorkflow(id, data) {
    return apiClient.put(`/admin/branches/${id}/workflow`, data);
  }
  static branchPaymentMethods(id) {
    return apiClient.get(`/admin/branches/${id}/payment-methods`);
  }
  static updateBranchPaymentMethods(id, data) {
    return apiClient.put(`/admin/branches/${id}/payment-methods`, data);
  }
  static branchCourses(id) {
    return apiClient.get(`/admin/branches/${id}/courses`);
  }
  static branchComplementaryServices(id) {
    return apiClient.get(`/admin/branches/${id}/courses/services`);
  }
  static updateBranchComplementaryService(id, serviceId, data) {
    return apiClient.put(`/admin/branches/${id}/courses/services/${serviceId}`, data);
  }
  static branchTrainingRoutes(id) {
    return apiClient.get(`/admin/branches/${id}/training-routes`);
  }
  static branchTrainingRoutesTemplate(id) {
    return apiClient.downloadGet(`/admin/branches/${id}/training-routes/template`);
  }
  static previewBranchTrainingRoutes(id, fileBase64, fileName = '') {
    return apiClient.post(`/admin/branches/${id}/training-routes/preview`, { fileBase64, fileName });
  }
  static importBranchTrainingRoutes(id, fileBase64, fileName = '') {
    return apiClient.post(`/admin/branches/${id}/training-routes/import`, { fileBase64, fileName, confirmReplace: true });
  }
  static updateBranchCourse(id, courseId, active) {
    return apiClient.put(`/admin/branches/${id}/courses/${courseId}`, {
      active,
    });
  }
  static createBranchCourse(id, data) {
    return apiClient.post(`/admin/branches/${id}/courses`, data);
  }
  static updateCourse(id, courseId, data) {
    return apiClient.put(
      `/admin/branches/${id}/courses/${courseId}/details`,
      data,
    );
  }
  static courseProgram(id, courseId) {
    return apiClient.get(`/admin/branches/${id}/courses/${courseId}/program`);
  }
  static saveCourseProgram(id, courseId, data) {
    return apiClient.put(
      `/admin/branches/${id}/courses/${courseId}/program`,
      data,
    );
  }
  static theorySchedules(id) {
    return apiClient.get(`/admin/branches/${id}/theory-schedules`);
  }
  static saveTheorySchedule(id, data) {
    return apiClient.post(`/admin/branches/${id}/theory-schedules`, data);
  }
  static updateTheorySchedule(id, scheduleId, data) {
    return apiClient.put(`/admin/branches/${id}/theory-schedules/${scheduleId}`, data);
  }
  static deleteTheorySchedule(id, scheduleId) {
    return apiClient.delete(`/admin/branches/${id}/theory-schedules/${scheduleId}`);
  }
  static saveTheorySettings(id, data) {
    return apiClient.put(`/admin/branches/${id}/theory-settings`, data);
  }
  static branchSettings(id) {
    return apiClient.get(`/admin/branches/${id}/settings`);
  }
  static branchActivity(id, params = {}) {
    return apiClient.get(`/admin/branches/${id}/activity${query(params)}`);
  }
  static audit(params = { limit: 25 }) {
    return apiClient.get(`/admin/audit${query(params)}`);
  }
  static enrollmentMonitor(params = {}) {
    return apiClient.get(`/admin/enrollment-monitor${query(params)}`);
  }
  static auditPaymentVoids(params = {}) {
    return apiClient.get(`/admin/audit/payment-voids${query(params)}`);
  }
  static settings(params = {}) {
    return apiClient.get(`/admin/settings${query(params)}`);
  }
  static saveSettings(items) {
    return apiClient.put("/admin/settings/bulk", { items });
  }
  static workflows(params = {}) {
    return apiClient.get(`/admin/workflows${query(params)}`);
  }
}
