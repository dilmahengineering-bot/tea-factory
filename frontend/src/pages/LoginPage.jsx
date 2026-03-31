
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../api/services';
import useAuthStore from '../store/authStore';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier || !password) { setError('Please enter both credentials and password'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await authApi.login(identifier.trim(), password);
      setAuth(res.data.user, res.data.token);
      toast.success(`Welcome back, ${res.data.user.name}`);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.leftPanel}>
          <h1>DILMAH</h1>
          <p>Tea Factory Scheduling & Resource Management System designed to streamline workflow planning. Allocate operators efficiently, avoid conflicts, and ensure structured approvals across production lines.</p>
        </div>
        <div className={styles.rightPanel}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.formHeader}>
              <h2>Sign in</h2>
            </div>
            <div className="form-group">
              <label className={styles['form-label']}>Employee ID / Email</label>
              <input
                className={styles['form-input']}
                type="text"
                placeholder="Enter your ID or email"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="form-group">
              <label className={styles['form-label']}>Password</label>
              <input
                className={styles['form-input']}
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className={styles.formActions + ' form-actions'}>
              <label className={styles.rememberMe}>
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                Remember me
              </label>
              <a href="#" className={styles.forgot}>Forgot password?</a>
            </div>
            <button className={styles.submitBtn} type="submit" disabled={loading}>
              {loading ? <><span className="spinner" style={{width:16,height:16}} /> Signing in…</> : 'Sign In'}
            </button>
            {error && <div className={styles.errorBanner}>{error}</div>}
          </form>
          <div className={styles.copyright}>
            © 2026 DILMAH System. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}
