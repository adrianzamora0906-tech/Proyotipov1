import {apiClient} from '../core/api/ApiClient.js';
export default class StudentPortalService{static summary(){return apiClient.get('/student-portal/summary');}}
