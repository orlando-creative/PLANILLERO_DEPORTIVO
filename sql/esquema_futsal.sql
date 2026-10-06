-- ============================================================================
-- ESQUEMA COMPLETO Y DEFINITIVO DE BASE DE DATOS PARA PLANILLERO DE FUTSAL
-- U.E. LUZ DEL MUNDO A (COMPATIBLE CON TABLAS YA CREADAS Y RE-EJECUCION SEGURA)
-- Ejecutar todo este script en: Supabase Dashboard -> SQL Editor -> Run
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. TABLA DE PERFILES
CREATE TABLE IF NOT EXISTS public.perfiles (
  usuario_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL DEFAULT '',
  rol TEXT NOT NULL DEFAULT 'espectador' CHECK (rol IN ('administrador', 'espectador')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. CONFIGURACION FINANCIERA DEL CAMPEONATO (TARIFAS BASE)
CREATE TABLE IF NOT EXISTS public.configuracion_finanzas (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  multa_amarilla NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
  multa_roja NUMERIC(10, 2) NOT NULL DEFAULT 20.00,
  costo_arbitraje NUMERIC(10, 2) NOT NULL DEFAULT 30.00,
  monto_inscripcion NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.configuracion_finanzas (id, multa_amarilla, multa_roja, costo_arbitraje, monto_inscripcion)
VALUES (1, 10.00, 20.00, 30.00, 50.00)
ON CONFLICT (id) DO NOTHING;

-- 3. TABLA DE EQUIPOS (CON MIGRACION SEGURA DE COLUMNAS)
CREATE TABLE IF NOT EXISTS public.equipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  genero TEXT NOT NULL CHECK (genero IN ('varones', 'mujeres')),
  monto_inscripcion NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
  inscripcion_pagada BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nombre, categoria, genero)
);

-- Agregar columnas en caso de que la tabla ya existiese previamente
ALTER TABLE public.equipos ADD COLUMN IF NOT EXISTS monto_inscripcion NUMERIC(10, 2) NOT NULL DEFAULT 50.00;
ALTER TABLE public.equipos ADD COLUMN IF NOT EXISTS inscripcion_pagada BOOLEAN NOT NULL DEFAULT false;

-- 4. TABLA DE JUGADORES
CREATE TABLE IF NOT EXISTS public.jugadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id UUID NOT NULL REFERENCES public.equipos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  dorsal SMALLINT CHECK (dorsal BETWEEN 1 AND 99),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (equipo_id, dorsal)
);

-- 5. TABLA DE PARTIDOS (CON MIGRACION SEGURA DE COLUMNAS)
CREATE TABLE IF NOT EXISTS public.partidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fase TEXT NOT NULL,
  fecha_hora TIMESTAMPTZ NOT NULL,
  categoria TEXT NOT NULL,
  genero TEXT NOT NULL CHECK (genero IN ('varones', 'mujeres')),
  equipo_local_id UUID NOT NULL REFERENCES public.equipos(id) ON DELETE CASCADE,
  equipo_visitante_id UUID NOT NULL REFERENCES public.equipos(id) ON DELETE CASCADE,
  capitan_local_id UUID REFERENCES public.jugadores(id) ON DELETE SET NULL,
  capitan_visitante_id UUID REFERENCES public.jugadores(id) ON DELETE SET NULL,
  goles_local SMALLINT NOT NULL DEFAULT 0 CHECK (goles_local >= 0),
  goles_visitante SMALLINT NOT NULL DEFAULT 0 CHECK (goles_visitante >= 0),
  costo_arbitraje NUMERIC(10, 2) NOT NULL DEFAULT 30.00,
  arbitraje_pagado BOOLEAN NOT NULL DEFAULT false,
  estado TEXT NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado', 'en_juego', 'descanso', 'finalizado', 'suspendido', 'postergado', 'tiempo_extra', 'penales')),
  periodo SMALLINT NOT NULL DEFAULT 1 CHECK (periodo BETWEEN 1 AND 4),
  reloj_segundos INTEGER NOT NULL DEFAULT 900 CHECK (reloj_segundos >= 0),
  reloj_iniciado_en TIMESTAMPTZ,
  penales_local SMALLINT DEFAULT NULL,
  penales_visitante SMALLINT DEFAULT NULL,
  penales_local_tiros JSONB NOT NULL DEFAULT '[]'::jsonb,
  penales_visitante_tiros JSONB NOT NULL DEFAULT '[]'::jsonb,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (equipo_local_id <> equipo_visitante_id)
);

