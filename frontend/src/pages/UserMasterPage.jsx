import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { capabilitiesApi, machineTypesApi } from '../api/services';
import styles from './UserMasterPage.module.css';

function initials(name) {
  return name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
}

export default function UserMasterPage() {
  const [capabilities, setCapabilities] = useState([]);
  const [machineTypes, setMachineTypes] = useState([]);
  const [filterLine, setFilterLine] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // { opId, typeId }
  const [auditLog, setAuditLog] = useState([]);

  useEffect(() => {
    loadData();
  }, [filterLine]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [capsRes, typesRes] = await Promise.all([
        capabilitiesApi.getAll(filterLine !== 'all' ? { line: filterLine } : {}),
        machineTypesApi.getAll(),
      ]);
      setCapabilities(capsRes.data);
      setMachineTypes(typesRes.data);
    } catch {
      toast.error('Failed to load capability data');
    } finally {
      setLoading(false);
    }
  };

  // Build operator list and capability map
  const operators = [];
  const capMap = {}; // capMap[opId][typeId] = { isCapable, grantedAt }

  capabilities.forEach(row => {
    if (!capMap[row.id]) {
      operators.push({
        id: row.id,
        name: row.name,
        empNo: row.emp_no,
        role: row.role,
        line: row.dedicated_line,
      });
      capMap[row.id] = {};
    }
    capMap[row.id][row.type_id] = {
      isCapable: row.is_capable,
      grantedAt: row.granted_at,
      trainingRef: row.training_ref,
    };
  });

  const uniqueOps = operators.filter(
    (op, idx, arr) => arr.findIndex(o => o.id === op.id) === idx
  );

  const handleToggle = async (op, type) => {
    const current = capMap[op.id]?.[type.id]?.isCapable || false;
    const key = `${op.id}-${type.id}`;
    setSaving(key);
    try {
      if (current) {
        await capabilitiesApi.revoke(op.id, type.id);
        toast.success(`${type.name} removed from ${op.name}`);
        setAuditLog(prev => [{
          id: Date.now(),
          text: `${op.name} — ${type.name} revoked`,
          color: 'var(--red-400)',
          time: new Date(),
        }, ...prev].slice(0, 10));
      } else {
        await capabilitiesApi.grant(op.id, type.id, {});
        toast.success(`${type.name} granted to ${op.name}`);
        setAuditLog(prev => [{
          id: Date.now(),
          text: `${op.name} — ${type.name} granted`,
          color: 'var(--success)',
          time: new Date(),
        }, ...prev].slice(0, 10));
      }
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update capability');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="page-enter">
      <div className={styles.header}>
        <div>
          <h1>User Master</h1>
          <p className="text-muted" style={{ marginTop: 4 }}>
            Manage operator machine certifications. Click a cell to grant or revoke after training.
          </p>
        </div>
        <div className={styles.filters}>
          <select
            className="form-select"
            style={{ width: 'auto' }}
            value={filterLine}
            onChange={e => setFilterLine(e.target.value)}
          >
            <option value="all">All lines</option>
            <option value="L1">Line 1</option>
            <option value="L2">Line 2</option>
            <option value="L3">Line 3</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className={styles.loadWrap}><div className="spinner spinner-lg" /></div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.matrixWrap}>
            <div className="card">
              <div className="table-wrap" style={{ border: 'none' }}>
                <table className={styles.matrix}>
                  <thead>
                    <tr>
                      <th className={styles.stickyCol}>Operator</th>
                      <th>Line</th>
                      {machineTypes.map(mt => (
                        <th key={mt.id} className={`${styles.typeCol} ${!mt.is_system ? styles.customCol : ''}`}>
                          <span className={styles.typeLabel}>{mt.name}</span>
                          {!mt.is_system && (
                            <span className={styles.customBadge}>custom</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uniqueOps.map(op => (
                      <tr key={op.id}>
                        <td className={styles.stickyCol}>
                          <div className={styles.opCell}>
                            <div className={`avatar avatar-sm ${op.role === 'technician' ? 'av-technician' : 'av-operator'}`}>
                              {initials(op.name)}
                            </div>
                            <div>
                              <div className={styles.opName}>{op.name}</div>
                              <div className={styles.opEmp}>{op.empNo}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={styles.lineTag}>{op.line}</span>
                        </td>
                        {machineTypes.map(mt => {
                          const isTech = op.role === 'technician';
                          const capData = capMap[op.id]?.[mt.id];
                          const isCap = isTech || capData?.isCapable || false;
                          const key = `${op.id}-${mt.id}`;
                          const isSaving = saving === key;

                          return (
                            <td key={mt.id} className={`${styles.capCell} ${!mt.is_system ? styles.customColCell : ''}`}>
                              {isTech ? (
                                <button className={`${styles.capBtn} ${styles.capAuto}`} disabled title="Technicians are certified for all types">
                                  ✓
                                </button>
                              ) : (
                                <button
                                  className={`${styles.capBtn} ${isCap ? styles.capYes : styles.capNo}`}
                                  onClick={() => handleToggle(op, mt)}
                                  disabled={isSaving}
                                  title={isCap
                                    ? `Certified${capData?.grantedAt ? ' · ' + new Date(capData.grantedAt).toLocaleDateString() : ''}\nClick to revoke`
                                    : 'Not certified · Click to grant after training'}
                                >
                                  {isSaving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : isCap ? '✓' : '+'}
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {uniqueOps.length === 0 && (
                      <tr>
                        <td colSpan={machineTypes.length + 2} className={styles.empty}>
                          No operators found for the selected filter
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className={styles.sidebar}>
            <div className="card">
              <h4 style={{ marginBottom: 10 }}>Legend</h4>
              <div className={styles.legend}>
                <div className={styles.legendItem}>
                  <span className={`${styles.capBtn} ${styles.capYes}`} style={{ display: 'inline-flex', width: 26, height: 26, pointerEvents: 'none' }}>✓</span>
                  <span>Certified — can be assigned</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={`${styles.capBtn} ${styles.capNo}`} style={{ display: 'inline-flex', width: 26, height: 26, pointerEvents: 'none' }}>+</span>
                  <span>Not certified — click to grant after training</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={`${styles.capBtn} ${styles.capAuto}`} style={{ display: 'inline-flex', width: 26, height: 26, pointerEvents: 'none' }}>✓</span>
                  <span>Auto-certified (technicians)</span>
                </div>
              </div>
            </div>

            {auditLog.length > 0 && (
              <div className="card" style={{ marginTop: 12 }}>
                <h4 style={{ marginBottom: 10 }}>Recent changes</h4>
                <div className={styles.auditList}>
                  {auditLog.map(entry => (
                    <div key={entry.id} className={styles.auditRow}>
                      <div className={styles.auditDot} style={{ background: entry.color }} />
                      <span className={styles.auditText}>{entry.text}</span>
                      <span className={styles.auditTime}>
                        {entry.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
