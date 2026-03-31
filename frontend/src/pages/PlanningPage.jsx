import { useState, useEffect, useCallback } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { schedulingApi, machinesApi, usersApi, productionLinesApi, poolApi } from '../api/services';
import useAuthStore from '../store/authStore';
import OperatorCard from '../components/planning/OperatorCard';
import MachineCard from '../components/planning/MachineCard';
import OverloadConfirmModal from '../components/planning/OverloadConfirmModal';
import OperatorPool from '../components/planning/OperatorPool';
import OfferOperatorPool from '../components/planning/OfferOperatorPool';
import OperatorLeaveManager from '../components/planning/OperatorLeaveManager';
import PlanStatusBar from '../components/planning/PlanStatusBar';
import styles from './PlanningPage.module.css';

export default function PlanningPage() {
  const { user } = useAuthStore();
  const isEng = ['admin','engineer'].includes(user?.role);
  const isTech = user?.role === 'technician';

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [shift, setShift] = useState('day');
  const [line, setLine] = useState(isTech ? user.dedicatedLine : 'L1');

  const [plan, setPlan] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [machines, setMachines] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [productionLines, setProductionLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [poolReloadTrigger, setPoolReloadTrigger] = useState(0); // Trigger pool reload when allocation succeeds

  const [activeOp, setActiveOp] = useState(null);
  const [overloadData, setOverloadData] = useState(null); // {opId, machineId, curLoad, newLoad, machineName}

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [planRes, machinesRes, usersRes] = await Promise.all([
        schedulingApi.getPlan(date, shift, line),
        machinesApi.getAll({ line }),
        usersApi.getAll({ active: 'true' }), // Get all operators/technicians, not filtered by line
      ]);
      setPlan(planRes.data.plan);
      setAssignments(planRes.data.assignments);
      setMachines(machinesRes.data);
      
      // Team = 
      // 1. Local operators/technicians on this line
      // 2. Transferred operators from other lines (already assigned to this plan)
      const localTeam = usersRes.data.filter(u =>
        ['operator','technician'].includes(u.role) && u.dedicated_line === line
      );
      
      // Get IDs of operators that have been transferred to this plan
      const transferredOpIds = planRes.data.assignments
        .filter(a => a.is_transfer && a.operator_id)
        .map(a => a.operator_id);
      
      // Find transferred operator objects from the users response, with home_load calculated
      const transferredOps = usersRes.data
        .filter(u => ['operator','technician'].includes(u.role) && transferredOpIds.includes(u.id))
        .map(u => {
          // Calculate home_load from the first assignment's load_score minus its own weight
          // load_score = existing total load + this assignment's weight
          const opAssignments = planRes.data.assignments
            .filter(a => a.operator_id === u.id && a.is_transfer)
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          const firstAssign = opAssignments[0];
          const firstWeight = firstAssign ? ({ HIGH: 1.0, MED: 0.4, LOW: 0.2 }[firstAssign.attention_level] || 0) : 0;
          const homeLoad = firstAssign ? Math.max(0, (parseFloat(firstAssign.load_score) || 0) - firstWeight) : 0;
          return {
            ...u,
            is_transfer: true,
            transfer_from_line: firstAssign?.operator_line || u.dedicated_line,
            home_load: Math.round(homeLoad * 10) / 10,
          };
        });
      
      // Combine and deduplicate by user ID
      const allTeam = [...new Map([...localTeam, ...transferredOps].map(u => [u.id, u])).values()];
      
      setTeamMembers(allTeam);
    } catch (err) {
      toast.error('Failed to load plan data');
    } finally {
      setLoading(false);
    }
  }, [date, shift, line]);

  useEffect(() => { loadData(); }, [loadData]);

  // Fetch production lines on mount
  useEffect(() => {
    const fetchLines = async () => {
      try {
        const res = await productionLinesApi.getAll();
        setProductionLines(res.data);
      } catch (err) {
        console.error('Failed to load production lines:', err);
        setProductionLines([]);
      }
    };
    fetchLines();
  }, []);

  const getOpAssignments = (opId) =>
    assignments.filter(a => a.operator_id === opId);

  const getMachineAssignments = (machineId) =>
    assignments.filter(a => a.machine_id === machineId);

  const isAssignedOtherShift = (opId) => {
    // Checked server-side; we track locally from plan data
    return false; // Server enforces this hard block
  };

  const handleDragStart = (event) => {
    const op = teamMembers.find(u => u.id === event.active.id);
    setActiveOp(op || null);
  };

  const handleAddCommonOperator = async (operator) => {
    // Handle allocation of operator from common pool
    // User must drag the operator onto a machine to finalize assignment
    if (!plan) return;

    try {
      console.log('Adding common pool operator:', operator);
      // Add operator to team members temporarily so they can be dragged
      // The actual assignment happens when they're dragged onto a machine
      const enrichedOp = {
        ...operator,
        is_transfer: true,
        transfer_from_line: operator.dedicated_line,
        pool_id: operator.pool_id, // Preserve pool_id for later allocation marking
        home_load: operator.home_load || 0, // Preserve existing load from home line
      };
      
      console.log('Enriched operator:', enrichedOp);
      
      // Add to team members if not already there
      setTeamMembers(prev => {
        const existing = prev.find(u => u.id === operator.id);
        if (existing) {
          console.log('Operator already in team members');
          return prev;
        }
        console.log('Adding operator to team members');
        return [...prev, enrichedOp];
      });
      
      toast.success(`${operator.name} added to team - drag to assign a machine`);
    } catch (err) {
      console.error('Error adding operator:', err);
      toast.error(err.response?.data?.error || 'Failed to add operator');
    }
  };

  const handleDragEnd = async (event) => {
    setActiveOp(null);
    const { active, over } = event;
    if (!over || !active) return;

    const opId = active.id;
    const machineId = over.id;

    const machine = machines.find(m => m.id === machineId);
    const operator = teamMembers.find(u => u.id === opId);
    if (!machine || !operator) {
      console.warn('Machine or operator not found', { machineId, opId, machine, operator });
      return;
    }

    // Already assigned
    if (getMachineAssignments(machineId).some(a => a.operator_id === opId)) {
      toast.warning('Operator already assigned to this machine');
      return;
    }

    console.log('Dragged operator to machine:', { operator, machine });
    await doAssign(opId, machineId, false);
  };

  const doAssign = async (opId, machineId, confirmOverload) => {
    if (!plan) return;
    setActionLoading(true);
    try {
      const res = await schedulingApi.assign(plan.id, {
        machineId,
        operatorId: opId,
        confirmOverload,
      });
      
      setAssignments(prev => [...prev, res.data]);
      
      // If this is a cross-line transfer, mark pool operator as allocated
      const operator = teamMembers.find(u => u.id === opId);
      console.log('Assignment created for operator:', { opId, operator, isTransfer: operator?.is_transfer, poolId: operator?.pool_id });
      
      if (operator && operator.is_transfer && operator.pool_id) {
        console.log('Marking pool operator as allocated:', operator.pool_id);
        try {
          const markResult = await poolApi.markAllocated({
            poolId: operator.pool_id,
            allocatedToPlanId: plan.id
          });
          console.log('Pool operator marked as allocated:', markResult);
          // Trigger pool reload in OperatorPool component
          setPoolReloadTrigger(prev => prev + 1);
        } catch (err) {
          console.error('Error marking pool operator as allocated:', err);
          // Still mark as successful even if pool marking fails
          setPoolReloadTrigger(prev => prev + 1);
        }
      } else {
        console.log('Operator is not a cross-line transfer or missing pool_id');
      }
      
      toast.success('Operator assigned');
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.code === 'OVERLOAD_CONFIRM_REQUIRED') {
        const machine = machines.find(m => m.id === machineId);
        setOverloadData({
          opId,
          machineId,
          curLoad: errData.currentLoad,
          newLoad: errData.newLoad,
          machineName: machine?.name || machineId,
          opName: teamMembers.find(u => u.id === opId)?.name || opId,
        });
      } else if (errData?.code === 'NOT_CAPABLE') {
        toast.error('Operator not certified for this machine type');
      } else {
        toast.error(errData?.error || 'Assignment failed');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmOverload = async () => {
    if (!overloadData) return;
    const { opId, machineId } = overloadData;
    setOverloadData(null);
    await doAssign(opId, machineId, true);
  };

  const handleRemoveAssignment = async (assignmentId) => {
    if (!plan) return;
    try {
      await schedulingApi.removeAssignment(plan.id, assignmentId);
      setAssignments(prev => prev.filter(a => a.id !== assignmentId));
      toast.success('Assignment removed');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove');
    }
  };

  const handleSubmit = async () => {
    if (!plan) return;
    setActionLoading(true);
    try {
      const res = await schedulingApi.submit(plan.id);
      setPlan(res.data);
      toast.success('Plan submitted for approval');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Submit failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReview = async (action, note) => {
    if (!plan) return;
    setActionLoading(true);
    try {
      const res = await schedulingApi.review(plan.id, action, note);
      setPlan(res.data);
      toast.success(`Plan ${action}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Review failed');
    } finally {
      setActionLoading(false);
    }
  };

  const canEdit = plan && ['draft'].includes(plan.status) && !loading;
  const isPlanLocked = plan && ['approved','rejected'].includes(plan.status);

  const coveredMachines = machines.filter(m => getMachineAssignments(m.id).length > 0).length;
  const highGaps = machines.filter(m => m.attention_level === 'HIGH' && getMachineAssignments(m.id).length === 0).length;
  const overloadedOps = teamMembers.filter(u => {
    const load = getOpAssignments(u.id).reduce((s, a) => s + ({HIGH:1.0,MED:0.4,LOW:0.2}[a.attention_level]||0), 0);
    return load > 1.0001;
  }).length;

  return (
    <div className="page-enter">
      <div className={styles.header}>
        <div>
          <h1>Planning Board</h1>
          <p className="text-muted" style={{marginTop:4}}>
            Drag operators onto machines to assign them for the shift
          </p>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>Date</label>
          <input
            type="date"
            className="form-input"
            style={{width:'auto'}}
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
        <div className={styles.shiftToggle}>
          {['day','night'].map(s => (
            <button key={s}
              className={`${styles.shiftBtn} ${shift === s ? styles[`shift_${s}`] : ''}`}
              onClick={() => setShift(s)}>
              {s === 'day' ? '☀ Day' : '☾ Night'}
            </button>
          ))}
        </div>
        {isEng && (
          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>Line</label>
            <select className="form-select" style={{width:'auto'}} value={line} onChange={e => setLine(e.target.value)}>
              {productionLines.map(pl => <option key={pl.id} value={pl.line_code}>{pl.line_name}</option>)}
            </select>
          </div>
        )}
      </div>

      {plan && (
        <PlanStatusBar
          plan={plan}
          coveredMachines={coveredMachines}
          totalMachines={machines.length}
          highGaps={highGaps}
          overloadedOps={overloadedOps}
          onSubmit={handleSubmit}
          onReview={handleReview}
          actionLoading={actionLoading}
          isEng={isEng}
        />
      )}

      {loading ? (
        <div className={styles.loadWrap}><div className="spinner spinner-lg" /></div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className={styles.board}>
            {/* Operator panel */}
            <div className={styles.panel}>
              <div className={styles.panelTitle}>
                {productionLines.find(pl => pl.line_code === line)?.line_name || line} team
                <span className={styles.panelCount}>{teamMembers.length}</span>
              </div>
              <div className={styles.operatorList}>
                {teamMembers.length === 0 && (
                  <p className={styles.empty}>No team members on this line</p>
                )}
                {teamMembers.filter(u => u.role === 'technician').length > 0 && (
                  <div className={styles.teamSection}>
                    <div className={styles.teamSectionLabel}>Technicians</div>
                    {teamMembers.filter(u => u.role === 'technician').map(op => (
                      <OperatorCard
                        key={op.id}
                        operator={op}
                        assignments={getOpAssignments(op.id)}
                        canDrag={canEdit && !isPlanLocked}
                        machineTypes={[...new Set(machines.map(m => m.type_name))]}
                      />
                    ))}
                  </div>
                )}
                <div className={styles.teamSection}>
                  <div className={styles.teamSectionLabel}>Operators</div>
                  {teamMembers.filter(u => u.role === 'operator').map(op => (
                    <OperatorCard
                      key={op.id}
                      operator={op}
                      assignments={getOpAssignments(op.id)}
                      canDrag={canEdit && !isPlanLocked}
                      machineTypes={[...new Set(machines.map(m => m.type_name))]}
                    />
                  ))}
                </div>
              </div>
              
              {/* Operator leave management */}
              {isTech && plan && (
                <OperatorLeaveManager
                  currentLine={line}
                  planDate={date}
                  shift={shift}
                  teamMembers={teamMembers}
                />
              )}

              {/* Offer operators to common pool */}
              {isTech && plan && (
                <OfferOperatorPool
                  currentLine={line}
                  planDate={date}
                  shift={shift}
                  planId={plan.id}
                  teamMembers={teamMembers}
                />
              )}

              {/* Common operator pool */}
              {isTech && plan && (
                <OperatorPool
                  currentLine={line}
                  planDate={date}
                  shift={shift}
                  onOperatorSelect={handleAddCommonOperator}
                  excludedOperators={assignments.map(a => a.operator_id)}
                  reloadTrigger={poolReloadTrigger}
                  allocatedOperators={assignments
                    .filter(a => teamMembers.some(op => op.id === a.operator_id && op.is_transfer))
                    .map(a => a.operator_id)}
                />
              )}
            </div>

            {/* Machines grid */}
            <div className={styles.machinesArea}>
              {isPlanLocked && (
                <div className={styles.lockedBanner}>
                  Plan is {plan.status} — editing is disabled
                </div>
              )}
              <div className={styles.machinesGrid}>
                {machines.map(machine => (
                  <MachineCard
                    key={machine.id}
                    machine={machine}
                    assignments={getMachineAssignments(machine.id)}
                    onRemove={handleRemoveAssignment}
                    canEdit={canEdit && !isPlanLocked}
                    allOperators={teamMembers}
                  />
                ))}
              </div>
            </div>
          </div>

          <DragOverlay>
            {activeOp && (
              <div style={{ opacity: 0.9, cursor: 'grabbing', transform: 'rotate(2deg)' }}>
                <OperatorCard
                  operator={activeOp}
                  assignments={getOpAssignments(activeOp.id)}
                  canDrag={false}
                  machineTypes={[]}
                  isDragging
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {overloadData && (
        <OverloadConfirmModal
          data={overloadData}
          onConfirm={handleConfirmOverload}
          onCancel={() => setOverloadData(null)}
        />
      )}
    </div>
  );
}
