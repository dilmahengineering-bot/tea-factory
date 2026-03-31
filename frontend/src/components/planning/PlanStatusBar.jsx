import { useState } from 'react';
import styles from './PlanStatusBar.module.css';

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     class: 'statusDraft'     },
  submitted: { label: 'Submitted', class: 'statusSubmitted' },
  approved:  { label: 'Approved',  class: 'statusApproved'  },
  rejected:  { label: 'Rejected',  class: 'statusRejected'  },
};

export default function PlanStatusBar({
  plan, coveredMachines, totalMachines, highGaps, overloadedOps,
  onSubmit, onReview, actionLoading, isEng,
}) {
  const [reviewNote, setReviewNote] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [reviewAction, setReviewAction] = useState(null);

  const cfg = STATUS_CONFIG[plan.status] || STATUS_CONFIG.draft;

  const handleReview = (action) => {
    setReviewAction(action);
    setShowReview(true);
  };

  const submitReview = () => {
    onReview(reviewAction, reviewNote);
    setShowReview(false);
    setReviewNote('');
    setReviewAction(null);
  };

  return (
    <div className={styles.bar}>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statVal} style={{ color: coveredMachines === totalMachines ? 'var(--success)' : 'var(--text)' }}>
            {coveredMachines}/{totalMachines}
          </span>
          <span className={styles.statLbl}>covered</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.statVal} style={{ color: highGaps > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {highGaps}
          </span>
          <span className={styles.statLbl}>HIGH gaps</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.statVal} style={{ color: overloadedOps > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {overloadedOps}
          </span>
          <span className={styles.statLbl}>overloaded</span>
        </div>
      </div>

      <div className={styles.right}>
        <span className={`${styles.status} ${styles[cfg.class]}`}>{cfg.label}</span>

        {plan.status === 'draft' && (
          <button className="btn btn-primary btn-sm" onClick={onSubmit} disabled={actionLoading}>
            {actionLoading ? <span className="spinner" style={{width:14,height:14}} /> : null}
            Submit for approval
          </button>
        )}

        {plan.status === 'submitted' && isEng && (
          <>
            <button className="btn btn-sm" style={{background:'#fee2e2',borderColor:'#fca5a5',color:'#991b1b'}}
              onClick={() => handleReview('rejected')} disabled={actionLoading}>
              Reject
            </button>
            <button className="btn btn-sm" style={{background:'#dcfce7',borderColor:'#86efac',color:'#166534'}}
              onClick={() => handleReview('approved')} disabled={actionLoading}>
              Approve
            </button>
          </>
        )}

        {plan.status === 'rejected' && plan.review_note && (
          <span className={styles.reviewNote} title={plan.review_note}>
            Note: {plan.review_note.length > 40 ? plan.review_note.slice(0, 40) + '…' : plan.review_note}
          </span>
        )}
      </div>

      {showReview && (
        <div className={styles.reviewOverlay}>
          <div className={styles.reviewPanel}>
            <h4 style={{marginBottom:10}}>
              {reviewAction === 'approved' ? 'Approve plan' : 'Reject plan'}
            </h4>
            <div className="form-group">
              <label className="form-label">Note (optional)</label>
              <textarea
                className="form-input"
                style={{minHeight:72,resize:'vertical'}}
                placeholder={reviewAction === 'rejected' ? 'Reason for rejection…' : 'Approval note…'}
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
              />
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:10}}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowReview(false)}>Cancel</button>
              <button
                className="btn btn-sm"
                style={reviewAction === 'approved'
                  ? {background:'#dcfce7',borderColor:'#86efac',color:'#166534'}
                  : {background:'#fee2e2',borderColor:'#fca5a5',color:'#991b1b'}}
                onClick={submitReview}
                disabled={actionLoading}
              >
                {reviewAction === 'approved' ? 'Confirm approval' : 'Confirm rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
