import {apiClient} from '../core/api/ApiClient.js';
export default class StudentPortalService{static summary(enrollmentId=null){return apiClient.get(`/student-portal/summary${enrollmentId ? `?enrollmentId=${encodeURIComponent(enrollmentId)}` : ''}`);}}
