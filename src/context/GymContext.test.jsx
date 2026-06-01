import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useContext } from 'react';
import { GymProvider, GymContext } from './GymContext';

// Un componente de prueba para interactuar con el contexto
function TestComponent() {
  const { members, products, cashFlow, sellProduct, addMember } = useContext(GymContext);
  
  return (
    <div>
      <span data-testid="members-count">{members.length}</span>
      <span data-testid="products-count">{products.length}</span>
      <span data-testid="cash-count">{cashFlow.length}</span>
      {members[0] && <span data-testid="member-balance">{members[0].balance}</span>}
      {products[0] && <span data-testid="product-stock">{products[0].stock}</span>}

      <button onClick={() => addMember({ name: 'Nuevo', doc: '123' }, 20000, 0)} data-testid="btn-add-member">Add Member</button>
      <button onClick={() => sellProduct('p1', 'm1', 'monedero')} data-testid="btn-sell-wallet">Sell Wallet</button>
      <button onClick={() => sellProduct('p1', 'm1', 'efectivo')} data-testid="btn-sell-cash">Sell Cash</button>
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

  it('sellProduct debe descontar stock y afectar el monedero o cashflow según el método', () => {
    // Estado inicial pre-cargado
    localStorage.setItem('gym_members', JSON.stringify([{ id: 'm1', name: 'Socio 1', balance: 0 }]));
    localStorage.setItem('gym_products', JSON.stringify([{ id: 'p1', name: 'Prod 1', price: 4000, stock: 10 }]));
    
    render(
      <GymProvider>
        <TestComponent />
      </GymProvider>
    );

    // Venta con monedero
    act(() => {
      screen.getByTestId('btn-sell-wallet').click();
    });

    expect(screen.getByTestId('product-stock').textContent).toBe('9'); // Stock bajó 1
    expect(screen.getByTestId('member-balance').textContent).toBe('-4000'); // Monedero restó el precio
    expect(screen.getByTestId('cash-count').textContent).toBe('0'); // No entró efectivo directo

    // Venta con efectivo
    act(() => {
      screen.getByTestId('btn-sell-cash').click();
    });

    expect(screen.getByTestId('product-stock').textContent).toBe('8'); // Stock bajó otro
    expect(screen.getByTestId('member-balance').textContent).toBe('-4000'); // Balance no cambió más
    expect(screen.getByTestId('cash-count').textContent).toBe('1'); // Registró ingreso a caja
  });
});
