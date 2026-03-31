import { create } from 'zustand';

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,

  setAuth: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },

  // Role helpers
  isAdmin: () => {
    const state = useAuthStore.getState();
    return state.user?.role === 'admin';
  },
  isEngineer: () => {
    const state = useAuthStore.getState();
    return ['admin', 'engineer'].includes(state.user?.role);
  },
  isTechnician: () => {
    const state = useAuthStore.getState();
    return ['admin', 'engineer', 'technician'].includes(state.user?.role);
  },
  canAccess: (module) => {
    const state = useAuthStore.getState();
    const role = state.user?.role;
    const access = {
      dashboard:  ['admin','engineer','technician','operator'],
      planning:   ['admin','engineer','technician'],
      usermaster: ['admin','engineer'],
      machines:   ['admin','engineer'],
      usermgmt:   ['admin'],
    };
    return access[module]?.includes(role) || false;
  },
}));

export default useAuthStore;
