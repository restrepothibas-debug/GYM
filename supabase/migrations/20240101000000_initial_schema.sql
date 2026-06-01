-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Socios (members)
CREATE TABLE public.members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    doc TEXT UNIQUE NOT NULL,
    phone TEXT,
    balance NUMERIC DEFAULT 0,
    plan TEXT CHECK (plan IN ('diario', 'semanal', 'mensual', 'trimestral', 'anual')),
    expiry_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabla de Asistencias (attendance_log)
CREATE TABLE public.attendance_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    checkin_date DATE DEFAULT current_date NOT NULL,
    checkin_time TIME DEFAULT current_time NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabla de Productos (products)
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabla de Compras de Socios (member_purchases)
CREATE TABLE public.member_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    price_paid NUMERIC NOT NULL,
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Tabla de Flujo de Caja (cash_flow)
CREATE TABLE public.cash_flow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT CHECK (type IN ('ingreso', 'egreso')) NOT NULL,
    amount NUMERIC NOT NULL,
    description TEXT,
    date DATE DEFAULT current_date NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flow ENABLE ROW LEVEL SECURITY;

-- Crear políticas para permitir acceso CRUD a usuarios autenticados (entrenadores/admin)
-- Members
CREATE POLICY "Enable read access for authenticated users" ON public.members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.members FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated users" ON public.members FOR DELETE TO authenticated USING (true);

-- Attendance Log
CREATE POLICY "Enable read access for authenticated users" ON public.attendance_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.attendance_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.attendance_log FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated users" ON public.attendance_log FOR DELETE TO authenticated USING (true);

-- Products
CREATE POLICY "Enable read access for authenticated users" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated users" ON public.products FOR DELETE TO authenticated USING (true);

-- Member Purchases
CREATE POLICY "Enable read access for authenticated users" ON public.member_purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.member_purchases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.member_purchases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated users" ON public.member_purchases FOR DELETE TO authenticated USING (true);

-- Cash Flow
CREATE POLICY "Enable read access for authenticated users" ON public.cash_flow FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.cash_flow FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.cash_flow FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated users" ON public.cash_flow FOR DELETE TO authenticated USING (true);

-- Insertar algunos productos de ejemplo (Opcional, pero util para pruebas)
INSERT INTO public.products (name, price, stock) VALUES
('Gatorade Fresa 500ml', 4000, 15),
('Proteína Whey 1Lb', 85000, 6),
('Agua Cristal 600ml', 2000, 40),
('Barra Energética', 3500, 22);
