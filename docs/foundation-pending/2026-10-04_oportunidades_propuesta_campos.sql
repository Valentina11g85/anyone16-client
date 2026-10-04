-- AnyOne16 · Oportunidades · campos de propuesta + unicidad de contratación
-- Migración ADITIVA y no destructiva. Ejecutar en Foundation (SQL editor).
-- No toca Favores, pagos, autor/comprador/proveedor/precio/estado ni RLS.

-- 1. Campos opcionales de la propuesta (propuestas antiguas quedan en NULL).
ALTER TABLE public.service_offers
  ADD COLUMN IF NOT EXISTS availability text
    CHECK (availability IS NULL OR length(availability) <= 500),
  ADD COLUMN IF NOT EXISTS experience text
    CHECK (experience IS NULL OR length(experience) <= 1000);

-- 2. Una sola contratación por propuesta aceptada (también bajo concurrencia).
--    La tabla ya se creó con UNIQUE(accepted_offer_id); esto lo garantiza
--    aunque la restricción no estuviera presente. Falla si ya hubiera duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS service_contracts_accepted_offer_uniq
  ON public.service_contracts (accepted_offer_id);

NOTIFY pgrst, 'reload schema';
