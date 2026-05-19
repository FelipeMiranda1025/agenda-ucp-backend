-- Semilla de reglas de recomendación (edición manual / docencia directa)
INSERT INTO public.recommendation_rules
  (category, rule_key, label, hours, subjects, default_hours, default_subjects, priority, active)
VALUES
  ('formacion', 'form_doctorado', 'Estudios doctorado', 8, 15, 8, 15, 100, true),
  ('formacion', 'form_maestria', 'Estudios maestría', 12, 7, 12, 7, 90, true),
  ('formacion', 'form_pedagogicos', 'Estudios Pedagógicos', 13, 13, 13, 13, 80, true),
  ('administrativas', 'admin_decano_vicerrector_doctorado', 'Decano / Vicerrector / Director doctorado', 4, 4, 4, 4, 70, true),
  ('administrativas', 'admin_dir_depto_pregrado', 'Director departamento o pregrado', 6, 6, 6, 6, 60, true),
  ('administrativas', 'admin_dir_posgrado_2', 'Director programa posgrado (2 o más)', 6, 6, 6, 6, 55, true),
  ('administrativas', 'admin_dir_posgrado_1', 'Director programa posgrado (1)', 7, 9, 7, 9, 50, true),
  ('administrativas', 'admin_coord_area', 'Coordinador de área', 13, 6, 13, 6, 45, true),
  ('investigacion', 'inv_1p_2c', '1 Investigador principal + 2 Co-investigadores', 6, 17, 6, 17, 40, true),
  ('investigacion', 'inv_2p', '2 Investigadores principales', 4, 22, 4, 22, 35, true),
  ('investigacion', 'inv_1p', '1 Investigador principal', 10, 11, 10, 11, 30, true),
  ('investigacion', 'inv_3c', '3 Co-investigadores', 6, 12, 6, 12, 25, true),
  ('investigacion', 'inv_2c', '2 Co-investigadores', 9, 12, 9, 12, 20, true),
  ('investigacion', 'inv_1c', '1 Co-investigador', 13, 6, 13, 6, 15, true)
ON CONFLICT (category, rule_key) DO NOTHING;
