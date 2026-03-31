import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { schedulingApi, usersApi } from '../api/services';
import useAuthStore from '../store/authStore';
import styles from './OperatorTransfersPage.module.css';

export default function OperatorTransfersPage() {
  const { isAdmin } = useAuthStore();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterLine, setFilterLine] = useState('');

  useEffect(() => {
    loadTransfers();
  }, []);

  const loadTransfers = async () => {
    setLoading(true);
    try {
      // Fetch all plans with their assignments to find transfers
      const res = await schedulingApi.getPlans({ include_transfers: true });
      // Filter assignments that have is_transfer = true
      const allTransfers = [];
      
      if (res.data && Array.isArray(res.data)) {
        res.data.forEach(plan => {
          if (plan.assignments) {
            plan.assignments
              .filter(a => a.is_transfer)
              .forEach(transfer => {
                allTransfers.push({
                  ...transfer,
                  plan_id: plan.id,
                  plan_date: plan.plan_date,
                  shift: plan.shift,
                  line: plan.line,
                });
              });
          }
        });
      }

      // Load operator names
      const opsRes = await usersApi.getAll({ role: 'operator' });
      const opMap = {};
      opsRes.data.forEach(op => {
        opMap[op.id] = op;
      });

      // Enrich transfers with operator info
      const enriched = allTransfers.map(t => ({
        ...t,
        operator_name: opMap[t.operator_id]?.name || 'Unknown',
        operator_emp_no: opMap[t.operator_id]?.emp_no || '',
      }));

      setTransfers(enriched);
    } catch (err) {
      console.error('Failed to load transfers:', err);
      toast.error('Failed to load operator transfers');
    } finally {
      setLoading(false);
    }
  };

  const handleReturnOperator = async (transfer) => {
    try {
      // Remove assignment (return operator)
      await schedulingApi.removeAssignment(transfer.plan_id, transfer.id);
      toast.success(`${transfer.operator_name} returned to ${transfer.transfer_from_line}`);
      await loadTransfers();
    } catch (err) {
      toast.error('Failed to return operator');
    }
  };

  const filteredTransfers = filterLine 
    ? transfers.filter(t => t.line === filterLine || t.transfer_from_line === filterLine)
    : transfers;

  const linesInUse = [...new Set(transfers.map(t => t.line))].sort();

  return (
    <div className="page-enter">
      <div className={styles.header}>
        <div>
          <h1>Operator Transfers</h1>
          <p className="text-muted" style={{marginTop:4}}>
            Manage operators allocated from other production lines
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{textAlign: 'center', padding: '2rem'}}>
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <>
          <div className={styles.filters}>
            <div className="form-group">
              <label className="form-label">Filter by line</label>
              <select 
                className="form-select"
                value={filterLine}
                onChange={e => setFilterLine(e.target.value)}
              >
                <option value="">All lines</option>
                {linesInUse.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {filteredTransfers.length === 0 ? (
            <div className={styles.empty}>
              <p>No operator transfers</p>
            </div>
          ) : (
            <div className={styles.container}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Operator</th>
                    <th>From Line</th>
                    <th>To Line</th>
                    <th>Date</th>
                    <th>Shift</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransfers.map((transfer) => (
                    <tr key={`${transfer.plan_id}-${transfer.id}`}>
                      <td>
                        <div className={styles.operator}>
                          <div className={styles.opName}>{transfer.operator_name}</div>
                          <div className={styles.opNo}>{transfer.operator_emp_no}</div>
                        </div>
                      </td>
                      <td><span className="badge badge-info">{transfer.transfer_from_line}</span></td>
                      <td><span className="badge badge-success">{transfer.line}</span></td>
                      <td>{new Date(transfer.plan_date).toLocaleDateString()}</td>
                      <td className={styles.shift}>{transfer.shift}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleReturnOperator(transfer)}
                        >
                          Return
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
