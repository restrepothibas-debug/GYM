import { getTodayDateString } from './dateUtils';

export const DEFAULT_MEMBERS = [
  {
    id: '1',
    name: 'Andres Felipe Mendoza',
    doc: '10029384',
    phone: '3124567890',
    balance: -20000,
    plan: 'mensual',
    expiryDate: '2026-06-15',
    attendance: ['2026-05-24', '2026-05-25'],
    products: [],
  },
  {
    id: '2',
    name: 'Camilo Rodriguez',
    doc: '10984732',
    phone: '3159081234',
    balance: 0,
    plan: 'semanal',
    expiryDate: '2026-05-30',
    attendance: ['2026-05-26'],
    products: [],
  },
  {
    id: '3',
    name: 'Diana Carolina Serna',
    doc: '43928123',
    phone: '3204958123',
    balance: 15000,
    plan: 'mensual',
    expiryDate: '2026-06-20',
    attendance: [],
    products: [],
  },
  {
    id: '4',
    name: 'Esteban Gomez',
    doc: '11024567',
    phone: '3004561122',
    balance: -5000,
    plan: 'diario',
    expiryDate: '2026-05-22',
    attendance: ['2026-05-22'],
    products: [],
  },
];

export const DEFAULT_PRODUCTS = [
  { id: 'p1', name: 'Gatorade Fresa 500ml', price: 4000, stock: 15 },
  { id: 'p2', name: 'Proteina Whey 1Lb', price: 85000, stock: 6 },
  { id: 'p3', name: 'Agua Cristal 600ml', price: 2000, stock: 40 },
  { id: 'p4', name: 'Barra Energetica', price: 3500, stock: 22 },
];

export const DEFAULT_CASH_FLOW = [
  {
    id: 'c2',
    type: 'ingreso',
    amount: 20000,
    description: 'Pago Plan Semanal Camilo Rodriguez',
    date: '2026-05-23',
  },
  {
    id: 'c1',
    type: 'ingreso',
    amount: 60000,
    description: 'Inscripcion de Andres Felipe Mendoza',
    date: '2026-05-20',
  },
];

export function getDefaultCheckinsToday() {
  const today = getTodayDateString();
  return [
    { memberId: '2', time: '07:15 AM', date: today },
    { memberId: '1', time: '08:30 AM', date: today },
  ];
}
