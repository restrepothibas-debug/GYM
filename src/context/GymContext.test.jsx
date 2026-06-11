import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useContext } from 'react';
import { GymProvider, GymContext } from './GymContext';

// Un componente de prueba para interactuar con el contexto
function TestComponent() {
  const { addCheckin, members, products, cashFlow, checkinsToday, sellProduct, addMember, deleteMember } = useContext(GymContext);
  const firstMemberProductCount = Array.isArray(members[0]?.products) ? members[0].products.length : 0;
  
  return (
    <div>
      <span data-testid="members-count">{members.length}</span>
      <span data-testid="products-count">{products.length}</span>
      <span data-testid="cash-count">{cashFlow.length}</span>
      <span data-testid="checkins-count">{checkinsToday.length}</span>
      <span data-testid="member-products-count">{firstMemberProductCount}</span>
      {members[0] && <span data-testid="member-balance">{members[0].balance}</span>}
      {products[0] && <span data-testid="product-stock">{products[0].stock}</span>}

      <button onClick={() => addMember({ name: 'Nuevo', doc: '123' }, 20000, 0)} data-testid="btn-add-member">Add Member</button>
      <button onClick={() => addCheckin('m1')} data-testid="btn-checkin">Checkin</button>
      <button onClick={() => sellProduct('p1', 'm1', 'credito')} data-testid="btn-credit-product">Credit Product</button>
      <button onClick={() => sellProduct('p1', 'm1', 'efectivo')} data-testid="btn-sell-cash">Sell Cash</button>
      <button onClick={() => deleteMember('m1')} data-testid="btn-delete-member">Delete Member</button>
    </div>
  );
}

describe('GymContext (Fase 2 - Lógica de Negocio)', () => {
  beforeEach(() => {
    const localStorageMock = (function () {
      let store = {};
      return {
        getItem(key) {
          return store[key] || null;
        },
        setItem(key, value) {
          store[key] = value.toString();
        },
        clear() {
          store = {};
        },
      };
    })();
    vi.stubGlobal('localStorage', localStorageMock);
    localStorage.clear();
  });

  it('addMember debe agregar un socio y dejar el plan como deuda si no hubo abono', () => {
    render(
      <GymProvider>
        <TestComponent />
      </GymProvider>
    );

    act(() => {
      screen.getByTestId('btn-add-member').click();
    });

    expect(screen.getByTestId('members-count').textContent).toBe('1');
    expect(screen.getByTestId('cash-count').textContent).toBe('0');
    expect(screen.getByTestId('member-balance').textContent).toBe('-20000');
  });

  it('sellProduct debe descontar stock sin afectar saldo y registrar cashflow solo con pago directo', () => {
    // Estado inicial pre-cargado
    localStorage.setItem('gym_members', JSON.stringify([{ id: 'm1', name: 'Socio 1', balance: 0 }]));
    localStorage.setItem('gym_products', JSON.stringify([{ id: 'p1', name: 'Prod 1', price: 4000, stock: 10 }]));
    
    render(
      <GymProvider>
        <TestComponent />
      </GymProvider>
    );

    // Producto a credito: baja stock y queda como deuda de producto, pero no altera members.balance.
    act(() => {
      screen.getByTestId('btn-credit-product').click();
    });

    expect(screen.getByTestId('product-stock').textContent).toBe('9');
    expect(screen.getByTestId('member-balance').textContent).toBe('0');
    expect(screen.getByTestId('cash-count').textContent).toBe('0');

    // Venta con efectivo
    act(() => {
      screen.getByTestId('btn-sell-cash').click();
    });

    expect(screen.getByTestId('product-stock').textContent).toBe('8'); // Stock bajó otro
    expect(screen.getByTestId('member-balance').textContent).toBe('0');
    expect(screen.getByTestId('cash-count').textContent).toBe('1');
  });

  it('addCheckin debe ignorar doble presión para el mismo atleta y día', () => {
    localStorage.setItem('gym_members', JSON.stringify([{ id: 'm1', name: 'Socio 1', balance: 0, attendance: [] }]));

    render(
      <GymProvider>
        <TestComponent />
      </GymProvider>
    );

    act(() => {
      screen.getByTestId('btn-checkin').click();
      screen.getByTestId('btn-checkin').click();
    });

    expect(screen.getByTestId('checkins-count').textContent).toBe('1');
  });

  it('sellProduct debe ignorar doble presión inmediata del mismo producto', () => {
    localStorage.setItem('gym_members', JSON.stringify([{ id: 'm1', name: 'Socio 1', balance: 0, products: [] }]));
    localStorage.setItem('gym_products', JSON.stringify([{ id: 'p1', name: 'Prod 1', price: 4000, stock: 10 }]));

    render(
      <GymProvider>
        <TestComponent />
      </GymProvider>
    );

    act(() => {
      screen.getByTestId('btn-credit-product').click();
      screen.getByTestId('btn-credit-product').click();
    });

    expect(screen.getByTestId('product-stock').textContent).toBe('9');
    expect(screen.getByTestId('member-products-count').textContent).toBe('1');
  });

  it('deleteMember debe ocultar el socio activo', () => {
    localStorage.setItem('gym_members', JSON.stringify([{ id: 'm1', name: 'Socio 1', balance: 0 }]));

    render(
      <GymProvider>
        <TestComponent />
      </GymProvider>
    );

    act(() => {
      screen.getByTestId('btn-delete-member').click();
    });

    expect(screen.getByTestId('members-count').textContent).toBe('0');
  });
});
