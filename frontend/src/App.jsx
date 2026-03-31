import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import Layout from './components/shared/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PlanningPage from './pages/PlanningPage';
import UserMasterPage from './pages/UserMasterPage';
import MachineTypesPage from './pages/MachineTypesPage';
import UserManagementPage from './pages/UserManagementPage';
import ProductionLinesPage from './pages/ProductionLinesPage';
import OperatorTransfersPage from './pages/OperatorTransfersPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import NotFoundPage from './pages/NotFoundPage';

const PrivateRoute = ({ children, module }) => {
  const { user, canAccess } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (module && !canAccess(module)) return <Navigate to="/" replace />;
  return children;
};

export default function App() {
  const { user } = useAuthStore();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      <Route path="/" element={
        <PrivateRoute><Layout /></PrivateRoute>
      }>
        <Route index element={<DashboardPage />} />
        <Route path="planning" element={
          <PrivateRoute module="planning"><PlanningPage /></PrivateRoute>
        } />
        <Route path="user-master" element={
          <PrivateRoute module="usermaster"><UserMasterPage /></PrivateRoute>
        } />
        <Route path="machine-types" element={
          <PrivateRoute module="machines"><MachineTypesPage /></PrivateRoute>
        } />
        <Route path="user-management" element={
          <PrivateRoute module="usermgmt"><UserManagementPage /></PrivateRoute>
        } />
        <Route path="production-lines" element={
          <PrivateRoute module="admin"><ProductionLinesPage /></PrivateRoute>
        } />
        <Route path="operator-transfers" element={
          <PrivateRoute module="admin"><OperatorTransfersPage /></PrivateRoute>
        } />
        <Route path="change-password" element={<ChangePasswordPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