-- Agregar columnas en caso de que la tabla ya existiese previamente
ALTER TABLE public.partidos ADD COLUMN IF NOT EXISTS costo_arbitraje NUMERIC(10, 2) NOT NULL DEFAULT 30.00;
ALTER TABLE public.partidos ADD COLUMN IF NOT EXISTS arbitraje_pagado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.partidos ADD COLUMN IF NOT EXISTS penales_local SMALLINT DEFAULT NULL;
ALTER TABLE public.partidos ADD COLUMN IF NOT EXISTS penales_visitante SMALLINT DEFAULT NULL;
ALTER TABLE public.partidos ADD COLUMN IF NOT EXISTS penales_local_tiros JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.partidos ADD COLUMN IF NOT EXISTS penales_visitante_tiros JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.partidos ALTER COLUMN reloj_segundos SET DEFAULT 900;
UPDATE public.partidos
SET reloj_segundos = 900
WHERE estado = 'programado' AND periodo = 1 AND reloj_segundos = 1200;

-- 6. TABLA DE EVENTOS EN CANCHA (GOLES Y TARJETAS)
CREATE TABLE IF NOT EXISTS public.eventos_partido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partido_id UUID NOT NULL REFERENCES public.partidos(id) ON DELETE CASCADE,
  equipo_id UUID NOT NULL REFERENCES public.equipos(id) ON DELETE CASCADE,
  jugador_id UUID REFERENCES public.jugadores(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('gol', 'amarilla', 'roja')),
  periodo SMALLINT NOT NULL CHECK (periodo BETWEEN 1 AND 4),
  segundo_partido INTEGER NOT NULL DEFAULT 0 CHECK (segundo_partido >= 0),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. TABLA DE SANCIONES Y MULTAS
CREATE TABLE IF NOT EXISTS public.sanciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL UNIQUE REFERENCES public.eventos_partido(id) ON DELETE CASCADE,
  partido_id UUID NOT NULL REFERENCES public.partidos(id) ON DELETE CASCADE,
  jugador_id UUID NOT NULL REFERENCES public.jugadores(id) ON DELETE CASCADE,
  tarjeta TEXT NOT NULL CHECK (tarjeta IN ('amarilla', 'roja')),
  monto NUMERIC(10, 2) NOT NULL DEFAULT 10.00 CHECK (monto >= 0),
  pagada BOOLEAN NOT NULL DEFAULT false,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'suspendida', 'cumplida', 'retirada')),
  nota TEXT NOT NULL DEFAULT '',
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. FUNCION VERIFICADORA DE ADMINISTRADOR
CREATE OR REPLACE FUNCTION public.es_administrador()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE usuario_id = (SELECT auth.uid()) AND rol = 'administrador'
  );
$$;

-- 9. TRIGGER DE ACTUALIZACION DE GOLES Y GENERACION DE SANCION
CREATE OR REPLACE FUNCTION public.sincronizar_evento_partido()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_partido_id UUID;
  v_monto NUMERIC(10, 2);
  v_cfg RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_partido_id := OLD.partido_id;
  ELSE
    v_partido_id := NEW.partido_id;
  END IF;

  UPDATE public.partidos p SET
    goles_local = (SELECT count(*) FROM public.eventos_partido e WHERE e.partido_id = v_partido_id AND e.tipo = 'gol' AND e.equipo_id = p.equipo_local_id),
    goles_visitante = (SELECT count(*) FROM public.eventos_partido e WHERE e.partido_id = v_partido_id AND e.tipo = 'gol' AND e.equipo_id = p.equipo_visitante_id)
  WHERE p.id = v_partido_id;

  IF TG_OP = 'INSERT' AND NEW.tipo IN ('amarilla', 'roja') AND NEW.jugador_id IS NOT NULL THEN
    SELECT multa_amarilla, multa_roja INTO v_cfg FROM public.configuracion_finanzas WHERE id = 1;
    IF NEW.tipo = 'amarilla' THEN
      v_monto := coalesce(v_cfg.multa_amarilla, 10.00);
    ELSE
      v_monto := coalesce(v_cfg.multa_roja, 20.00);
    END IF;

    INSERT INTO public.sanciones (evento_id, partido_id, jugador_id, tarjeta, monto, pagada, estado)
    VALUES (NEW.id, NEW.partido_id, NEW.jugador_id, NEW.tipo, v_monto, false, 'pendiente')
    ON CONFLICT (evento_id) DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS evento_actualiza_partido ON public.eventos_partido;
