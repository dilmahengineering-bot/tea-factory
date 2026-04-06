import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { machineTypesApi, machinesApi, productionLinesApi, usersApi } from '../api/services';
import styles from './MachineTypesPage.module.css';

export default function MachineTypesPage() {
  const { isEngineer, isAdmin } = useAuthStore();
  const [productionLines, setProductionLines] = useState([]);
  const [machineTypes, setMachineTypes] = useState([]);
  const [machines, setMachines] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddLine, setShowAddLine] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [editingLineId, setEditingLineId] = useState(null);
  const [editLineData, setEditLineData] = useState({});
  const [editingMachine, setEditingMachine] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteMachineConfirm, setDeleteMachineConfirm] = useState(null);
  const [deleteLineConfirm, setDeleteLineConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [lineForm, setLineForm] = useState({ line_code: '', line_name: '', location: '', capacity: 5, assigned_engineer_id: '' });
  const [machineForm, setMachineForm] = useState({ id: '', name: '', machineTypeId: '', line: 'L1', attentionLevel: 'MED', maxOperators: 1 });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load production lines, but provide fallback
      let linesData = [];
      try {
        const linesRes = await productionLinesApi.getAll();
        linesData = linesRes.data || [];
      } catch (lineErr) {
        // Fallback to default lines if API fails
        linesData = [
          { id: 1, line_code: 'L1', line_name: 'Line 1', capacity: 5, status: 'active' },
          { id: 2, line_code: 'L2', line_name: 'Line 2', capacity: 5, status: 'active' },
          { id: 3, line_code: 'L3', line_name: 'Line 3', capacity: 5, status: 'active' },
        ];
      }

      const [typesRes, machinesRes, engRes] = await Promise.all([
        machineTypesApi.getAll(),
        machinesApi.getAll(),
        usersApi.getAll({ role: 'engineer' }),
      ]);
      
      setProductionLines(linesData);
      setMachineTypes(typesRes.data);
      setMachines(machinesRes.data);
      setEngineers(engRes.data || []);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddType = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (machineTypes.find(t => t.name.toLowerCase() === form.name.trim().toLowerCase())) {
      errs.name = 'This machine type already exists';
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      await machineTypesApi.create({ name: form.name.trim(), description: form.description.trim() });
      toast.success(`Machine type "${form.name}" added`);
      setForm({ name: '', description: '' });
      setShowAddType(false);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add machine type');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteType = async () => {
    if (!deleteConfirm) return;
    try {
      await machineTypesApi.delete(deleteConfirm.id);
      toast.success(`"${deleteConfirm.name}" removed`);
      setDeleteConfirm(null);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Cannot remove');
      setDeleteConfirm(null);
    }
  };

  const handleEditType = async (e) => {
    e.preventDefault();
    if (!editingType) return;
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    const isDuplicate = machineTypes.find(t => t.name.toLowerCase() === form.name.trim().toLowerCase() && t.id !== editingType.id);
    if (isDuplicate) errs.name = 'This machine type already exists';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      await machineTypesApi.update(editingType.id, { name: form.name.trim(), description: form.description.trim() });
      toast.success(`Machine type "${form.name}" updated`);
      setForm({ name: '', description: '' });
      setEditingType(null);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update machine type');
    } finally {
      setSaving(false);
    }
  };

  const startEditType = (type) => {
    setEditingType(type);
    setForm({ name: type.name, description: type.description || '' });
    setErrors({});
  };

  const handleAddMachine = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!machineForm.id.trim()) errs.id = 'Machine ID is required';
    if (!machineForm.name.trim()) errs.mname = 'Name is required';
    if (!machineForm.machineTypeId) errs.type = 'Select a machine type';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      await machinesApi.create({
        id: machineForm.id.trim().toUpperCase(),
        name: machineForm.name.trim(),
        machineTypeId: machineForm.machineTypeId,
        line: machineForm.line,
        attentionLevel: machineForm.attentionLevel,
        maxOperators: Number(machineForm.maxOperators),
      });
      toast.success(`Machine "${machineForm.name}" added`);
      setMachineForm({ id: '', name: '', machineTypeId: '', line: 'L1', attentionLevel: 'MED', maxOperators: 1 });
      setShowAddMachine(false);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add machine');
    } finally {
      setSaving(false);
    }
  };

  const handleEditMachine = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!machineForm.name.trim()) errs.mname = 'Name is required';
    if (!machineForm.machineTypeId) errs.type = 'Select a machine type';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      await machinesApi.update(editingMachine.id, {
        name: machineForm.name.trim(),
        machineTypeId: machineForm.machineTypeId,
        line: machineForm.line,
        attentionLevel: machineForm.attentionLevel,
        maxOperators: Number(machineForm.maxOperators),
      });
      toast.success(`Machine "${machineForm.name}" updated`);
      setEditingMachine(null);
      setMachineForm({ id: '', name: '', machineTypeId: '', line: 'L1', attentionLevel: 'MED', maxOperators: 1 });
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update machine');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMachine = async () => {
    if (!deleteMachineConfirm) return;
    try {
      await machinesApi.delete(deleteMachineConfirm.id);
      toast.success(`"${deleteMachineConfirm.name}" removed`);
      setDeleteMachineConfirm(null);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Cannot remove machine');
      setDeleteMachineConfirm(null);
    }
  };

  const openEditMachine = (machine) => {
    setEditingMachine(machine);
    setMachineForm({
      id: machine.id,
      name: machine.name,
      machineTypeId: machine.type_id,
      line: machine.line,
      attentionLevel: machine.attention_level,
      maxOperators: machine.max_operators,
    });
    setShowAddMachine(false);
    setShowAddType(false);
    setErrors({});
  };

  const handleAddLine = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!lineForm.line_code.trim()) errs.code = 'Line code is required';
    if (!lineForm.line_name.trim()) errs.name = 'Line name is required';
    if (productionLines.find(l => l.line_code === lineForm.line_code.toUpperCase())) {
      errs.code = 'This line code already exists';
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      await productionLinesApi.create({
        line_code: lineForm.line_code.toUpperCase(),
        line_name: lineForm.line_name.trim(),
        location: lineForm.location.trim() || null,
        capacity: Number(lineForm.capacity),
        assigned_engineer_id: lineForm.assigned_engineer_id || null,
      });
      toast.success(`Production line "${lineForm.line_name}" created`);
      setLineForm({ line_code: '', line_name: '', location: '', capacity: 5, assigned_engineer_id: '' });
      setShowAddLine(false);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create production line');
    } finally {
      setSaving(false);
    }
  };

  const handleEditLineStart = (line) => {
    setEditingLineId(line.id);
    setEditLineData({
      line_name: line.line_name,
      location: line.location || '',
      capacity: line.capacity || 5,
      status: line.status,
      assigned_engineer_id: line.assigned_engineer_id || '',
    });
  };

  const handleEditLineCancel = () => {
    setEditingLineId(null);
    setEditLineData({});
  };

  const handleEditLineSave = async (lineId) => {
    setSaving(true);
    try {
      await productionLinesApi.update(lineId, editLineData);
      toast.success('Production line updated');
      await loadData();
      handleEditLineCancel();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update line');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLine = async () => {
    if (!deleteLineConfirm) return;
    try {
      await productionLinesApi.delete(deleteLineConfirm.id);
      toast.success(`Production line "${deleteLineConfirm.line_name}" removed`);
      setDeleteLineConfirm(null);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Cannot remove this production line');
      setDeleteLineConfirm(null);
    }
  };

  const machinesByLine = machines.reduce((acc, m) => {
    if (!acc[m.line]) acc[m.line] = [];
    acc[m.line].push(m);
    return acc;
  }, {});

  const lineSections = (() => {
    const knownLineCodes = productionLines.map(pl => pl.line_code);
    const extraMachineLines = Object.keys(machinesByLine).filter(code => !knownLineCodes.includes(code));
    return [...knownLineCodes, ...extraMachineLines];
  })();

  const attnColors = {
    HIGH: { bg: 'rgba(239,68,68,0.12)', color: '#f87171' },
    MED:  { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24' },
    LOW:  { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80' },
  };

  return (
    <div className="page-enter">
      <div className={styles.header}>
        <div>
          <h1>Machine Types</h1>
          <p className="text-muted" style={{ marginTop: 4 }}>
            Define machine types and add machines to production lines.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin() && (
            <button className="btn btn-success" onClick={() => { setShowAddLine(!showAddLine); setShowAddType(false); setShowAddMachine(false); setErrors({}); }}>
              + Add production line
            </button>
          )}
          {isEngineer() && (
            <>
              <button className="btn btn-secondary" onClick={() => { setShowAddMachine(!showAddMachine); setShowAddType(false); setShowAddLine(false); setErrors({}); }}>
                + Add machine
              </button>
              <button className="btn btn-primary" onClick={() => { setShowAddType(!showAddType); setShowAddMachine(false); setShowAddLine(false); setErrors({}); }}>
                + Add machine type
              </button>
            </>
          )}
        </div>
      </div>

      {showAddLine && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Create new production line</h3>
          <form onSubmit={handleAddLine}>
            <div className={styles.formRow}>
              <div className="form-group">
                <label className="form-label">Line code *</label>
                <input className="form-input" placeholder="e.g. L4, L5, etc."
                  value={lineForm.line_code} onChange={e => { setLineForm(f => ({ ...f, line_code: e.target.value })); setErrors({}); }} />
                <span className="form-error">{errors.code}</span>
              </div>
              <div className="form-group">
                <label className="form-label">Line name *</label>
                <input className="form-input" placeholder="e.g. Line 4"
                  value={lineForm.line_name} onChange={e => { setLineForm(f => ({ ...f, line_name: e.target.value })); setErrors({}); }} />
                <span className="form-error">{errors.name}</span>
              </div>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input className="form-input" placeholder="e.g. Floor 2"
                  value={lineForm.location} onChange={e => setLineForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Capacity</label>
                <input className="form-input" type="number" min={1} max={20}
                  value={lineForm.capacity} onChange={e => setLineForm(f => ({ ...f, capacity: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Assigned Engineer</label>
                <select className="form-select"
                  value={lineForm.assigned_engineer_id} onChange={e => setLineForm(f => ({ ...f, assigned_engineer_id: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {engineers.map(eng => <option key={eng.id} value={eng.id}>{eng.name} ({eng.emp_no})</option>)}
                </select>
              </div>
              <div className={styles.formActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddLine(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null} Create line
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {(showAddType || editingType) && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>{editingType ? 'Edit machine type' : 'New machine type'}</h3>
          <form onSubmit={editingType ? handleEditType : handleAddType}>
            <div className={styles.formRow}>
              <div className="form-group">
                <label className="form-label">Type name *</label>
                <input className="form-input" placeholder="e.g. Shrink wrapper"
                  value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErrors({}); }} />
                <span className="form-error">{errors.name}</span>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-input" placeholder="Brief description"
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className={styles.formActions}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowAddType(false); setEditingType(null); setForm({ name: '', description: '' }); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null} {editingType ? 'Update' : 'Add'} type
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {showAddMachine && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Add machine to floor</h3>
          <form onSubmit={handleAddMachine}>
            <div className={styles.machineFormGrid}>
              <div className="form-group">
                <label className="form-label">Machine ID *</label>
                <input className="form-input" placeholder="e.g. M-401"
                  value={machineForm.id} onChange={e => { setMachineForm(f => ({ ...f, id: e.target.value })); setErrors({}); }} />
                <span className="form-error">{errors.id}</span>
              </div>
              <div className="form-group">
                <label className="form-label">Machine name *</label>
                <input className="form-input" placeholder="e.g. Tea bagger F"
                  value={machineForm.name} onChange={e => { setMachineForm(f => ({ ...f, name: e.target.value })); setErrors({}); }} />
                <span className="form-error">{errors.mname}</span>
              </div>
              <div className="form-group">
                <label className="form-label">Machine type *</label>
                <select className="form-select"
                  value={machineForm.machineTypeId} onChange={e => { setMachineForm(f => ({ ...f, machineTypeId: e.target.value })); setErrors({}); }}>
                  <option value="">Select type…</option>
                  {machineTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <span className="form-error">{errors.type}</span>
              </div>
              <div className="form-group">
                <label className="form-label">Line</label>
                <select className="form-select" value={machineForm.line} onChange={e => setMachineForm(f => ({ ...f, line: e.target.value }))}>
                  <option value="">Select line…</option>
                  {productionLines.map(line => <option key={line.id} value={line.line_code}>{line.line_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Attention level</label>
                <select className="form-select" value={machineForm.attentionLevel} onChange={e => setMachineForm(f => ({ ...f, attentionLevel: e.target.value }))}>
                  <option value="HIGH">HIGH — dedicated operator</option>
                  <option value="MED">MED — 1 op per 2–3 machines</option>
                  <option value="LOW">LOW — 1 op per 4–5 machines</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Max operators</label>
                <input className="form-input" type="number" min={1} max={5}
                  value={machineForm.maxOperators} onChange={e => setMachineForm(f => ({ ...f, maxOperators: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddMachine(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null} Add machine
              </button>
            </div>
          </form>
        </div>
      )}

      {editingMachine && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Edit machine</h3>
          <form onSubmit={handleEditMachine}>
            <div className={styles.machineFormGrid}>
              <div className="form-group">
                <label className="form-label">Machine ID (read-only)</label>
                <input className="form-input" disabled value={machineForm.id} />
              </div>
              <div className="form-group">
                <label className="form-label">Machine name *</label>
                <input className="form-input" placeholder="e.g. Tea bagger F"
                  value={machineForm.name} onChange={e => { setMachineForm(f => ({ ...f, name: e.target.value })); setErrors({}); }} />
                <span className="form-error">{errors.mname}</span>
              </div>
              <div className="form-group">
                <label className="form-label">Machine type *</label>
                <select className="form-select"
                  value={machineForm.machineTypeId} onChange={e => { setMachineForm(f => ({ ...f, machineTypeId: e.target.value })); setErrors({}); }}>
                  <option value="">Select type…</option>
                  {machineTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <span className="form-error">{errors.type}</span>
              </div>
              <div className="form-group">
                <label className="form-label">Line</label>
                <select className="form-select" value={machineForm.line} onChange={e => setMachineForm(f => ({ ...f, line: e.target.value }))}>
                  <option value="">Select line…</option>
                  {productionLines.map(line => <option key={line.id} value={line.line_code}>{line.line_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Attention level</label>
                <select className="form-select" value={machineForm.attentionLevel} onChange={e => setMachineForm(f => ({ ...f, attentionLevel: e.target.value }))}>
                  <option value="HIGH">HIGH — dedicated operator</option>
                  <option value="MED">MED — 1 op per 2–3 machines</option>
                  <option value="LOW">LOW — 1 op per 4–5 machines</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Max operators</label>
                <input className="form-input" type="number" min={1} max={5}
                  value={machineForm.maxOperators} onChange={e => setMachineForm(f => ({ ...f, maxOperators: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={() => { setEditingMachine(null); setMachineForm({ id: '', name: '', machineTypeId: '', line: 'L1', attentionLevel: 'MED', maxOperators: 1 }); }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null} Save changes
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner spinner-lg" /></div>
      ) : (
        <>
          {/* Production lines */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 className={styles.sectionTitle}>Production lines ({productionLines.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {productionLines.map(line => (
                <div key={line.id} className={`${styles.typeCard}`} style={{ position: 'relative', padding: editingLineId === line.id ? '1rem' : 'unset' }}>
                  {editingLineId === line.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.85rem' }}>Line name</label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ fontSize: '0.9rem' }}
                          value={editLineData.line_name}
                          onChange={e => setEditLineData({...editLineData, line_name: e.target.value})}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.85rem' }}>Location</label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ fontSize: '0.9rem' }}
                          value={editLineData.location}
                          onChange={e => setEditLineData({...editLineData, location: e.target.value})}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.85rem' }}>Capacity</label>
                        <input
                          type="number"
                          className="form-input"
                          style={{ fontSize: '0.9rem' }}
                          value={editLineData.capacity}
                          onChange={e => setEditLineData({...editLineData, capacity: parseInt(e.target.value)})}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.85rem' }}>Assigned Engineer</label>
                        <select
                          className="form-select"
                          style={{ fontSize: '0.9rem' }}
                          value={editLineData.assigned_engineer_id || ''}
                          onChange={e => setEditLineData({...editLineData, assigned_engineer_id: e.target.value || ''})}
                        >
                          <option value="">Unassigned</option>
                          {engineers.map(eng => <option key={eng.id} value={eng.id}>{eng.name} ({eng.emp_no})</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleEditLineSave(line.id)}
                          disabled={saving}
                          style={{ flex: 1 }}
                        >
                          {saving ? '...' : 'Save'}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={handleEditLineCancel}
                          disabled={saving}
                          style={{ flex: 1 }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={styles.typeCardHead}>
                        <div>
                          <div className={styles.typeName}>{line.line_name}</div>
                          <span className={styles.typeBadge} style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1' }}>
                            {line.line_code}
                          </span>
                        </div>
                        {isAdmin() && (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleEditLineStart(line)}>
                              Edit
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleteLineConfirm(line)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                      {line.location && <p className={styles.typeDesc}>{line.location}</p>}
                      <div className={styles.typeMeta}>
                        <span>Capacity: {line.capacity}</span>
                        <span>·</span>
                        <span>{line.machine_count || 0} machine{(line.machine_count || 0) !== 1 ? 's' : ''}</span>
                      </div>
                      {line.engineer_name && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--gray-600)' }}>
                          👤 {line.engineer_name}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.twoCol}>
          {/* Machine types */}
          <div>
            <h3 className={styles.sectionTitle}>Machine types ({machineTypes.length})</h3>
            <div className={styles.typeGrid}>
              {machineTypes.map(mt => (
                <div key={mt.id} className={`${styles.typeCard} ${!mt.is_system ? styles.customTypeCard : ''}`}>
                  <div className={styles.typeCardHead}>
                    <div>
                      <div className={styles.typeName}>{mt.name}</div>
                      <span className={`${styles.typeBadge} ${mt.is_system ? styles.typeBadgeSys : styles.typeBadgeCustom}`}>
                        {mt.is_system ? 'system' : 'custom'}
                      </span>
                    </div>
                    {!mt.is_system && isAdmin() && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => startEditType(mt)}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(mt)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                  {mt.description && <p className={styles.typeDesc}>{mt.description}</p>}
                  <div className={styles.typeMeta}>
                    <span>{mt.certified_operators} operator{mt.certified_operators !== 1 ? 's' : ''} certified</span>
                    <span>·</span>
                    <span>{mt.machine_count} machine{mt.machine_count !== 1 ? 's' : ''} on floor</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Machines by line */}
          <div>
            <h3 className={styles.sectionTitle}>Floor machines ({machines.length})</h3>
            {lineSections.map(lineKey => {
              const lineMachines = machinesByLine[lineKey] || [];
              if (!lineMachines.length) return null;
              const lineInfo = productionLines.find(pl => pl.line_code === lineKey);
              return (
                <div key={lineKey} className={styles.lineSection}>
                  <div className={styles.lineSectionTitle}>
                    {lineInfo?.line_name || lineKey} <span className={styles.lineMachineCount}>{lineMachines.length}</span>
                  </div>
                  {lineMachines.map(m => {
                    const ac = attnColors[m.attention_level] || attnColors.MED;
                    return (
                      <div key={m.id} className={styles.machineRow}>
                        <span className={styles.machineIdBadge}>{m.id}</span>
                        <div className={styles.machineRowInfo}>
                          <span className={styles.machineRowName}>{m.name}</span>
                          <span className={styles.machineRowType}>{m.type_name}</span>
                        </div>
                        <span className={styles.attnBadge} style={{ background: ac.bg, color: ac.color }}>
                          {m.attention_level}
                        </span>
                        <span className={styles.maxOps}>{m.max_operators} op max</span>
                        {isAdmin() && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEditMachine(m)}>
                              Edit
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleteMachineConfirm(m)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        </>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 style={{ marginBottom: 10 }}>Remove machine type</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              Remove <strong style={{ color: 'var(--text)' }}>{deleteConfirm.name}</strong>? This will also remove it from all operator capability records.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteType}>Remove</button>
            </div>
          </div>
        </div>

      )}

      {/* Delete machine confirm modal */}
      {deleteMachineConfirm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 style={{ marginBottom: 10 }}>Remove machine</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              Remove <strong style={{ color: 'var(--text)' }}>{deleteMachineConfirm.name}</strong> (ID: {deleteMachineConfirm.id})? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteMachineConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteMachine}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete production line confirm modal */}
      {deleteLineConfirm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 style={{ marginBottom: 10 }}>Remove production line</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              Remove <strong style={{ color: 'var(--text)' }}>{deleteLineConfirm.line_name}</strong> ({deleteLineConfirm.line_code})? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteLineConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteLine}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
