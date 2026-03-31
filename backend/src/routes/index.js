const express = require('express');
const router = express.Router();
const { auth, requireAdmin, requireEngineer, requireTechnician } = require('../middleware/auth');
const authCtrl = require('../controllers/authController');
const usersCtrl = require('../controllers/usersController');
const machinesCtrl = require('../controllers/machinesController');
const capsCtrl = require('../controllers/capabilitiesController');
const schedCtrl = require('../controllers/schedulingController');
const linesCtrl = require('../controllers/linesController');
const poolCtrl = require('../controllers/poolController');
const leaveCtrl = require('../controllers/leaveController');

// Auth
router.post('/auth/login', authCtrl.login);
router.get('/auth/me', auth, authCtrl.me);
router.put('/auth/change-password', auth, authCtrl.changePassword);

// Dashboard
router.get('/dashboard/stats', auth, schedCtrl.getDashboardStats);
router.get('/dashboard/operator', auth, schedCtrl.getOperatorDashboard);

// Production lines (admin only)
router.get('/production-lines', auth, requireEngineer, linesCtrl.getProductionLines);
router.post('/production-lines', auth, requireAdmin, linesCtrl.createProductionLine);
router.put('/production-lines/:id', auth, requireAdmin, linesCtrl.updateProductionLine);
router.delete('/production-lines/:id', auth, requireAdmin, linesCtrl.deleteProductionLine);

// Users (admin only for getting all users, technician for getting team members on their line)
router.get('/users', auth, usersCtrl.getUsers);
router.get('/users/:id', auth, requireAdmin, usersCtrl.getUserById);
router.post('/users', auth, requireAdmin, usersCtrl.createUser);
router.put('/users/:id', auth, requireAdmin, usersCtrl.updateUser);
router.post('/users/:id/reset-password', auth, requireAdmin, usersCtrl.resetPassword);

// Machine types (engineer+ for view/create, admin only for edit/delete)
router.get('/machine-types', auth, requireEngineer, machinesCtrl.getMachineTypes);
router.post('/machine-types', auth, requireEngineer, machinesCtrl.createMachineType);
router.put('/machine-types/:id', auth, requireAdmin, machinesCtrl.updateMachineType);
router.delete('/machine-types/:id', auth, requireAdmin, machinesCtrl.deleteMachineType);
router.delete('/machine-types/:id/admin', auth, requireAdmin, machinesCtrl.deleteMachineTypeAdmin);

// Machines (engineer+)
router.get('/machines', auth, requireTechnician, machinesCtrl.getMachines);
router.post('/machines', auth, requireEngineer, machinesCtrl.createMachine);
router.put('/machines/:id', auth, requireEngineer, machinesCtrl.updateMachine);
router.delete('/machines/:id', auth, requireAdmin, machinesCtrl.deleteMachine);

// Capabilities (engineer+)
router.get('/capabilities', auth, requireEngineer, capsCtrl.getCapabilities);
router.post('/capabilities/:operatorId/:machineTypeId', auth, requireEngineer, capsCtrl.grantCapability);
router.delete('/capabilities/:operatorId/:machineTypeId', auth, requireEngineer, capsCtrl.revokeCapability);

// Scheduling
router.get('/plans', auth, requireTechnician, schedCtrl.getPlans);
router.get('/plans/:date/:shift/:line', auth, requireTechnician, schedCtrl.getOrCreatePlan);
router.post('/plans/:planId/assignments', auth, requireTechnician, schedCtrl.assignOperator);
router.delete('/plans/:planId/assignments/:assignmentId', auth, requireTechnician, schedCtrl.removeAssignment);
router.post('/plans/:planId/submit', auth, requireTechnician, schedCtrl.submitPlan);
router.post('/plans/:planId/engineer-approve', auth, requireEngineer, schedCtrl.engineerApprove);
router.post('/plans/:planId/cancel-approval', auth, requireAdmin, schedCtrl.cancelApproval);
router.post('/plans/:planId/review', auth, requireEngineer, schedCtrl.reviewPlan);

// Common Operator Pool (technician+)
router.post('/pool/offer', auth, requireTechnician, poolCtrl.offerOperatorToPool);
router.get('/pool/operators', auth, requireTechnician, poolCtrl.getPoolOperators);
router.get('/pool/line-operators', auth, requireTechnician, poolCtrl.getLineOperatorsWithLoad);
router.delete('/pool/:poolId', auth, requireTechnician, poolCtrl.removeOperatorFromPool);
router.post('/pool/mark-allocated', auth, requireTechnician, poolCtrl.markPoolOperatorAllocated);

// Operator Leave Management (technician+)
router.post('/leaves', auth, requireTechnician, leaveCtrl.createOrUpdateLeave);
router.get('/leaves/operator/:operatorId', auth, requireTechnician, leaveCtrl.getOperatorLeaves);
router.get('/leaves/line', auth, requireTechnician, leaveCtrl.getLineLeaves);
router.get('/leaves/check', auth, requireTechnician, leaveCtrl.checkOperatorLeave);
router.post('/leaves/approve', auth, requireEngineer, leaveCtrl.approveLeave);
router.delete('/leaves/:leaveId', auth, requireTechnician, leaveCtrl.deleteLeave);

module.exports = router;