CREATE TRIGGER evento_actualiza_partido
AFTER INSERT OR UPDATE OR DELETE ON public.eventos_partido
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_evento_partido();

-- 10. VISTAS DE POSICIONES Y GOLEADORES
CREATE OR REPLACE VIEW public.goleadores WITH (security_invoker = true) AS
SELECT j.id AS jugador_id, j.nombre AS jugador, j.dorsal, e.id AS equipo_id, e.nombre AS equipo, e.categoria, e.genero,
       count(ev.id)::INTEGER AS goles
FROM public.jugadores j
JOIN public.equipos e ON e.id = j.equipo_id
JOIN public.eventos_partido ev ON ev.jugador_id = j.id AND ev.tipo = 'gol'
JOIN public.partidos p ON p.id = ev.partido_id AND p.estado = 'finalizado'
GROUP BY j.id, j.nombre, j.dorsal, e.id, e.nombre, e.categoria, e.genero;

CREATE OR REPLACE VIEW public.posiciones WITH (security_invoker = true) AS
WITH actuaciones AS (
  SELECT p.equipo_local_id AS equipo_id, p.categoria, p.genero, p.goles_local AS gf, p.goles_visitante AS gc,
         CASE WHEN p.goles_local > p.goles_visitante THEN 3 WHEN p.goles_local = p.goles_visitante THEN 1 ELSE 0 END AS puntos
  FROM public.partidos p WHERE p.estado = 'finalizado'
  UNION ALL
  SELECT p.equipo_visitante_id, p.categoria, p.genero, p.goles_visitante, p.goles_local,
         CASE WHEN p.goles_visitante > p.goles_local THEN 3 WHEN p.goles_visitante = p.goles_local THEN 1 ELSE 0 END
  FROM public.partidos p WHERE p.estado = 'finalizado'
), totales AS (
  SELECT equipo_id, categoria, genero, count(*)::INTEGER AS pj,
         count(*) FILTER (WHERE puntos = 3)::INTEGER AS pg,
         count(*) FILTER (WHERE puntos = 1)::INTEGER AS pe,
         count(*) FILTER (WHERE puntos = 0)::INTEGER AS pp,
         sum(gf)::INTEGER AS gf, sum(gc)::INTEGER AS gc, sum(puntos)::INTEGER AS pts
  FROM actuaciones GROUP BY equipo_id, categoria, genero
)
SELECT e.id AS equipo_id, e.nombre AS equipo, e.categoria, e.genero,
       coalesce(t.pj, 0) AS pj, coalesce(t.pg, 0) AS pg, coalesce(t.pe, 0) AS pe,
       coalesce(t.pp, 0) AS pp, coalesce(t.gf, 0) AS gf, coalesce(t.gc, 0) AS gc,
       coalesce(t.gf, 0) - coalesce(t.gc, 0) AS dg, coalesce(t.pts, 0) AS pts
FROM public.equipos e
LEFT JOIN totales t ON t.equipo_id = e.id AND t.categoria = e.categoria AND t.genero = e.genero
WHERE e.activo;

