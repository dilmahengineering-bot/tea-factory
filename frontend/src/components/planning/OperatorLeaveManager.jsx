import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { leaveApi } from '../../api/services';
import styles from './OperatorLeaveManager.module.css';

/**
 * OperatorLeaveManager Component
 * Allows technicians to mark operators as on leave
 */
export default function OperatorLeaveManager({ currentLine, planDate, shift, teamMembers = [] }) {
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState(null);
  const [leaveType, setLeaveType] = useState('sick');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [operatorLeaves, setOperatorLeaves] = useState({});

  // Load leaves for all team members on current date
  const loadOperatorLeaves = async () => {
    if (!planDate) return;
    
    try {
      for (const op of teamMembers.filter(t => t.role === 'operator')) {
        const leaves = await leaveApi.getOperatorLeaves(op.id, {
          fromDate: planDate,
          toDate: planDate,
          approval_status: 'approved'
        });
        
        if (leaves.data && leaves.data.length > 0) {
          setOperatorLeaves(prev => ({
            ...prev,
            [op.id]: leaves.data[0]
          }));
        }
      }
    } catch (err) {
      console.error('Error loading leaves:', err);
    }
  };

  useEffect(() => {
    loadOperatorLeaves();
  }, [currentLine, planDate, teamMembers]);

  const handleAddLeave = () => {
    setShowLeaveForm(true);
    setSelectedOperator(null);
  };

  const handleSubmitLeave = async () => {
    if (!selectedOperator || !leaveType) {
      toast.error('Please select operator and leave type');
      return;
    }

    setLoading(true);
    try {
      await leaveApi.createOrUpdate({
        operatorId: selectedOperator,
        leaveDate: planDate,
        leaveType: leaveType,
        shift: shift || 'both',
        reason: reason
      });

      toast.success('Leave marked successfully');
      setShowLeaveForm(false);
      setSelectedOperator(null);
      setLeaveType('sick');
      setReason('');
      loadOperatorLeaves();
    } catch (err) {
      console.error('Error marking leave:', err);
      toast.error(err.response?.data?.error || 'Failed to mark leave');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLeave = async (leaveId) => {
    if (!window.confirm('Remove this leave record?')) return;

    try {
      await leaveApi.deleteLeave(leaveId);
      toast.success('Leave removed');
      loadOperatorLeaves();
    } catch (err) {
      console.error('Error removing leave:', err);
      toast.error('Failed to remove leave');
    }
  };

  // Get local operators only
  const localOperators = teamMembers.filter(op => 
    op.role === 'operator' && op.dedicated_line === currentLine
  );

  const operatorsOnLeave = localOperators.filter(op => operatorLeaves[op.id]);
  const operatorsAvailable = localOperators.filter(op => !operatorLeaves[op.id]);

  const leaveTypeOptions = [
    { value: 'sick', label: '🤒 Sick Leave' },
    { value: 'vacation', label: '🏖️ Vacation' },
    { value: 'emergency', label: '🚨 Emergency' },
    { value: 'other', label: '📝 Other' }
  ];

  return (
    <div className={styles.leaveContainer}>
      <div className={styles.header}>
        <h4>Operator Leave Management</h4>
        <p className="text-muted">Mark operators as on leave for this shift</p>
      </div>

      {operatorsOnLeave.length > 0 && (
        <div className={styles.onLeaveSection}>
          <div className={styles.sectionTitle}>
            On Leave ({operatorsOnLeave.length})
          </div>
          {operatorsOnLeave.map(op => {
            const leave = operatorLeaves[op.id];
            return (
              <div key={op.id} className={styles.leaveItem}>
                <div className={styles.opInfo}>
                  <span className={styles.name}>{op.name}</span>
                  <span className={styles.type}>{leave.leave_type}</span>
                </div>
                {leave.reason && (
                  <div className={styles.reason}>{leave.reason}</div>
                )}
                <button
                  className={styles.removeBtn}
                  onClick={() => handleRemoveLeave(leave.id)}
                  title="Remove leave"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {operatorsAvailable.length > 0 && !showLeaveForm && (
        <button
          className="btn btn-warning btn-sm"
          onClick={handleAddLeave}
          style={{ width: '100%', marginTop: operatorsOnLeave.length > 0 ? '1rem' : 0 }}
        >
          + Mark as On Leave
        </button>
      )}

      {showLeaveForm && (
        <div className={styles.leaveForm}>
          <div className={styles.formGroup}>
            <label>Select Operator</label>
            <select
              className="form-select"
              value={selectedOperator || ''}
              onChange={e => setSelectedOperator(e.target.value)}
            >
              <option value="">-- Choose operator --</option>
              {operatorsAvailable.map(op => (
                <option key={op.id} value={op.id}>
                  {op.name} ({op.emp_no})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Leave Type</label>
            <select
              className="form-select"
              value={leaveType}
              onChange={e => setLeaveType(e.target.value)}
            >
              {leaveTypeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Reason (Optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="Brief reason..."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>

          <div className={styles.actions}>
            <button
              className="btn btn-success"
              onClick={handleSubmitLeave}
              disabled={loading || !selectedOperator}
            >
              {loading ? 'Saving...' : 'Mark Leave'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowLeaveForm(false);
                setSelectedOperator(null);
                setReason('');
              }}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {operatorsAvailable.length === 0 && operatorsOnLeave.length === 0 && (
        <div className={styles.empty}>
          No local operators available
        </div>
      )}
    </div>
  );
}
