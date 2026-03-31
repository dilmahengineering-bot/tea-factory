import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from 'recharts';
import { dashboardApi, leaveApi } from '../api/services';
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
  const [myLeaves, setMyLeaves] = useState([]);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveType, setLeaveType] = useState('sick');
  const [leaveShift, setLeaveShift] = useState('both');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveLoading, setLeaveLoading] = useState(false);

  useEffect(() => {
    dashboardApi.getOperatorDashboard()
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
    loadMyLeaves();
  }, []);

  const loadMyLeaves = () => {
    leaveApi.getMyLeaves()
      .then(res => setMyLeaves(res.data))
      .catch(() => {});
  };

  const handleSubmitLeave = async () => {
    if (!leaveDate) return;
    setLeaveLoading(true);
    try {
      await leaveApi.createOrUpdate({
        operatorId: user.id,
        leaveDate,
        leaveType,
        shift: leaveShift,
        reason: leaveReason,
      });
      setShowLeaveForm(false);
      setLeaveDate('');
      setLeaveType('sick');
      setLeaveShift('both');
      setLeaveReason('');
      loadMyLeaves();
    } catch {
      alert('Failed to submit leave request');
    } finally {
      setLeaveLoading(false);
    }
  };

  const handleDeleteLeave = async (leaveId) => {
    if (!window.confirm('Cancel this leave request?')) return;
    try {
      await leaveApi.deleteLeave(leaveId);
      loadMyLeaves();
    } catch {
      alert('Failed to cancel leave');
    }
  };

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

      {/* Leave Management */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Leave management</h3>
          <button className="btn btn-sm btn-primary" onClick={() => setShowLeaveForm(v => !v)}>
            {showLeaveForm ? 'Cancel' : '+ Request leave'}
          </button>
        </div>

        {showLeaveForm && (
          <div className={styles.leaveForm}>
            <div className={styles.formRow}>
              <label>Date</label>
              <input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]} />
            </div>
            <div className={styles.formRow}>
              <label>Type</label>
              <select value={leaveType} onChange={e => setLeaveType(e.target.value)}>
                <option value="sick">Sick</option>
                <option value="vacation">Vacation</option>
                <option value="emergency">Emergency</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className={styles.formRow}>
              <label>Shift</label>
              <select value={leaveShift} onChange={e => setLeaveShift(e.target.value)}>
                <option value="both">Both (full day)</option>
                <option value="day">Day only</option>
                <option value="night">Night only</option>
              </select>
            </div>
            <div className={styles.formRow}>
              <label>Reason</label>
              <input type="text" value={leaveReason} onChange={e => setLeaveReason(e.target.value)}
                placeholder="Optional reason..." />
            </div>
            <button className="btn btn-primary" onClick={handleSubmitLeave} disabled={leaveLoading || !leaveDate}>
              {leaveLoading ? 'Submitting...' : 'Submit leave request'}
            </button>
          </div>
        )}

        {myLeaves.length > 0 ? (
          <div className={styles.opTable}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Shift</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {myLeaves.map(l => (
                  <tr key={l.id}>
                    <td>{new Date(l.leave_date).toLocaleDateString('en-GB')}</td>
                    <td>{l.leave_type}</td>
                    <td>{l.shift}</td>
                    <td>{l.reason || '-'}</td>
                    <td>
                      <span className={`badge badge-${l.approval_status === 'approved' ? 'success' : l.approval_status === 'rejected' ? 'danger' : 'warning'}`}>
                        {l.approval_status}
                      </span>
                    </td>
                    <td>
                      {l.approval_status === 'pending' && (
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteLeave(l.id)}>✗</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyCard}>No leave records.</div>
        )}
      </div>
    </>
  );
}

const CHART_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.getAdminDashboard()
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={styles.loadWrap}><div className="spinner spinner-lg" /></div>;
  if (!data) return <div className={styles.emptyCard}>Failed to load admin dashboard.</div>;

  const { lines, totals, planStatus, weeklyTrend, weekLeaves, machinesByType, users } = data;

  // Chart data: Line overview (operators, assigned, leaves, load gap)
  const lineChartData = lines.map(l => ({
    name: l.lineCode,
    'Total Operators': l.totalOperators,
    'Assigned': l.assignedOperators,
    'On Leave': l.leavesToday,
    'Available': l.availableOperators,
  }));

  const loadChartData = lines.map(l => ({
    name: l.lineCode,
    'Total Load': l.totalLoad,
    'Capacity': l.totalMachineCapacity,
    'Load Gap': l.loadGap > 0 ? l.loadGap : 0,
  }));

  // Weekly trend
  const trendData = weeklyTrend.map(d => ({
    date: new Date(d.plan_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
    'Operators': d.operators_assigned,
    'Assignments': d.total_assignments,
    'Avg Load': parseFloat(d.avg_load),
  }));

  // Leave by day
  const leaveTrendData = {};
  weekLeaves.forEach(d => {
    const key = new Date(d.leave_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
    if (!leaveTrendData[key]) leaveTrendData[key] = { date: key };
    leaveTrendData[key][d.leave_type] = (leaveTrendData[key][d.leave_type] || 0) + d.leave_count;
    leaveTrendData[key].total = (leaveTrendData[key].total || 0) + d.leave_count;
  });
  const leaveTrendArr = Object.values(leaveTrendData);

  // Role pie
  const rolePieData = Object.entries(users).map(([role, count]) => ({ name: role, value: count }));

  // Machine type pie
  const machinePieData = machinesByType.map(m => ({ name: m.machine_type, value: m.count }));

  return (
    <>
      {/* Summary cards */}
      <div className={styles.statsGrid}>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--accent)'}}>{totals.totalLines}</div>
          <div className="stat-label">Production lines</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totals.totalMachines}</div>
          <div className="stat-label">Active machines</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--teal-400)'}}>{totals.totalOperators}</div>
          <div className="stat-label">Total operators</div>
          <div className="stat-sub">{totals.totalAssigned} assigned today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--danger)'}}>{totals.totalLeaves}</div>
          <div className="stat-label">On leave today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color: totals.totalLoadGap > 0 ? 'var(--warning)' : 'var(--success)'}}>
            {totals.totalLoadGap}
          </div>
          <div className="stat-label">Total load gap</div>
          <div className="stat-sub">{totals.totalLoadGap > 0 ? 'Unfilled positions' : 'Fully staffed'}</div>
        </div>
      </div>

      {/* Line-by-line table */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Production line overview</h3>
        <div className={styles.opTable}>
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th>Status</th>
                <th>Engineer</th>
                <th>Machines</th>
                <th>Operators</th>
                <th>Assigned</th>
                <th>On Leave</th>
                <th>Load</th>
                <th>Capacity</th>
                <th>Load Gap</th>
                <th>Overloads</th>
                <th>Transfers</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.lineCode}>
                  <td><strong>{l.lineCode}</strong><br/><span className="text-muted" style={{fontSize:'0.75rem'}}>{l.lineName}</span></td>
                  <td><span className={`badge badge-${l.status === 'active' ? 'success' : 'warning'}`}>{l.status}</span></td>
                  <td>{l.engineerName || '-'}</td>
                  <td>{l.machines}</td>
                  <td>{l.totalOperators}</td>
                  <td><strong>{l.assignedOperators}</strong></td>
                  <td style={{color: l.leavesToday > 0 ? '#dc2626' : 'inherit'}}>{l.leavesToday}</td>
                  <td>{l.totalLoad}</td>
                  <td>{l.totalMachineCapacity}</td>
                  <td>
                    <span className={l.loadGap > 0 ? styles.loadHigh : styles.loadNormal}>
                      {l.loadGap > 0 ? `${l.loadGap} unfilled` : 'OK'}
                    </span>
                  </td>
                  <td style={{color: l.overloadCount > 0 ? '#dc2626' : 'inherit'}}>{l.overloadCount}</td>
                  <td>{l.transferCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts row 1: Operators by line + Load by line */}
      <div className={styles.chartRow}>
        <div className={styles.chartCard}>
          <h3 className={styles.sectionTitle}>Operators by line</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={lineChartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{fontSize: 12}} />
              <Bar dataKey="Total Operators" fill="#2563eb" radius={[4,4,0,0]} />
              <Bar dataKey="Assigned" fill="#059669" radius={[4,4,0,0]} />
              <Bar dataKey="On Leave" fill="#dc2626" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className={styles.chartCard}>
          <h3 className={styles.sectionTitle}>Load vs capacity by line</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={loadChartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{fontSize: 12}} />
              <Bar dataKey="Total Load" fill="#d97706" radius={[4,4,0,0]} />
              <Bar dataKey="Capacity" fill="#2563eb" radius={[4,4,0,0]} />
              <Bar dataKey="Load Gap" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2: Weekly trend + Leave trend */}
      <div className={styles.chartRow}>
        <div className={styles.chartCard}>
          <h3 className={styles.sectionTitle}>Weekly assignment trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{fontSize: 12}} />
              <Area type="monotone" dataKey="Operators" stroke="#2563eb" fill="#dbeafe" strokeWidth={2} />
              <Area type="monotone" dataKey="Assignments" stroke="#059669" fill="#dcfce7" strokeWidth={2} />
              <Line type="monotone" dataKey="Avg Load" stroke="#d97706" strokeWidth={2} dot={{r: 3}} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className={styles.chartCard}>
          <h3 className={styles.sectionTitle}>Leave trend (this week)</h3>
          {leaveTrendArr.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={leaveTrendArr}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{fontSize: 12}} />
                <Bar dataKey="sick" fill="#dc2626" stackId="a" radius={[0,0,0,0]} />
                <Bar dataKey="vacation" fill="#2563eb" stackId="a" radius={[0,0,0,0]} />
                <Bar dataKey="emergency" fill="#d97706" stackId="a" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.emptyCard}>No leaves this week.</div>
          )}
        </div>
      </div>

      {/* Charts row 3: Pie charts */}
      <div className={styles.chartRow}>
        <div className={styles.chartCard}>
          <h3 className={styles.sectionTitle}>Users by role</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={rolePieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({name, value}) => `${name}: ${value}`} labelLine={true}>
                {rolePieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className={styles.chartCard}>
          <h3 className={styles.sectionTitle}>Machines by type</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={machinePieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({name, value}) => `${name}: ${value}`} labelLine={true}>
                {machinePieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Today's plan status */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Today's plan status</h3>
        {planStatus.length > 0 ? (
          <div className={styles.planGrid}>
            {planStatus.map((p, i) => (
              <div key={i} className={styles.planCard}>
                <div className={styles.planLine}>{p.line}</div>
                <div className={styles.planShift}>{p.shift}</div>
                <span className={`badge badge-${p.status === 'approved' || p.status === 'engineer_approved' ? 'success' : p.status === 'submitted' ? 'info' : p.status === 'rejected' ? 'danger' : 'secondary'}`}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyCard}>No plans created for today yet.</div>
        )}
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Self-service leave state (for technicians)
  const [techLeaves, setTechLeaves] = useState([]);
  const [showTechLeaveForm, setShowTechLeaveForm] = useState(false);
  const [techLeaveDate, setTechLeaveDate] = useState('');
  const [techLeaveType, setTechLeaveType] = useState('sick');
  const [techLeaveShift, setTechLeaveShift] = useState('both');
  const [techLeaveReason, setTechLeaveReason] = useState('');
  const [techLeaveLoading, setTechLeaveLoading] = useState(false);

  useEffect(() => {
    dashboardApi.getStats()
      .then(res => setStats(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
    if (user?.role === 'technician') loadTechLeaves();
  }, []);

  const loadTechLeaves = () => {
    leaveApi.getMyLeaves()
      .then(res => setTechLeaves(res.data))
      .catch(() => {});
  };

  const handleTechSubmitLeave = async () => {
    if (!techLeaveDate) return;
    setTechLeaveLoading(true);
    try {
      await leaveApi.createOrUpdate({
        operatorId: user.id,
        leaveDate: techLeaveDate,
        leaveType: techLeaveType,
        shift: techLeaveShift,
        reason: techLeaveReason,
      });
      setShowTechLeaveForm(false);
      setTechLeaveDate('');
      setTechLeaveType('sick');
      setTechLeaveShift('both');
      setTechLeaveReason('');
      loadTechLeaves();
    } catch {
      alert('Failed to submit leave request');
    } finally {
      setTechLeaveLoading(false);
    }
  };

  const handleTechDeleteLeave = async (leaveId) => {
    if (!window.confirm('Cancel this leave request?')) return;
    try {
      await leaveApi.deleteLeave(leaveId);
      loadTechLeaves();
    } catch {
      alert('Failed to cancel leave');
    }
  };

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
      ) : user?.role === 'admin' ? (
        <AdminDashboard />
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

          {user?.role === 'technician' && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>My leave</h3>
                <button className="btn btn-sm btn-primary" onClick={() => setShowTechLeaveForm(v => !v)}>
                  {showTechLeaveForm ? 'Cancel' : '+ Request leave'}
                </button>
              </div>
              {showTechLeaveForm && (
                <div className={styles.leaveForm}>
                  <div className={styles.formRow}>
                    <label>Date</label>
                    <input type="date" value={techLeaveDate} onChange={e => setTechLeaveDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]} />
                  </div>
                  <div className={styles.formRow}>
                    <label>Type</label>
                    <select value={techLeaveType} onChange={e => setTechLeaveType(e.target.value)}>
                      <option value="sick">Sick</option>
                      <option value="vacation">Vacation</option>
                      <option value="emergency">Emergency</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className={styles.formRow}>
                    <label>Shift</label>
                    <select value={techLeaveShift} onChange={e => setTechLeaveShift(e.target.value)}>
                      <option value="both">Both (full day)</option>
                      <option value="day">Day only</option>
                      <option value="night">Night only</option>
                    </select>
                  </div>
                  <div className={styles.formRow}>
                    <label>Reason</label>
                    <input type="text" value={techLeaveReason} onChange={e => setTechLeaveReason(e.target.value)}
                      placeholder="Optional reason..." />
                  </div>
                  <button className="btn btn-primary" onClick={handleTechSubmitLeave} disabled={techLeaveLoading || !techLeaveDate}>
                    {techLeaveLoading ? 'Submitting...' : 'Submit leave request'}
                  </button>
                </div>
              )}
              {techLeaves.length > 0 ? (
                <div className={styles.opTable}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Shift</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {techLeaves.map(l => (
                        <tr key={l.id}>
                          <td>{new Date(l.leave_date).toLocaleDateString('en-GB')}</td>
                          <td>{l.leave_type}</td>
                          <td>{l.shift}</td>
                          <td>{l.reason || '-'}</td>
                          <td>
                            <span className={`badge badge-${l.approval_status === 'approved' ? 'success' : l.approval_status === 'rejected' ? 'danger' : 'warning'}`}>
                              {l.approval_status}
                            </span>
                          </td>
                          <td>
                            {l.approval_status === 'pending' && (
                              <button className="btn btn-sm btn-danger" onClick={() => handleTechDeleteLeave(l.id)}>✗</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyCard}>No leave records.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
