import { useDroppable } from '@dnd-kit/core';
import styles from './MachineCard.module.css';

const ATTN_WEIGHT = { HIGH: 1.0, MED: 0.4, LOW: 0.2 };

export default function MachineCard({ machine, assignments, onRemove, canEdit, allOperators }) {
  const { setNodeRef, isOver } = useDroppable({ id: machine.id, disabled: !canEdit });

  const filled = assignments.length;
  const atCap = filled >= machine.max_operators;
  const hasOverload = assignments.some(a => {
    const allForOp = assignments.filter(x => x.operator_id === a.operator_id);
    const load = allForOp.reduce((s, x) => s + (ATTN_WEIGHT[x.attention_level] || 0), 0);
    return load > 1.0001;
  });

  const attnColors = {
    HIGH: { bg: 'rgba(239,68,68,0.12)', text: '#f87171', border: 'rgba(239,68,68,0.25)' },
    MED:  { bg: 'rgba(245,158,11,0.12)', text: '#fbbf24', border: 'rgba(245,158,11,0.25)' },
    LOW:  { bg: 'rgba(34,197,94,0.12)',  text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
  };
  const ac = attnColors[machine.attention_level] || attnColors.MED;

  let alertText = '';
  let alertClass = '';
  if (hasOverload) { alertText = 'Overload assigned'; alertClass = styles.alertWarn; }
  else if (atCap)  { alertText = 'At capacity'; alertClass = styles.alertOk; }
  else if (filled === 0 && machine.attention_level === 'HIGH') { alertText = 'Needs operator'; alertClass = styles.alertDanger; }
  else if (filled > 0)  { alertText = 'Assigned'; alertClass = styles.alertOk; }

  return (
    <div
      ref={setNodeRef}
      className={`
        ${styles.card}
        ${isOver ? styles.cardOver : ''}
        ${hasOverload ? styles.cardOverload : ''}
        ${filled === 0 && machine.attention_level === 'HIGH' ? styles.cardUrgent : ''}
      `}
    >
      <div className={styles.head}>
        <span className={styles.machineId}>{machine.id}</span>
        <span className={styles.attn} style={{ background: ac.bg, color: ac.text, borderColor: ac.border }}>
          {machine.attention_level}
        </span>
      </div>

      <div className={styles.machineName}>{machine.name}</div>
      <div className={styles.machineType}>{machine.type_name}</div>

      <div className={styles.dropzone}>
        {filled === 0 ? (
          <div className={styles.dropHint}>
            {canEdit ? 'Drop operator here' : 'No operator assigned'}
          </div>
        ) : (
          assignments.map(a => (
            <div key={a.id} className={`${styles.assignedRow} ${a.is_overload ? styles.overloadRow : ''} ${a.is_transfer ? styles.transferRow : ''}`}>
              <div className={`avatar avatar-sm ${a.operator_role === 'technician' ? 'av-technician' : 'av-operator'}`}
                style={{width:22,height:22,fontSize:'0.6rem'}}>
                {a.operator_name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
              </div>
              <span className={styles.assignedName}>
                {a.operator_name}
                {a.is_overload && <span className={styles.overloadTag}>OL</span>}
                {a.is_transfer && <span className={styles.transferTag}>TR</span>}
              </span>
              {canEdit && (
                <button className={styles.removeBtn} onClick={() => onRemove(a.id)} title="Remove">×</button>
              )}
            </div>
          ))
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.slots}>
          <span>{filled}/{machine.max_operators} slots</span>
          <div className={styles.dots}>
            {Array.from({ length: machine.max_operators }, (_, i) => (
              <div key={i} className={`${styles.dot} ${i < filled ? (hasOverload ? styles.dotOv : styles.dotOk) : ''}`} />
            ))}
          </div>
        </div>
        {alertText && <span className={`${styles.alert} ${alertClass}`}>{alertText}</span>}
      </div>
    </div>
  );
}
