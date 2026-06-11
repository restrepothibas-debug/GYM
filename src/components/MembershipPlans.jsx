import { useContext, useId, useMemo, useState } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { useUi } from '../context/UiContext';
import { formatCurrency } from '../lib/accounting';
import { DEFAULT_MEMBERSHIP_PLANS, getActiveMembershipPlans, sortMembershipPlans } from '../lib/membershipPlans';

function getPlanDraft(plan = {}) {
  return {
    id: plan.id || '',
    planKey: plan.planKey || '',
    name: plan.name || '',
    durationDays: String(plan.durationDays ?? 30),
    price: String(plan.price ?? 0),
    active: plan.active !== false,
    sortOrder: String(plan.sortOrder ?? 100),
  };
}

function canManageTenantConfiguration(activeTenant) {
  return !activeTenant?.role || ['owner', 'admin'].includes(activeTenant.role);
}

function MembershipPlans() {
  const {
    activeTenant,
    deactivateMembershipPlan,
    deleteMembershipPlan,
    membershipPlans,
    saveMembershipPlan,
  } = useContext(GymContext);
  const { confirm, notify } = useUi();
  const [planDraft, setPlanDraft] = useState(() => getPlanDraft());
  const [editingPlanId, setEditingPlanId] = useState('');
  const [planError, setPlanError] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);
  const planNameInputId = useId();
  const planKeyInputId = useId();
  const planDurationInputId = useId();
  const planPriceInputId = useId();
  const canManagePlans = canManageTenantConfiguration(activeTenant);
  const visiblePlans = useMemo(() => (
    sortMembershipPlans(membershipPlans.length ? membershipPlans : DEFAULT_MEMBERSHIP_PLANS)
  ), [membershipPlans]);
  const activePlanCount = useMemo(() => (
    getActiveMembershipPlans(visiblePlans).length
  ), [visiblePlans]);

  const updatePlanField = (field) => (event) => {
    setPlanError('');
    setPlanDraft(currentDraft => ({
      ...currentDraft,
      [field]: field === 'active' ? event.target.checked : event.target.value,
    }));
  };

  const handleEditPlan = (plan) => {
    setPlanError('');
    setEditingPlanId(plan.id || plan.planKey);
    setPlanDraft(getPlanDraft(plan));
  };

  const handleResetPlanDraft = () => {
    setPlanError('');
    setEditingPlanId('');
    setPlanDraft(getPlanDraft());
  };

  const handleSavePlan = async () => {
    const durationDays = Number(planDraft.durationDays);
    const price = Number(planDraft.price);
    const sortOrder = Number(planDraft.sortOrder || 100);

    if (!canManagePlans) {
      setPlanError('Solo administradores del gimnasio pueden editar planes.');
      return;
    }

    if (!planDraft.name.trim() || !durationDays || durationDays <= 0 || price < 0) {
      setPlanError('El plan necesita nombre, dias positivos y precio valido.');
      return;
    }

    setSavingPlan(true);
    const saved = await Promise.resolve(saveMembershipPlan({
      id: planDraft.id || '',
      planKey: planDraft.planKey,
      name: planDraft.name,
      durationDays,
      price,
      active: planDraft.active,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
    }));
    setSavingPlan(false);

    if (!saved) {
      setPlanError('No se pudo guardar el plan de membresía.');
      return;
    }

    notify({
      title: 'Plan guardado',
      message: 'El catálogo de membresías quedó actualizado.',
      tone: 'success',
    });
    handleResetPlanDraft();
  };

  const handleDeactivatePlan = async (plan) => {
    if (!canManagePlans) {
      setPlanError('Solo administradores del gimnasio pueden desactivar planes.');
      return;
    }

    const deactivated = await Promise.resolve(deactivateMembershipPlan(plan.id || plan.planKey));
    if (!deactivated) {
      setPlanError('No se pudo desactivar el plan.');
      return;
    }

    notify({
      title: 'Plan desactivado',
      message: `${plan.name} ya no aparece como opcion activa.`,
      tone: 'success',
    });
    if (editingPlanId === (plan.id || plan.planKey)) handleResetPlanDraft();
  };

  const handleDeletePlan = async (plan) => {
    if (!canManagePlans) {
      setPlanError('Solo administradores del gimnasio pueden eliminar planes.');
      return;
    }

    const confirmed = await confirm({
      title: 'Eliminar plan',
      message: `¿Eliminar el plan ${plan.name}? Si ya tiene atletas o historial, no se puede borrar aunque esté desactivado.`,
      confirmLabel: 'Eliminar plan',
    });
    if (!confirmed) return;

    const result = await Promise.resolve(deleteMembershipPlan(plan));
    if (!result?.ok) {
      setPlanError(result?.error || 'No se pudo eliminar el plan.');
      return;
    }

    notify({
      title: 'Plan eliminado',
      message: `${plan.name} ya no aparece en el catalogo.`,
      tone: 'success',
    });
    if (editingPlanId === (plan.id || plan.planKey)) handleResetPlanDraft();
  };

  return (
    <section className="plans-view animate-fadeIn" aria-labelledby="plans-title">
      <div className="plans-header">
        <div>
          <span className="plans-eyebrow">Catalogo operativo</span>
          <h3 id="plans-title">
            <CreditCard className="w-4 h-4" aria-hidden="true" />
            Planes de membresía
          </h3>
          <p>{activePlanCount} planes activos para inscripcion y renovacion.</p>
        </div>
        {!canManagePlans && (
          <span className="app-plan-config__role">Solo lectura</span>
        )}
      </div>

      {planError && (
        <p role="alert" className="app-identity-error">
          {planError}
        </p>
      )}

      <div className="app-plan-list">
        {visiblePlans.map(plan => (
          <article
            key={plan.id || plan.planKey}
            className={`app-plan-card ${plan.active === false ? 'app-plan-card--inactive' : ''}`}
          >
            <div className="app-plan-card__main">
              <strong>{plan.name}</strong>
              <span>{plan.planKey} · {plan.durationDays} dias</span>
            </div>
            <div className="app-plan-card__price">
              <strong>{formatCurrency(plan.price)}</strong>
              <span>{plan.active === false ? 'Inactivo' : 'Activo'}</span>
            </div>
            {canManagePlans && (
              <div className="app-plan-card__actions">
                <button
                  type="button"
                  onClick={() => handleEditPlan(plan)}
                  className="app-button app-button--secondary"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleDeactivatePlan(plan)}
                  disabled={plan.active === false}
                  className="app-button app-button--secondary"
                >
                  Desactivar
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePlan(plan)}
                  className="app-button app-button--danger"
                >
                  Eliminar
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      <div
        className="app-plan-editor"
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault();
        }}
      >
        <div className="app-identity-field">
          <label className="app-identity-label" htmlFor={planNameInputId}>Nombre del plan</label>
          <input
            id={planNameInputId}
            type="text"
            value={planDraft.name}
            onChange={updatePlanField('name')}
            disabled={!canManagePlans}
            className="app-identity-input"
          />
        </div>
        <div className="app-identity-field">
          <label className="app-identity-label" htmlFor={planKeyInputId}>Clave interna</label>
          <input
            id={planKeyInputId}
            type="text"
            value={planDraft.planKey}
            onChange={updatePlanField('planKey')}
            disabled={!canManagePlans || Boolean(planDraft.id || editingPlanId)}
            className="app-identity-input"
          />
        </div>
        <div className="app-identity-field">
          <label className="app-identity-label" htmlFor={planDurationInputId}>Dias</label>
          <input
            id={planDurationInputId}
            type="number"
            min="1"
            value={planDraft.durationDays}
            onChange={updatePlanField('durationDays')}
            disabled={!canManagePlans}
            className="app-identity-input"
          />
        </div>
        <div className="app-identity-field">
          <label className="app-identity-label" htmlFor={planPriceInputId}>Precio</label>
          <input
            id={planPriceInputId}
            type="number"
            min="0"
            value={planDraft.price}
            onChange={updatePlanField('price')}
            disabled={!canManagePlans}
            className="app-identity-input"
          />
        </div>
        <label className="app-plan-editor__active">
          <input
            type="checkbox"
            checked={planDraft.active}
            onChange={updatePlanField('active')}
            disabled={!canManagePlans}
          />
          <span>Disponible para ventas</span>
        </label>
        <div className="app-plan-editor__actions">
          <button
            type="button"
            onClick={handleResetPlanDraft}
            className="app-button app-button--secondary"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={handleSavePlan}
            disabled={!canManagePlans || savingPlan}
            className="app-primary-action app-plan-editor__save"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {savingPlan ? 'Guardando' : editingPlanId ? 'Actualizar plan' : 'Agregar plan'}
          </button>
        </div>
      </div>
    </section>
  );
}

export default MembershipPlans;
