import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { usersApi, productionLinesApi } from '../api/services';
import useAuthStore from '../store/authStore';
import styles from './UserManagementPage.module.css';

const ROLES = ['admin', 'engineer', 'technician', 'operator'];
const NEEDS_LINE = ['technician', 'operator'];

function initials(name) {
  return name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
}

function getEmptyForm(lines) {
  return { name: '', empNo: '', email: '', password: '', role: 'operator', dedicatedLine: lines[0]?.line_name || '', isActive: true };
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState('all');
  const [filterLine, setFilterLine] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(getEmptyForm([]));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [resetPwdUser, setResetPwdUser] = useState(null);
  const [newPwd, setNewPwd] = useState('');
  const [pwdError, setPwdError] = useState('');

  useEffect(() => { loadUsers(); }, [filterRole, filterLine]);

  useEffect(() => {
    const loadLines = async () => {
      try {
        const res = await productionLinesApi.getAll();
        const loadedLines = res.data || [];
        setLines(loadedLines);
        // Update form with first line from loaded lines
        if (loadedLines.length > 0 && (!form.dedicatedLine || form.dedicatedLine === '')) {
          setForm(f => ({ ...f, dedicatedLine: loadedLines[0].line_name }));
        }
      } catch (error) {
        console.error('Failed to load production lines:', error);
        toast.error('Failed to load production lines');
      }
    };
    loadLines();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterRole !== 'all') params.role = filterRole;
      if (filterLine !== 'all') params.line = filterLine;
      const res = await usersApi.getAll(params);
      setUsers(res.data);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(getEmptyForm(lines));
    setErrors({});
    setShowForm(true);
  };

  const openEdit = (user) => {
    setEditingId(user.id);
    setForm({
      name: user.name,
      empNo: user.emp_no,
      email: user.email || '',
      password: '',
      role: user.role,
      dedicatedLine: user.dedicated_line || (lines.length > 0 ? lines[0].line_name : ''),
      isActive: user.is_active,
    });
    setErrors({});
    setShowForm(true);
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.empNo.trim()) errs.empNo = 'Employee number is required';
    if (!editingId && !form.password) errs.password = 'Password is required for new users';
    if (!editingId && form.password && form.password.length < 8) errs.password = 'Minimum 8 characters';
    if (!form.role) errs.role = 'Role is required';
    return errs;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        empNo: form.empNo.trim(),
        email: form.email.trim() || undefined,
        role: form.role,
        dedicatedLine: NEEDS_LINE.includes(form.role) ? form.dedicatedLine : undefined,
        isActive: form.isActive,
      };
      if (!editingId) payload.password = form.password;

      if (editingId) {
        await usersApi.update(editingId, payload);
        toast.success('User updated');
      } else {
        await usersApi.create(payload);
        toast.success(`User "${form.name}" created`);
      }
      setShowForm(false);
      await loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user) => {
    if (user.id === currentUser.id) { toast.error('You cannot deactivate your own account'); return; }
    try {
      await usersApi.update(user.id, { isActive: !user.is_active });
      toast.success(`${user.name} ${user.is_active ? 'deactivated' : 'activated'}`);
      await loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleResetPassword = async () => {
    if (!newPwd || newPwd.length < 8) { setPwdError('Minimum 8 characters'); return; }
    try {
      await usersApi.resetPassword(resetPwdUser.id, newPwd);
      toast.success(`Password reset for ${resetPwdUser.name}`);
      setResetPwdUser(null);
      setNewPwd('');
      setPwdError('');
    } catch (err) {
      setPwdError(err.response?.data?.error || 'Failed');
    }
  };

  const roleCounts = ROLES.reduce((acc, r) => {
    acc[r] = users.filter(u => u.role === r).length;
    return acc;
  }, {});

  return (
    <div className="page-enter">
      <div className={styles.header}>
        <div>
          <h1>User Management</h1>
          <p className="text-muted" style={{ marginTop: 4 }}>
            Admin-only — create, edit, and manage all user accounts.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add user</button>
      </div>

      {/* Summary row */}
      <div className={styles.summaryRow}>
        {ROLES.map(r => (
          <div key={r} className={styles.summaryCard} onClick={() => setFilterRole(filterRole === r ? 'all' : r)}
            style={{ cursor: 'pointer', borderColor: filterRole === r ? 'var(--accent)' : '' }}>
            <span className={`badge badge-${r}`}>{r}</span>
            <span className={styles.summaryCount}>{roleCounts[r]}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <select className="form-select" style={{ width: 'auto' }} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="all">All roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="form-select" style={{ width: 'auto' }} value={filterLine} onChange={e => setFilterLine(e.target.value)}>
          <option value="all">All lines</option>
          {lines.map(l => <option key={l.id} value={l.line_name}>{l.line_name}</option>)}
        </select>
        <span className="text-muted" style={{ fontSize: '0.875rem' }}>{users.length} user{users.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner spinner-lg" /></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Emp #</th>
                <th>Role</th>
                <th>Line</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className={`avatar avatar-sm av-${user.role}`}>{initials(user.name)}</div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{user.name}</div>
                        {user.email && <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{user.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td><span className="font-mono" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{user.emp_no}</span></td>
                  <td><span className={`badge badge-${user.role}`}>{user.role}</span></td>
                  <td>
                    {user.dedicated_line
                      ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--teal-400)' }}>{user.dedicated_line}</span>
                      : <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>—</span>}
                  </td>
                  <td>
                    <span className={`badge ${user.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(user)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setResetPwdUser(user); setNewPwd(''); setPwdError(''); }}>
                        Reset pwd
                      </button>
                      {user.id !== currentUser.id && (
                        <button className={`btn btn-sm ${user.is_active ? 'btn-danger' : 'btn-ghost'}`} onClick={() => handleToggleActive(user)}>
                          {user.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 style={{ marginBottom: '1.25rem' }}>{editingId ? 'Edit user' : 'Add new user'}</h3>
            <form onSubmit={handleSave}>
              <div className={styles.formGrid}>
                <div className="form-group">
                  <label className="form-label">Full name *</label>
                  <input className="form-input" value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErrors({}); }} placeholder="Full name" />
                  <span className="form-error">{errors.name}</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Employee number *</label>
                  <input className="form-input" value={form.empNo} onChange={e => { setForm(f => ({ ...f, empNo: e.target.value })); setErrors({}); }} placeholder="e.g. OP007" />
                  <span className="form-error">{errors.empNo}</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Email {NEEDS_LINE.includes(form.role) ? '(optional)' : '*'}</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@teafactory.lk" />
                </div>
                {!editingId && (
                  <div className="form-group">
                    <label className="form-label">Password *</label>
                    <input className="form-input" type="password" value={form.password} onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setErrors({}); }} placeholder="Min. 8 characters" />
                    <span className="form-error">{errors.password}</span>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Role *</label>
                  <select className="form-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <span className="form-error">{errors.role}</span>
                </div>
                {NEEDS_LINE.includes(form.role) && (
                  <div className="form-group">
                    <label className="form-label">Dedicated line *</label>
                    <select className="form-select" value={form.dedicatedLine} onChange={e => setForm(f => ({ ...f, dedicatedLine: e.target.value }))}>
                      {lines.length > 0 ? lines.map(l => <option key={l.id} value={l.line_name}>{l.line_name}</option>) : <option>No lines available</option>}
                    </select>
                  </div>
                )}
                {editingId && (
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-select" value={form.isActive.toString()} onChange={e => setForm(f => ({ ...f, isActive: e.target.value === 'true' }))}>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
                  {editingId ? 'Save changes' : 'Create user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetPwdUser && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 360 }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Reset password</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Setting new password for <strong style={{ color: 'var(--text)' }}>{resetPwdUser.name}</strong>
            </p>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">New password</label>
              <input className="form-input" type="password" placeholder="Min. 8 characters"
                value={newPwd} onChange={e => { setNewPwd(e.target.value); setPwdError(''); }} />
              <span className="form-error">{pwdError}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setResetPwdUser(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleResetPassword}>Reset password</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
