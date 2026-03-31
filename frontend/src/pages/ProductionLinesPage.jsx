import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { productionLinesApi, usersApi } from '../api/services';
import useAuthStore from '../store/authStore';
import styles from './ProductionLinesPage.module.css';

export default function ProductionLinesPage() {
  const { user, isAdmin } = useAuthStore();
  const [lines, setLines] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLineId, setEditingLineId] = useState(null);
  const [editData, setEditData] = useState({});

  // Admin-only access
  useEffect(() => {
    if (!isAdmin) {
      toast.error('Admin access required');
      // Redirect will be handled by PrivateRoute in App.jsx
    }
  }, [isAdmin]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [linesRes, engRes] = await Promise.all([
        productionLinesApi.getAll(),
        usersApi.getAll({ role: 'engineer' }),
      ]);
      setLines(linesRes.data);
      setEngineers(engRes.data);
    } catch (err) {
      toast.error('Failed to load production lines');
    } finally {
      setLoading(false);
    }
  };

  const handleEditStart = (line) => {
    setEditingLineId(line.id);
    setEditData({
      line_name: line.line_name,
      location: line.location || '',
      capacity: line.capacity || 5,
      status: line.status,
      assigned_engineer_id: line.assigned_engineer_id || null,
    });
  };

  const handleEditCancel = () => {
    setEditingLineId(null);
    setEditData({});
  };

  const handleSave = async (lineId) => {
    try {
      await productionLinesApi.update(lineId, editData);
      toast.success('Production line updated');
      loadData();
      handleEditCancel();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update line');
    }
  };

  return (
    <div className="page-enter">
      <div className={styles.header}>
        <div>
          <h1>Production Lines</h1>
          <p className="text-muted" style={{marginTop:4}}>
            Manage production lines and assign engineers
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{textAlign: 'center', padding: '2rem'}}>
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <div className={styles.container}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Line Code</th>
                <th>Line Name</th>
                <th>Location</th>
                <th>Capacity</th>
                <th>Assigned Engineer</th>
                <th>Status</th>
                <th>Machines</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className={styles.code}>{line.line_code}</td>
                  <td>
                    {editingLineId === line.id ? (
                      <input
                        type="text"
                        className="form-input"
                        value={editData.line_name}
                        onChange={e => setEditData({...editData, line_name: e.target.value})}
                        style={{width: '100%'}}
                      />
                    ) : (
                      line.line_name
                    )}
                  </td>
                  <td>
                    {editingLineId === line.id ? (
                      <input
                        type="text"
                        className="form-input"
                        value={editData.location}
                        onChange={e => setEditData({...editData, location: e.target.value})}
                        style={{width: '100%'}}
                      />
                    ) : (
                      line.location || '—'
                    )}
                  </td>
                  <td>
                    {editingLineId === line.id ? (
                      <input
                        type="number"
                        className="form-input"
                        value={editData.capacity}
                        onChange={e => setEditData({...editData, capacity: parseInt(e.target.value)})}
                        style={{width: '80px'}}
                      />
                    ) : (
                      line.capacity
                    )}
                  </td>
                  <td>
                    {editingLineId === line.id ? (
                      <select
                        className="form-select"
                        value={editData.assigned_engineer_id || ''}
                        onChange={e => setEditData({...editData, assigned_engineer_id: e.target.value || null})}
                        style={{width: '100%'}}
                      >
                        <option value="">Unassigned</option>
                        {engineers.map(eng => (
                          <option key={eng.id} value={eng.id}>{eng.name} ({eng.emp_no})</option>
                        ))}
                      </select>
                    ) : (
                      <div className={styles.engineerInfo}>
                        {line.engineer_name ? (
                          <>
                            <div className={styles.engineerName}>{line.engineer_name}</div>
                            <div className={styles.engineerEmpNo}>{line.engineer_emp_no}</div>
                          </>
                        ) : (
                          <span className={styles.unassigned}>Unassigned</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    {editingLineId === line.id ? (
                      <select
                        className="form-select"
                        value={editData.status}
                        onChange={e => setEditData({...editData, status: e.target.value})}
                        style={{width: '100%'}}
                      >
                        <option>active</option>
                        <option>maintenance</option>
                        <option>inactive</option>
                      </select>
                    ) : (
                      <span className={`badge badge-${line.status === 'active' ? 'success' : 'warning'}`}>
                        {line.status}
                      </span>
                    )}
                  </td>
                  <td className={styles.center}>{line.machine_count}</td>
                  <td className={styles.actions}>
                    {editingLineId === line.id ? (
                      <>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleSave(line.id)}
                        >
                          Save
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={handleEditCancel}
                        >
                          Cancel
                        </button>
                      </>
                    ) : isAdmin ? (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleEditStart(line)}
                        title="Edit production line"
                      >
                        Edit
                      </button>
                    ) : (
                      <span className="text-muted" style={{fontSize: '0.85rem'}}>View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
