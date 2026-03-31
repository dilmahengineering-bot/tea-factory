import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../api/services';
import useAuthStore from '../store/authStore';
import styles from './DashboardPage.module.css';

const ROLE_ACCESS = {
  admin:      ['Planning Board', 'User Master', 'Machine Types', 'User Management'],
  engineer:   ['Planning Board', 'User Master', 'Machine Types'],
  technician: ['Planning Board'],
  operator:   [],
};

const MODULE_LINKS = {
  'Planning Board':   '/planning',
  'User Master':      '/user-master',
  'Machine Types':    '/machine-types',
  'User Management':  '/user-management',
};

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.getStats()
      .then(res => setStats(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const myAccess = ROLE_ACCESS[user?.role] || [];

  return (
    <div className="page-enter">
      <div className={styles.header}>
        <div>
          <h1>Dashboard</h1>
          <p className="text-muted" style={{marginTop:4}}>{today}</p>
        </div>
        <div className={styles.userWelcome}>
          <span className="text-muted">Logged in as</span>
          <span className={`badge badge-${user?.role}`}>{user?.role}</span>
          <strong>{user?.name}</strong>
          {user?.dedicatedLine && <span className={styles.lineTag}>{user.dedicatedLine}</span>}
        </div>
      </div>

      {loading ? (
        <div className={styles.loadWrap}><div className="spinner spinner-lg" /></div>
      ) : (
        <>
          <div className={styles.statsGrid}>
            <div className="stat-card">
              <div className="stat-value" style={{color:'var(--teal-400)'}}>
                {stats?.users?.operator || 0}
              </div>
              <div className="stat-label">Operators</div>
              <div className="stat-sub">{stats?.users?.technician || 0} technicians</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats?.machines?.total || 0}</div>
              <div className="stat-label">Machines</div>
              <div className="stat-sub">Across all lines</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{color:'var(--success)'}}>
                {stats?.plans?.approved || 0}
              </div>
              <div className="stat-label">Plans approved today</div>
              <div className="stat-sub">{stats?.plans?.submitted || 0} awaiting review</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{color:'var(--info)'}}>
                {stats?.activeOperatorsToday || 0}
              </div>
              <div className="stat-label">Active operators today</div>
              <div className="stat-sub">Across all shifts</div>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Your access</h3>
            <div className={styles.accessGrid}>
              {['Planning Board','User Master','Machine Types','User Management'].map(mod => {
                const hasAccess = myAccess.includes(mod);
                return (
                  <div key={mod} className={`${styles.accessCard} ${hasAccess ? styles.accessGranted : styles.accessDenied}`}>
                    <div className={styles.accessStatus}>
                      {hasAccess ? '✓' : '✗'}
                    </div>
                    <div className={styles.accessLabel}>{mod}</div>
                    {hasAccess && (
                      <Link to={MODULE_LINKS[mod]} className={`btn btn-sm btn-secondary ${styles.accessBtn}`}>
                        Open →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {(user?.role === 'technician' || user?.role === 'admin' || user?.role === 'engineer') && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Quick actions</h3>
              <div className={styles.quickGrid}>
                <Link to="/planning" className={styles.quickCard}>
                  <span className={styles.quickIcon}>⊞</span>
                  <div>
                    <div className={styles.quickTitle}>Create today's plan</div>
                    <div className={styles.quickSub}>Schedule operators for day / night shifts</div>
                  </div>
                </Link>
                {(user?.role === 'engineer' || user?.role === 'admin') && (
                  <>
                    <Link to="/user-master" className={styles.quickCard}>
                      <span className={styles.quickIcon}>◎</span>
                      <div>
                        <div className={styles.quickTitle}>Update capabilities</div>
                        <div className={styles.quickSub}>Grant machine certifications after training</div>
                      </div>
                    </Link>
                    <Link to="/planning" className={styles.quickCard}>
                      <span className={styles.quickIcon}>✓</span>
                      <div>
                        <div className={styles.quickTitle}>Review submitted plans</div>
                        <div className={styles.quickSub}>
                          {stats?.plans?.submitted
                            ? `${stats.plans.submitted} plan${stats.plans.submitted > 1 ? 's' : ''} awaiting approval`
                            : 'No plans pending review'}
                        </div>
                      </div>
                    </Link>
                  </>
                )}
                {user?.role === 'admin' && (
                  <Link to="/user-management" className={styles.quickCard}>
                    <span className={styles.quickIcon}>⊕</span>
                    <div>
                      <div className={styles.quickTitle}>Manage users</div>
                      <div className={styles.quickSub}>Add, edit or deactivate user accounts</div>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
