import { useDraggable } from '@dnd-kit/core';
import styles from './OperatorCard.module.css';

const ATTN_WEIGHT = { HIGH: 1.0, MED: 0.4, LOW: 0.2 };

function initials(name) {
  return name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
}

export default function OperatorCard({ operator, assignments, canDrag, machineTypes, isDragging }) {
  const { attributes, listeners, setNodeRef, isDragging: dndDragging } = useDraggable({
    id: operator.id,
    disabled: !canDrag,
  });

  const planLoad = assignments.reduce((s, a) => s + (ATTN_WEIGHT[a.attention_level] || 0), 0);
  const homeLoad = operator.is_transfer ? (operator.home_load || 0) : 0;
  const load = planLoad + homeLoad;
  const loadPct = Math.min(load / 1.5, 1) * 100;
  const isOverloaded = load > 1.0001;
  const isBlocked = false; // checked server-side

  const barColor = load > 1 ? '#ef4444' : load > 0.75 ? '#f59e0b' : '#22c55e';

  let statusLabel = 'Available';
  let statusClass = styles.statusFree;
  if (isOverloaded) { statusLabel = `Overloaded · ${load.toFixed(1)}`; statusClass = styles.statusOverload; }
  else if (assignments.length > 0) { statusLabel = `Active · ${load.toFixed(1)} load`; statusClass = styles.statusActive; }

  const caps = operator.capabilities || [];

  return (
    <div
      ref={setNodeRef}
      {...(canDrag ? { ...attributes, ...listeners } : {})}
      className={`
        ${styles.card}
        ${operator.role === 'technician' ? styles.techCard : ''}
        ${dndDragging || isDragging ? styles.dragging : ''}
        ${isOverloaded ? styles.overloadCard : ''}
        ${canDrag ? styles.draggable : ''}
      `}
    >
      <div className={styles.top}>
        <div className={`avatar avatar-sm ${operator.role === 'technician' ? 'av-technician' : 'av-operator'}`}>
          {initials(operator.name)}
        </div>
        <div className={styles.info}>
          <div className={styles.name}>
            {operator.name}
            {operator.is_transfer && <span className={styles.transferBadge}>Cross-line</span>}
          </div>
          <div className={styles.empNo}>
            {operator.emp_no}
            {operator.is_transfer && operator.transfer_from_line && (
              <span className={styles.fromLine}>from {operator.transfer_from_line}</span>
            )}
          </div>
        </div>
      </div>

      {caps.length > 0 && (
        <div className={styles.caps}>
          {machineTypes.map(type => {
            const hasCap = operator.role === 'technician' || caps.some(c => c.name === type);
            return (
              <span key={type} className={`${styles.cap} ${hasCap ? styles.capYes : styles.capNo}`}
                title={hasCap ? 'Certified' : 'Not certified'}>
                {type}
              </span>
            );
          })}
        </div>
      )}

      <div className={styles.loadWrap}>
        <div className={styles.loadBar}>
          <div className={styles.loadFill} style={{ width: `${loadPct}%`, background: barColor }} />
        </div>
        <span className={styles.loadNum}>
          {load.toFixed(1)}<span className={styles.loadMax}>/1.0</span>
        </span>
      </div>

      <div className={`${styles.status} ${statusClass}`}>{statusLabel}</div>
    </div>
  );
}
