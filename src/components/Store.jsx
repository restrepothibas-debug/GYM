import { useState, useContext } from 'react';
import { Package, Plus, X, ShoppingCart } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import AddProductModal from './AddProductModal';

function Store() {
  const { products, members, sellProduct } = useContext(GymContext);
  const [sellModal, setSellModal] = useState(null); // { product }
  const [selectedMember, setSelectedMember] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('monedero');
  const [addProductOpen, setAddProductOpen] = useState(false);

  const handleSell = () => {
    if (!selectedMember) return;
    sellProduct(sellModal.id, selectedMember, paymentMethod);
    setSellModal(null);
    setSelectedMember('');
    setPaymentMethod('monedero');
  };

  return (
    <div className="space-y-3 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Cafetería & Suplementos</h3>
        <button
          onClick={() => setAddProductOpen(true)}
          className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-indigo-500 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all"
        >
          <Plus className="w-3 h-3 text-indigo-400" /> Nuevo Stock
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 max-h-[58vh] overflow-y-auto pr-1">
        {products.length === 0 ? (
          <p className="col-span-2 text-[10px] text-slate-500 py-6 text-center">No hay productos. Agrega el primero.</p>
        ) : (
          products.map(p => {
            const isLowStock = p.stock <= 5;
            return (
              <div key={p.id} className="bg-slate-900 border border-slate-800/80 rounded-2xl p-3.5 flex flex-col justify-between space-y-3.5">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                      <Package className="w-3.5 h-3.5" />
                    </span>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isLowStock ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-950 text-slate-400'}`}>
                      Stock: {p.stock}
                    </span>
                  </div>
                  <h4 className="font-bold text-[11px] text-slate-200 mt-2 line-clamp-2">{p.name}</h4>
                  <span className="font-extrabold text-xs text-indigo-400 mt-1 block">${p.price.toLocaleString()}</span>
                </div>
                <button
                  onClick={() => { setSellModal(p); setSelectedMember(''); }}
                  disabled={p.stock === 0}
                  className="w-full h-8 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/30 text-[9px] font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {p.stock === 0 ? 'Sin Stock' : 'Asignar / Vender'}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL VENTA */}
      {sellModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="text-indigo-400 w-4 h-4" />
                <h3 className="font-extrabold text-xs text-slate-100">Asignar: {sellModal.name}</h3>
              </div>
              <button onClick={() => setSellModal(null)} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3.5">
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Paso 1: Selecciona un Socio *</label>
                <select
                  value={selectedMember}
                  onChange={e => setSelectedMember(e.target.value)}
                  className="w-full h-10 px-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
                >
                  <option value="">-- Elige un socio --</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Paso 2: Método de Cobro *</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full h-10 px-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
                >
                  <option value="monedero">Cargar a su Monedero (Afecta saldo)</option>
                  <option value="efectivo">Pago en Efectivo (Ingresa a Caja directo)</option>
                  <option value="tarjeta">Pago con Tarjeta (Ingresa a Caja directo)</option>
                </select>
              </div>
              <button
                onClick={handleSell}
                disabled={!selectedMember}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-xs shadow-lg"
              >
                Completar Venta — ${sellModal.price.toLocaleString()}
              </button>
            </div>
          </div>
        </div>
      )}

      {addProductOpen && <AddProductModal onClose={() => setAddProductOpen(false)} />}
    </div>
  );
}

export default Store;
