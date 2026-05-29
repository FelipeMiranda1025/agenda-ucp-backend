-- recommendation_rules: allow decimal values (e.g. 0.5, 1.5, 2.5)
ALTER TABLE public.recommendation_rules
  ALTER COLUMN hours TYPE NUMERIC(10,2) USING hours::NUMERIC(10,2),
  ALTER COLUMN subjects TYPE NUMERIC(10,2) USING subjects::NUMERIC(10,2),
  ALTER COLUMN default_hours TYPE NUMERIC(10,2) USING default_hours::NUMERIC(10,2),
  ALTER COLUMN default_subjects TYPE NUMERIC(10,2) USING default_subjects::NUMERIC(10,2);

