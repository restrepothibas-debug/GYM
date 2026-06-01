import { useRef, useContext } from 'react';
import { Package, X } from 'lucide-react';
import { GymContext } from '../context/GymContext';

function AddProductModal({ onClose }) {
  const { setProducts } = useContext(GymContext);
  const nameRef  = useRef();
  const priceRef = useRef();
  const stockRef = useRef();

  const handleSave = (e) => {
    e.preventDefault();
    const newProduct = {
      id:    crypto.randomUUID(),
      name:  nameRef.current.value.trim(),
      price: parseFloat(priceRef.current.value),
      stock: parseInt(stockRef.current.value),
    };
    setProducts(prev => [newProduct, ...prev]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="text-indigo-400 w-4 h-4" />
            <h3 className="font-extrabold text-xs text-slate-100">Crear Producto</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4">
          <div className="space-y-1">
            <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Nombre del Producto *</label>
            <input ref={nameRef} type="text" required placeholder="Ej. Gatorade Fresa 500ml"
              className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Precio Venta ($) *</label>
              <input ref={priceRef} type="number" required placeholder="Ej. 4000"
                className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Stock Inicial *</label>
              <input ref={stockRef} type="number" required placeholder="Ej. 24"
                className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>
          <button type="submit"
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs shadow-lg shadow-indigo-600/10 active:scale-95 transition-all">
            Registrar Inventario
          </button>
        </form>
      </div>
    </div>
  );
}

export default AddProductModal;
