-- Purga todas las agendas enviadas/aprobadas (ejecutar una vez en QA o producción)
DELETE FROM public.agenda_comments;
DELETE FROM public.agendas;
DELETE FROM public.agenda_views;
