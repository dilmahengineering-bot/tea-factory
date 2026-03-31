import api from './client';

// Auth
export const authApi = {
  login: (identifier, password) => api.post('/auth/login', { identifier, password }),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword, newPassword) => api.put('/auth/change-password', { currentPassword, newPassword }),
};

// Dashboard
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getOperatorDashboard: () => api.get('/dashboard/operator'),
};

// Production lines
export const productionLinesApi = {
  getAll: () => api.get('/production-lines'),
  create: (data) => api.post('/production-lines', data),
  update: (id, data) => api.put(`/production-lines/${id}`, data),
  delete: (id) => api.delete(`/production-lines/${id}`),
};

// Users (admin only)
export const usersApi = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  resetPassword: (id, newPassword) => api.post(`/users/${id}/reset-password`, { newPassword }),
};

// Machine types
export const machineTypesApi = {
  getAll: () => api.get('/machine-types'),
  create: (data) => api.post('/machine-types', data),
  update: (id, data) => api.put(`/machine-types/${id}`, data),
  delete: (id) => api.delete(`/machine-types/${id}`),
};

// Machines
export const machinesApi = {
  getAll: (params) => api.get('/machines', { params }),
  create: (data) => api.post('/machines', data),
  update: (id, data) => api.put(`/machines/${id}`, data),
  delete: (id) => api.delete(`/machines/${id}`),
};

// Capabilities
export const capabilitiesApi = {
  getAll: (params) => api.get('/capabilities', { params }),
  grant: (operatorId, machineTypeId, data) => api.post(`/capabilities/${operatorId}/${machineTypeId}`, data),
  revoke: (operatorId, machineTypeId) => api.delete(`/capabilities/${operatorId}/${machineTypeId}`),
};

// Scheduling
export const schedulingApi = {
  getPlans: (params) => api.get('/plans', { params }),
  getPlan: (date, shift, line) => api.get(`/plans/${date}/${shift}/${line}`),
  assign: (planId, data) => api.post(`/plans/${planId}/assignments`, data),
  removeAssignment: (planId, assignmentId) => api.delete(`/plans/${planId}/assignments/${assignmentId}`),
  submit: (planId) => api.post(`/plans/${planId}/submit`),
  engineerApprove: (planId, action) => api.post(`/plans/${planId}/engineer-approve`, { action }),
  cancelApproval: (planId) => api.post(`/plans/${planId}/cancel-approval`),
  review: (planId, action, note) => api.post(`/plans/${planId}/review`, { action, note }),
};

// Common Operator Pool
export const poolApi = {
  offerOperator: (data) => api.post('/pool/offer', data),
  getPoolOperators: (params) => api.get('/pool/operators', { params }),
  getLineOperators: (params) => api.get('/pool/line-operators', { params }),
  removeFromPool: (poolId) => api.delete(`/pool/${poolId}`),
  markAllocated: (data) => api.post('/pool/mark-allocated', data),
};

// Operator Leave Management
export const leaveApi = {
  createOrUpdate: (data) => api.post('/leaves', data),
  getMyLeaves: (params) => api.get('/leaves/my', { params }),
  getOperatorLeaves: (operatorId, params) => api.get(`/leaves/operator/${operatorId}`, { params }),
  getLineLeaves: (params) => api.get('/leaves/line', { params }),
  checkLeave: (params) => api.get('/leaves/check', { params }),
  approveLeave: (data) => api.post('/leaves/approve', data),
  deleteLeave: (leaveId) => api.delete(`/leaves/${leaveId}`),
};
