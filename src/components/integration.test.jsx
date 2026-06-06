import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GymProvider } from '../context/GymContext';
import { UiProvider } from '../context/UiContext';
import Dashboard from './Dashboard';
import Members from './Members';
import BottomSheet from './BottomSheet';

// Helper para envolver con el proveedor y un miembro de prueba precargado
function localStorageMock() {
  let store = {};
  return {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = v.toString(); },
    clear:   ()    => { store = {}; },
  };
}

const SEED_MEMBER = {
  id: 'm1', name: 'Carlos Prueba', doc: '99999', phone: '3001234567',
  balance: -10000, plan: 'mensual',
  expiryDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
  attendance: [],
  products: [],
};

const SEED_PRODUCT = { id: 'prod1', name: 'Agua', price: 2000, stock: 10 };

function renderWithContext(ui, { members = [], products = [], checkins = [] } = {}) {
  const mock = localStorageMock();
  if (members.length) mock.setItem('gym_members', JSON.stringify(members));
  if (products.length) mock.setItem('gym_products', JSON.stringify(products));
  if (checkins.length)  mock.setItem('gym_checkins', JSON.stringify(checkins));
  vi.stubGlobal('localStorage', mock);

  return render(
    <GymProvider>
      <UiProvider>{ui}</UiProvider>
    </GymProvider>
  );
}

// ─────────────────────────────────────────────────────────────
describe('Fase 3 — Integración UI', () => {

  beforeEach(() => vi.stubGlobal('localStorage', localStorageMock()));

  // ── Test 1: Dashboard muestra métricas correctas ──
  it('Dashboard muestra contadores correctos según los datos del contexto', () => {
    renderWithContext(
      <Dashboard openBottomSheet={() => {}} />,
      { members: [SEED_MEMBER], checkins: [{ memberId: 'm1', time: '08:00', date: '2026-05-27' }] }
    );

    // 1 checkin de hoy — usamos getAllByText porque '1' puede aparecer varias veces
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThan(0);
    // El miembro tiene -10000 de deuda — buscar con regex por el monto
    expect(screen.getByText(/10.000|10,000/)).toBeTruthy();
  });

  // ── Test 2: Botón "Entrar" registra asistencia y se deshabilita ──
  it('Botón Entrar en tarjeta frecuente registra asistencia y cambia estado', () => {
    renderWithContext(
      <Dashboard openBottomSheet={() => {}} />,
      { members: [SEED_MEMBER] }
    );

    const btn = screen.getByText('Entrar');
    expect(btn).toBeTruthy();

    act(() => { fireEvent.click(btn); });

    // Después del click el botón debería cambiar a "Listo"
    expect(screen.getByText('Listo')).toBeTruthy();
  });

  // ── Test 3: Members renderiza la lista filtrada ──
  it('Members renderiza el socio en la lista y abre BottomSheet al hacer click', () => {
    const openMock = vi.fn();
    renderWithContext(
      <Members openBottomSheet={openMock} />,
      { members: [SEED_MEMBER] }
    );

    expect(screen.getByText('Carlos Prueba')).toBeTruthy();

    act(() => { fireEvent.click(screen.getByText('Carlos Prueba')); });

    expect(openMock).toHaveBeenCalledWith('m1');
  });

  // ── Test 4: BottomSheet muestra datos correctos del socio ──
  it('BottomSheet muestra nombre y balance del socio correctamente', () => {
    renderWithContext(
      <BottomSheet memberId="m1" onClose={() => {}} />,
      { members: [SEED_MEMBER], products: [SEED_PRODUCT] }
    );

    expect(screen.getByText('Carlos Prueba')).toBeTruthy();
    // El balance se muestra como '$' + número separado, buscamos el monto con regex
    expect(screen.getByText(/-\$10[.,]000/)).toBeTruthy();
  });

  // ── Test 5: BottomSheet — asistencia ya registrada deshabilita botón ──
  it('BottomSheet deshabilita 1-Clic si el socio ya fue registrado hoy', () => {
    const today = new Date().toISOString().split('T')[0];
    renderWithContext(
      <BottomSheet memberId="m1" onClose={() => {}} />,
      {
        members: [SEED_MEMBER],
        checkins: [{ memberId: 'm1', time: '07:00', date: today }],
      }
    );

    const btn = screen.getByText('Ya registrado');
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });

});
