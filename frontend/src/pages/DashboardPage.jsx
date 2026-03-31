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

function OperatorDashboard({ user, today }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.getOperatorDashboard()
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={styles.loadWrap}><div className="spinner spinner-lg" /></div>;

  const { today: todayData, upcoming, capabilities, recentHistory, leaves } = data || {};

  return (
    <>
      {/* Today's summary cards */}
      <div className={styles.statsGrid}>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--accent)'}}>
            {todayData?.machineCount || 0}
          </div>
          <div className="stat-label">Machines today</div>
          <div className="stat-sub">Assigned to you</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color: (todayData?.totalLoad || 0) > 1 ? 'var(--danger)' : 'var(--success)'}}>
            {todayData?.totalLoad || 0}
          </div>
          <div className="stat-label">Total load</div>
          <div className="stat-sub">{(todayData?.totalLoad || 0) > 1 ? 'Overloaded' : 'Normal'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--teal-400)'}}>
            {capabilities?.length || 0}
          </div>
          <div className="stat-label">Capabilities</div>
          <div className="stat-sub">Machine types certified</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--info)'}}>
            {leaves?.length || 0}
          </div>
          <div className="stat-label">Upcoming leaves</div>
          <div className="stat-sub">Scheduled</div>
        </div>
      </div>

      {/* Today's assigned machines */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Today's assignments</h3>
        {todayData?.assignments?.length > 0 ? (
          <div className={styles.opTable}>
            <table>
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Type</th>
                  <th>Line</th>
                  <th>Shift</th>
                  <th>Load</th>
                  <th>Attention</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {todayData.assignments.map(a => (
                  <tr key={a.id}>
                    <td><strong>{a.machine_name}</strong></td>
                    <td>{a.machine_type}</td>
                    <td><span className={styles.lineTag}>{a.line}</span></td>
                    <td><span className={`badge badge-${a.shift === 'day' ? 'info' : 'secondary'}`}>{a.shift}</span></td>
                    <td>
                      <span className={a.is_overload ? styles.loadHigh : styles.loadNormal}>
                        {a.load_score}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${a.attention_level === 'HIGH' ? 'danger' : a.attention_level === 'MED' ? 'warning' : 'success'}`}>
                        {a.attention_level}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${a.plan_status === 'approved' || a.plan_status === 'engineer_approved' ? 'success' : a.plan_status === 'submitted' ? 'info' : 'secondary'}`}>
                        {a.plan_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyCard}>No machines assigned for today yet.</div>
        )}
      </div>

      {/* Upcoming plans */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Upcoming plans (next 7 days)</h3>
        {upcoming?.length > 0 ? (
          <div className={styles.opTable}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shift</th>
                  <th>Machine</th>
                  <th>Type</th>
                  <th>Line</th>
                  <th>Load</th>
                  <th>Attention</th>
                  <th>Plan status</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map(a => (
                  <tr key={a.id}>
                    <td>{new Date(a.plan_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                    <td><span className={`badge badge-${a.shift === 'day' ? 'info' : 'secondary'}`}>{a.shift}</span></td>
                    <td><strong>{a.machine_name}</strong></td>
                    <td>{a.machine_type}</td>
                    <td><span className={styles.lineTag}>{a.line}</span></td>
                    <td>
                      <span className={a.is_overload ? styles.loadHigh : styles.loadNormal}>
                        {a.load_score}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${a.attention_level === 'HIGH' ? 'danger' : a.attention_level === 'MED' ? 'warning' : 'success'}`}>
                        {a.attention_level}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${a.plan_status === 'approved' || a.plan_status === 'engineer_approved' ? 'success' : a.plan_status === 'submitted' ? 'info' : 'secondary'}`}>
                        {a.plan_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyCard}>No upcoming plans for the next 7 days.</div>
        )}
      </div>

      {/* Capabilities */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Your capabilities</h3>
        {capabilities?.length > 0 ? (
          <div className={styles.capGrid}>
            {capabilities.map((c, i) => (
              <div key={i} className={styles.capCard}>
                <span className={styles.capIcon}>✓</span>
                <div>
                  <div className={styles.capName}>{c.machine_type}</div>
                  <div className={styles.capDate}>Since {new Date(c.granted_at).toLocaleDateString('en-GB')}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyCard}>No capabilities granted yet. Contact your engineer.</div>
        )}
      </div>

      {/* Recent history */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Recent history (last 7 days)</h3>
        {recentHistory?.length > 0 ? (
          <div className={styles.opTable}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shift</th>
                  <th>Machine</th>
                  <th>Line</th>
                  <th>Load</th>
                </tr>
              </thead>
              <tbody>
                {recentHistory.map((h, i) => (
                  <tr key={i}>
                    <td>{new Date(h.plan_date).toLocaleDateString('en-GB')}</td>
                    <td><span className={`badge badge-${h.shift === 'day' ? 'info' : 'secondary'}`}>{h.shift}</span></td>
                    <td>{h.machine_name}</td>
                    <td><span className={styles.lineTag}>{h.line}</span></td>
                    <td>{h.load_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyCard}>No assignment history for the past 7 days.</div>
        )}
      </div>

      {/* Upcoming leaves */}
      {leaves?.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Upcoming leaves</h3>
          <div className={styles.opTable}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Shift</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((l, i) => (
                  <tr key={i}>
                    <td>{new Date(l.leave_date).toLocaleDateString('en-GB')}</td>
                    <td>{l.leave_type}</td>
                    <td>{l.shift}</td>
                    <td>
                      <span className={`badge badge-${l.approval_status === 'approved' ? 'success' : l.approval_status === 'rejected' ? 'danger' : 'warning'}`}>
                        {l.approval_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

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

      {user?.role === 'operator' ? (
        <OperatorDashboard user={user} today={today} />
      ) : loading ? (
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
