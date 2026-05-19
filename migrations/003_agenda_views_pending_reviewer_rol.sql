-- Nivel de revisión pendiente: id_rol del supervisor que debe actuar (2=director, 3=decano, 4=vicerrector).
ALTER TABLE public.agenda_views
  ADD COLUMN IF NOT EXISTS pending_reviewer_rol INT REFERENCES public.roles(id);

CREATE INDEX IF NOT EXISTS idx_agenda_views_pending_reviewer_rol
  ON public.agenda_views (status, pending_reviewer_rol);

-- Reasignar cola de revisión para agendas ya en pending (docente -> director)
UPDATE public.agenda_views av
SET pending_reviewer_rol = sup.id_rol
FROM public.users owner
JOIN public.user_hierarchy h ON h.user_id = owner.id
JOIN public.users sup ON sup.id = h.supervisor_id
WHERE av.user_cc = owner.cc
  AND av.status = 'pending'
  AND av.pending_reviewer_rol IS NULL;

-- Agendas marcadas approved por director pero que debían pasar a decano: reabrir cola decano
UPDATE public.agenda_views av
SET status = 'pending',
    pending_reviewer_rol = 3,
    reviewer_cc = NULL,
    reviewer_comment = NULL,
    reviewed_at = NULL
FROM public.users owner,
     public.users r
WHERE av.user_cc = owner.cc
  AND owner.id_rol = 1
  AND av.status = 'approved'
  AND av.reviewer_cc IS NOT NULL
  AND r.cc = av.reviewer_cc
  AND r.id_rol = 2;

-- Reenvíos en pending: limpiar datos del retorno anterior
UPDATE public.agenda_views
SET reviewer_cc = NULL,
    reviewer_comment = NULL,
    reviewed_at = NULL
WHERE status = 'pending'
  AND pending_reviewer_rol IS NOT NULL
  AND reviewer_cc IS NOT NULL;