-- 11. ASIGNACION AUTOMATICA DE ADMINISTRADOR AL PRIMER USUARIO
CREATE OR REPLACE FUNCTION public.manejar_nuevo_usuario()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.perfiles WHERE rol = 'administrador') THEN
    INSERT INTO public.perfiles (usuario_id, nombre, rol)
    VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)), 'administrador')
    ON CONFLICT (usuario_id) DO UPDATE SET rol = 'administrador';
  ELSE
    INSERT INTO public.perfiles (usuario_id, nombre, rol)
    VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)), 'espectador')
    ON CONFLICT (usuario_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.manejar_nuevo_usuario();

-- 12. PROMOVER ADMIN POR EMAIL
CREATE OR REPLACE FUNCTION public.asignar_admin_por_email(correo TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(correo);
  IF v_user_id IS NULL THEN
    RETURN 'No se encontro usuario con el correo: ' || correo;
  END IF;
  INSERT INTO public.perfiles (usuario_id, nombre, rol)
  VALUES (v_user_id, split_part(correo, '@', 1), 'administrador')
  ON CONFLICT (usuario_id) DO UPDATE SET rol = 'administrador';
  RETURN 'Usuario ' || correo || ' asignado como Administrador.';
END;
$$;

-- 13. REINICIAR CAMPEONATO (ELIMINA TODOS LOS PARTIDOS Y ESTADISTICAS)
CREATE OR REPLACE FUNCTION public.reiniciar_campeonato()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador puede reiniciar el campeonato.';
  END IF;
  DELETE FROM public.partidos;
  RETURN 'Campeonato reiniciado: todos los partidos y estadisticas fueron eliminados.';
END;
$$;

-- 14. POLÍTICAS DE SEGURIDAD (RLS) - LIMPIEZA PREVIA SEGURA
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_finanzas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jugadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_partido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perfiles_lectura ON public.perfiles;
DROP POLICY IF EXISTS finanzas_lectura ON public.configuracion_finanzas;
DROP POLICY IF EXISTS equipos_lectura ON public.equipos;
DROP POLICY IF EXISTS jugadores_lectura ON public.jugadores;
DROP POLICY IF EXISTS partidos_lectura ON public.partidos;
DROP POLICY IF EXISTS eventos_lectura ON public.eventos_partido;
DROP POLICY IF EXISTS sanciones_lectura ON public.sanciones;

DROP POLICY IF EXISTS perfiles_admin ON public.perfiles;
DROP POLICY IF EXISTS finanzas_admin ON public.configuracion_finanzas;
DROP POLICY IF EXISTS equipos_admin ON public.equipos;
DROP POLICY IF EXISTS jugadores_admin ON public.jugadores;
DROP POLICY IF EXISTS partidos_admin ON public.partidos;
DROP POLICY IF EXISTS eventos_admin ON public.eventos_partido;
DROP POLICY IF EXISTS sanciones_admin ON public.sanciones;

-- Creación de políticas
CREATE POLICY perfiles_lectura ON public.perfiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY finanzas_lectura ON public.configuracion_finanzas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY equipos_lectura ON public.equipos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY jugadores_lectura ON public.jugadores FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY partidos_lectura ON public.partidos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY eventos_lectura ON public.eventos_partido FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY sanciones_lectura ON public.sanciones FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY perfiles_admin ON public.perfiles FOR ALL TO authenticated USING (public.es_administrador()) WITH CHECK (public.es_administrador());
CREATE POLICY finanzas_admin ON public.configuracion_finanzas FOR ALL TO authenticated USING (public.es_administrador()) WITH CHECK (public.es_administrador());
CREATE POLICY equipos_admin ON public.equipos FOR ALL TO authenticated USING (public.es_administrador()) WITH CHECK (public.es_administrador());
CREATE POLICY jugadores_admin ON public.jugadores FOR ALL TO authenticated USING (public.es_administrador()) WITH CHECK (public.es_administrador());
CREATE POLICY partidos_admin ON public.partidos FOR ALL TO authenticated USING (public.es_administrador()) WITH CHECK (public.es_administrador());
CREATE POLICY eventos_admin ON public.eventos_partido FOR ALL TO authenticated USING (public.es_administrador()) WITH CHECK (public.es_administrador());
CREATE POLICY sanciones_admin ON public.sanciones FOR ALL TO authenticated USING (public.es_administrador()) WITH CHECK (public.es_administrador());

-- 15. PERMISOS
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.es_administrador TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_admin_por_email TO authenticated;
GRANT EXECUTE ON FUNCTION public.reiniciar_campeonato TO authenticated;
