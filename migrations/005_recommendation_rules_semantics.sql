-- hours = ⌛ Docencia directa | subjects = ✍🏼 Horas semanales (registro Excel)
UPDATE public.recommendation_rules SET hours = 8, subjects = 15, default_hours = 8, default_subjects = 15 WHERE rule_key = 'form_doctorado';
UPDATE public.recommendation_rules SET hours = 12, subjects = 7, default_hours = 12, default_subjects = 7 WHERE rule_key = 'form_maestria';
UPDATE public.recommendation_rules SET hours = 13, subjects = 13, default_hours = 13, default_subjects = 13 WHERE rule_key = 'form_pedagogicos';
UPDATE public.recommendation_rules SET hours = 4, subjects = 4, default_hours = 4, default_subjects = 4 WHERE rule_key = 'admin_decano_vicerrector_doctorado';
UPDATE public.recommendation_rules SET hours = 6, subjects = 6, default_hours = 6, default_subjects = 6 WHERE rule_key = 'admin_dir_depto_pregrado';
UPDATE public.recommendation_rules SET hours = 6, subjects = 6, default_hours = 6, default_subjects = 6 WHERE rule_key = 'admin_dir_posgrado_2';
UPDATE public.recommendation_rules SET hours = 7, subjects = 9, default_hours = 7, default_subjects = 9 WHERE rule_key = 'admin_dir_posgrado_1';
UPDATE public.recommendation_rules SET hours = 13, subjects = 6, default_hours = 13, default_subjects = 6 WHERE rule_key = 'admin_coord_area';
UPDATE public.recommendation_rules SET hours = 6, subjects = 17, default_hours = 6, default_subjects = 17 WHERE rule_key = 'inv_1p_2c';
UPDATE public.recommendation_rules SET hours = 4, subjects = 22, default_hours = 4, default_subjects = 22 WHERE rule_key = 'inv_2p';
UPDATE public.recommendation_rules SET hours = 10, subjects = 11, default_hours = 10, default_subjects = 11 WHERE rule_key = 'inv_1p';
UPDATE public.recommendation_rules SET hours = 6, subjects = 12, default_hours = 6, default_subjects = 12 WHERE rule_key = 'inv_3c';
UPDATE public.recommendation_rules SET hours = 9, subjects = 12, default_hours = 9, default_subjects = 12 WHERE rule_key = 'inv_2c';
UPDATE public.recommendation_rules SET hours = 13, subjects = 6, default_hours = 13, default_subjects = 6 WHERE rule_key = 'inv_1c';
UPDATE public.recommendation_rules SET hours = 16, subjects = 16, default_hours = 16, default_subjects = 16 WHERE rule_key = 'docencia_sin_proyecto';
