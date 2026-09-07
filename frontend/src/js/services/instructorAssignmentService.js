import ApiService from '../core/api/apiService.js';

class InstructorAssignmentService {
  static async getInstructors(params = {}) {
    return ApiService.getInstructors(params);
  }

  static async assignInstructor(enrollmentId, instructorId) {
    return ApiService.assignInstructor({ enrollmentId, instructorId });
  }
}

export default InstructorAssignmentService;
