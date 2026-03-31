import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { poolApi } from '../../api/services';
import styles from './OperatorPool.module.css';

/**
 * OperatorPool Component
 * Shows operators from other production lines that have been offered to the common pool
 * Only displays operators explicitly offered by their home line technician
 * Displays their current workload to help allocation decisions
 */
export default function OperatorPool({ currentLine, onOperatorSelect, excludedOperators = [], planDate, shift, reloadTrigger = 0, allocatedOperators = [] }) {
  const [poolOperators, setPoolOperators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState(null);

  // Load operators available in common pool for this date/shift
  const loadPoolOperators = async () => {
    if (!planDate || !shift) return;
    
    setLoading(true);
    try {
      const res = await poolApi.getPoolOperators({ allocationDate: planDate, shift });
      const allPoolOps = res.data || [];
      
      // Filter to exclude:
      // 1. Operators already assigned to this plan
      // 2. Operators already allocated to team (cross-line transfers that are now in assignments)
      const availableOps = allPoolOps.filter(op => {
        return !excludedOperators.includes(op.operator_id) &&
               !allocatedOperators.includes(op.operator_id);
      });

      setPoolOperators(availableOps);
    } catch (err) {
      console.error('Error loading pool operators:', err);
      toast.error('Failed to load operator pool');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPoolOperators();
  }, [currentLine, excludedOperators, planDate, shift, reloadTrigger, allocatedOperators]);

  const handleSelectOperator = (operator) => {
    setSelectedOperator(operator);
  };

  const handleAllocate = () => {
    if (!selectedOperator) {
      toast.error('Please select an operator');
      return;
    }
    
    // Notify parent component of selection with transfer flag
    onOperatorSelect({
      id: selectedOperator.operator_id,
      emp_no: selectedOperator.emp_no,
      name: selectedOperator.name,
      role: selectedOperator.role || 'operator',
      dedicated_line: selectedOperator.dedicated_line,
      is_transfer: true,
      transfer_from_line: selectedOperator.dedicated_line,
      pool_id: selectedOperator.pool_id,
      capabilities: selectedOperator.capabilities || [],
      home_load: parseFloat(selectedOperator.current_load) || 0,
    });

    toast.success(`${selectedOperator.name} allocated from ${selectedOperator.dedicated_line}`);
    setSelectedOperator(null);
  };

  const groupedByLine = poolOperators.reduce((acc, op) => {
    const line = op.dedicated_line;
    if (!acc[line]) acc[line] = [];
    acc[line].push(op);
    return acc;
  }, {});

  const lines = Object.keys(groupedByLine).sort();

  const getLoadStatus = (load) => {
    if (load > 1.0) return { label: 'OVERLOADED', className: 'overloaded' };
    if (load > 0.7) return { label: 'BUSY', className: 'busy' };
    if (load > 0.3) return { label: 'AVAILABLE', className: 'available' };
    return { label: 'SPARE', className: 'spare' };
  };

  return (
    <div className={styles.poolContainer}>
      <div className={styles.header}>
        <h4>Common Operator Pool</h4>
        <p className="text-muted">Operators offered by other lines</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <div className="spinner spinner-sm" />
        </div>
      ) : poolOperators.length === 0 ? (
        <div className={styles.empty}>
          No operators in common pool for this shift
        </div>
      ) : (
        <>
          {lines.map(line => (
            <div key={line} className={styles.lineGroup}>
              <div className={styles.lineLabel}>
                {line} <span className={styles.count}>({groupedByLine[line].length})</span>
              </div>
              <div className={styles.operatorList}>
                {groupedByLine[line].map(op => {
                  const loadStatus = getLoadStatus(parseFloat(op.current_load) || 0);
                  return (
                    <button
                      key={op.pool_id}
                      className={`${styles.operatorItem} ${selectedOperator?.pool_id === op.pool_id ? styles.selected : ''}`}
                      onClick={() => handleSelectOperator(op)}
                    >
                      <div className={styles.opName}>{op.name}</div>
                      <div className={styles.opNo}>{op.emp_no}</div>
                      <span className={`${styles.loadBadge} ${styles[loadStatus.className]}`}>
                        {(parseFloat(op.current_load) || 0).toFixed(1)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {selectedOperator && (
            <button
              className="btn btn-primary"
              onClick={handleAllocate}
              style={{ width: '100%', marginTop: '0.75rem' }}
            >
              Allocate {selectedOperator.name}
            </button>
          )}
        </>
      )}
    </div>
  );
}

