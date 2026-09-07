import { apiClient } from '../core/api/ApiClient.js';

const query = filters => {
  const params = new URLSearchParams(Object.entries(filters || {}).filter(([, value]) => value !== '' && value != null));
  return params.size ? `?${params}` : '';
};

export default class ReferralCampaignService {
  static participants(filters) { return apiClient.get(`/referrals/participants${query(filters)}`); }
  static leads(filters) { return apiClient.get(`/referrals/leads${query(filters)}`); }
  static enable(userId) { return apiClient.post(`/referrals/participants/${userId}/enable`); }
  static disable(userId) { return apiClient.post(`/referrals/participants/${userId}/disable`); }
  static regenerate(userId) { return apiClient.post(`/referrals/participants/${userId}/regenerate`); }
  static updateStatus(leadId, status) { return apiClient.patch(`/referrals/leads/${leadId}/status`, { status }); }
}
