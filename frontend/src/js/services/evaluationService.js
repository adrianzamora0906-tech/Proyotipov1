import { apiClient } from '../core/api/ApiClient.js';

class EvaluationService {
  static async getEvaluations() {
    return apiClient.get('/instructor/evaluations');
  }

  static async getPendingEvaluations() {
    return apiClient.get('/instructor/evaluations/pending');
  }

  static async createEvaluation(data) {
    return apiClient.post('/instructor/evaluations', data);
  }
}

export default EvaluationService;
