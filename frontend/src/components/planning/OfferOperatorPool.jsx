import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { poolApi } from '../../api/services';
import styles from './OfferOperatorPool.module.css';

/**
 * OfferOperatorPool Component
 * Allows technicians to offer their spare operators to the common pool
 * Shows current load to help determine who has spare capacity
 */
export default function OfferOperatorPool({ currentLine, planDate, shift, planId, teamMembers = [] }) {
  const [selectedOperators, setSelectedOperators] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [operators, setOperators] = useState([]);
  const [offeredOperators, setOfferedOperators] = useState([]);

  // Load operators with their current load
  const loadOperatorsWithLoad = async () => {
    if (!planDate || !shift) return;
    setLoading(true);
    try {
      const res = await poolApi.getLineOperators({ allocationDate: planDate, shift });
      setOperators(res.data || []);
    } catch (err) {
      console.error('Error loading operators with load:', err);
      toast.error('Failed to load operators');
    } finally {
      setLoading(false);
    }
  };

  // Load already offered operators for this shift
  const loadOfferedOperators = async () => {
    if (!planDate || !shift) return;
    try {
      const res = await poolApi.getPoolOperators({ allocationDate: planDate, shift });
      const offered = res.data.filter(op => op.dedicated_line === currentLine);
      setOfferedOperators(offered);
    } catch (err) {
      console.error('Error loading offered operators:', err);
    }
  };

  useEffect(() => {
    loadOperatorsWithLoad();
    loadOfferedOperators();
  }, [currentLine, planDate, shift]);

  const handleSelectOperator = (opId) => {
    const newSet = new Set(selectedOperators);
    if (newSet.has(opId)) {
      newSet.delete(opId);
    } else {
      newSet.add(opId);
    }
    setSelectedOperators(newSet);
  };

  const handleOfferOperators = async () => {
    if (selectedOperators.size === 0) {
      toast.error('Please select operators to offer');
      return;
    }

    setLoading(true);
    try {
      for (const opId of selectedOperators) {
        await poolApi.offerOperator({
          operatorId: opId,
          planId: planId,
          allocationDate: planDate,
          shift: shift,
        });
      }

      toast.success(`Offered ${selectedOperators.size} operator(s) to pool`);
      setSelectedOperators(new Set());
      loadOperatorsWithLoad();
      loadOfferedOperators();
    } catch (err) {
      console.error('Error offering operators:', err);
      toast.error(err.response?.data?.error || 'Failed to offer operators');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeOffer = async (poolId) => {
    try {
      await poolApi.removeFromPool(poolId);
      toast.success('Operator removed from pool');
      loadOperatorsWithLoad();
      loadOfferedOperators();
    } catch (err) {
      console.error('Error revoking offer:', err);
      toast.error('Failed to revoke offer');
    }
  };

  // Get local operators from API response
  const localOperators = operators.filter(op => op.dedicated_line === currentLine);

  const areOffered = localOperators.filter(op => op.in_pool);
  const notOffered = localOperators.filter(op => !op.in_pool);

  const getLoadStatus = (load) => {
    if (load > 1.0) return { label: 'OVERLOADED', className: 'overloaded' };
    if (load > 0.7) return { label: 'BUSY', className: 'busy' };
    if (load > 0.3) return { label: 'AVAILABLE', className: 'available' };
    return { label: 'SPARE', className: 'spare' };
  };

  return (
    <div className={styles.offerContainer}>
      <div className={styles.header}>
        <h4>Offer to Common Pool</h4>
        <p className="text-muted">Make spare operators available to other lines</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '0.75rem' }}>
          <div className="spinner spinner-sm" />
        </div>
      ) : notOffered.length === 0 ? (
        <div className={styles.empty}>
          All operators are offered or in use
        </div>
      ) : (
        <>
          <div className={styles.operatorList}>
            {notOffered.map(op => {
              const loadStatus = getLoadStatus(parseFloat(op.current_load) || 0);
              return (
                <label key={op.operator_id} className={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    checked={selectedOperators.has(op.operator_id)}
                    onChange={() => handleSelectOperator(op.operator_id)}
                    disabled={loading}
                  />
                  <span className={styles.opName}>{op.name}</span>
                  <span className={styles.opNo}>{op.emp_no}</span>
                  <span className={`${styles.loadBadge} ${styles[loadStatus.className]}`}>
                    {(parseFloat(op.current_load) || 0).toFixed(1)} - {loadStatus.label}
                  </span>
                </label>
              );
            })}
          </div>

          {selectedOperators.size > 0 && (
            <button
              className="btn btn-success"
              onClick={handleOfferOperators}
              disabled={loading}
              style={{ width: '100%', marginTop: '0.75rem' }}
            >
              {loading ? 'Offering...' : `Offer ${selectedOperators.size} operator(s)`}
            </button>
          )}
        </>
      )}

      {areOffered.length > 0 && (
        <div className={styles.offeredSection}>
          <div className={styles.offeredTitle}>Currently Offered</div>
          {areOffered.map(op => {
            const loadStatus = getLoadStatus(parseFloat(op.current_load) || 0);
            const poolEntry = offeredOperators.find(o => o.operator_id === op.operator_id && !o.is_allocated);
            return (
              <div key={op.operator_id} className={styles.offeredItem}>
                <span>{op.name} - <span className={`${styles.loadBadge} ${styles[loadStatus.className]}`}>{(parseFloat(op.current_load) || 0).toFixed(1)}</span></span>
                {poolEntry && (
                  <button
                    className={styles.revokeBtn}
                    onClick={() => handleRevokeOffer(poolEntry.pool_id)}
                    title="Remove from pool"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
