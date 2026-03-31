// OverloadConfirmModal.jsx
import styles from './OverloadConfirmModal.module.css';

export default function OverloadConfirmModal({ data, onConfirm, onCancel }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.title}>Confirm overload assignment</h3>
        <div className={styles.body}>
          <p>
            <strong>{data.opName}</strong> will be assigned to <strong>{data.machineName}</strong>,
            pushing their load above the normal threshold.
          </p>
          <div className={styles.loadCompare}>
            <div className={styles.loadItem}>
              <span className={styles.loadLabel}>Current load</span>
              <span className={styles.loadVal}>{data.curLoad.toFixed(1)}</span>
            </div>
            <span className={styles.arrow}>→</span>
            <div className={styles.loadItem}>
              <span className={styles.loadLabel}>New load</span>
              <span className={`${styles.loadVal} ${styles.overloadVal}`}>{data.newLoad.toFixed(1)}</span>
            </div>
          </div>
          <div className={styles.warn}>
            Overload assignments require manager approval before the plan can be approved.
          </div>
        </div>
        <div className={styles.actions}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" style={{background:'#fef3c7',borderColor:'#fcd34d',color:'#92400e'}} onClick={onConfirm}>
            Confirm overload
          </button>
        </div>
      </div>
    </div>
  );
}
