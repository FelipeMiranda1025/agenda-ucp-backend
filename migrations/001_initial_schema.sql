-- =====================================================================
-- SISTEMA DE AGENDA DOCENTE — UCP
-- Script consolidado de Base de Datos (PostgreSQL 14+)
-- Versión: 2.0 — Migración Supabase → PostgreSQL puro (Docker)
-- =====================================================================
-- Este script es IDEMPOTENTE: puede ejecutarse múltiples veces sin error.
-- Incluye:
--   1. Extensiones
--   2. Tablas de catálogos
--   3. Tablas de actividades
--   4. Entidades principales (users, subjects, agendas...)
--   5. Tablas de soporte (audit, emails, lineamientos...)
--   6. Funciones y triggers
--   7. Índices
--   8. Datos iniciales (seed)
-- =====================================================================

-- ─── 1. EXTENSIONES ─────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()


-- =====================================================================
-- 2. CATÁLOGOS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.roles (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS public.states (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS public.semester (
  id          SERIAL PRIMARY KEY,
  number      INT  NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS public.faculties (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS public.education_levels (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS public.professional_careers (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  id_faculty  INT REFERENCES public.faculties(id) ON DELETE SET NULL
);


-- =====================================================================
-- 3. ACTIVIDADES (tablas con horas)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.indirect_teaching (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  weekly_hours  NUMERIC NOT NULL DEFAULT 0,
  number_weeks  INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.investigations (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  weekly_hours  INT  NOT NULL DEFAULT 0,
  number_weeks  INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.social_projects (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  weekly_hours  INT  NOT NULL DEFAULT 0,
  number_weeks  INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.teacher_training (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  weekly_hours  INT  NOT NULL DEFAULT 0,
  number_weeks  INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.degree_works (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  number_projects INT DEFAULT 0,
  number_weeks    INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.complementary_activities (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  weekly_hours  INT  NOT NULL DEFAULT 0,
  number_weeks  INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.administrative_activities (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  weekly_hours  INT  NOT NULL DEFAULT 0,
  number_weeks  INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.academic_practices (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  number_students INT  NOT NULL DEFAULT 0,
  number_weeks    INT  NOT NULL DEFAULT 0
);


-- =====================================================================
-- 4. ENTIDADES PRINCIPALES
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.subjects (
  id                      SERIAL PRIMARY KEY,
  name                    TEXT NOT NULL,
  weekly_hours            INT  NOT NULL DEFAULT 0,
  number_weeks            INT  NOT NULL DEFAULT 0,
  id_semester             INT REFERENCES public.semester(id)             ON DELETE SET NULL,
  id_education_level      INT REFERENCES public.education_levels(id)     ON DELETE SET NULL,
  id_state                INT REFERENCES public.states(id)               ON DELETE SET NULL,
  id_faculty              INT REFERENCES public.faculties(id)            ON DELETE SET NULL,
  id_professional_career  INT REFERENCES public.professional_careers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.users (
  id                      SERIAL PRIMARY KEY,
  first_name              TEXT NOT NULL,
  second_name             TEXT DEFAULT '',
  first_last_name         TEXT NOT NULL,
  second_last_name        TEXT DEFAULT '',
  cc                      TEXT NOT NULL UNIQUE,
  email                   TEXT NOT NULL UNIQUE,
  password                TEXT NOT NULL,           -- SHA-256 (migrar a bcrypt en backend)
  id_rol                  INT  NOT NULL REFERENCES public.roles(id),
  id_state                INT  NOT NULL REFERENCES public.states(id),
  id_faculty              INT REFERENCES public.faculties(id)            ON DELETE SET NULL,
  id_professional_career  INT REFERENCES public.professional_careers(id) ON DELETE SET NULL
);

-- Jerarquía de supervisión
CREATE TABLE IF NOT EXISTS public.user_hierarchy (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  supervisor_id INT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Agendas confirmadas (snapshot por subfunción)
CREATE TABLE IF NOT EXISTS public.agendas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INT  NOT NULL,
  docente_cc      TEXT NOT NULL,
  subfunction_id  TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_horas     INT  NOT NULL DEFAULT 0,
  semester_id     INT,
  confirmed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vista consolidada de agenda (flujo de aprobación jerárquica)
CREATE TABLE IF NOT EXISTS public.agenda_views (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_cc           TEXT NOT NULL,
  records           JSONB NOT NULL DEFAULT '[]'::jsonb,
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|returned
  reviewer_cc       TEXT,
  reviewer_comment  TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comentarios sobre agendas (revisión)
CREATE TABLE IF NOT EXISTS public.agenda_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id    UUID NOT NULL,
  reviewer_cc  TEXT NOT NULL,
  comment      TEXT NOT NULL,
  read_by      TEXT[] DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuración por docente y semestre
CREATE TABLE IF NOT EXISTS public.docente_semester_config (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_cc                TEXT NOT NULL,
  semester_label         TEXT NOT NULL DEFAULT '2025-1',
  responses              JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_direct_hours  INT  NOT NULL DEFAULT 16,
  conflicts              TEXT[] DEFAULT '{}',
  observations           TEXT[] DEFAULT '{}',
  confirmed              BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_cc, semester_label)
);


-- =====================================================================
-- 5. SOPORTE: AUDITORÍA, LINEAMIENTOS, EMAILS, AJUSTES
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name      TEXT NOT NULL,
  record_id       TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data        JSONB,
  new_data        JSONB,
  changed_fields  TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lineamientos_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_label   TEXT NOT NULL,
  file_path        TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  uploaded_by      TEXT,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  rules_extracted  JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary          TEXT,
  applied          BOOLEAN NOT NULL DEFAULT false,
  applied_at       TIMESTAMPTZ,
  applied_by       TEXT
);

CREATE TABLE IF NOT EXISTS public.recommendation_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category          TEXT NOT NULL,
  rule_key          TEXT NOT NULL,
  label             TEXT NOT NULL,
  hours             INT  NOT NULL DEFAULT 0,
  subjects          INT  NOT NULL DEFAULT 0,
  default_hours     INT  NOT NULL DEFAULT 0,
  default_subjects  INT  NOT NULL DEFAULT 0,
  priority          INT  NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, rule_key)
);

CREATE TABLE IF NOT EXISTS public.semester_archives (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_label    TEXT NOT NULL,
  archived_by       TEXT,
  archived_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  schedules         JSONB NOT NULL DEFAULT '[]'::jsonb,
  agendas           JSONB NOT NULL DEFAULT '[]'::jsonb,
  agenda_comments   JSONB NOT NULL DEFAULT '[]'::jsonb,
  agenda_views      JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.system_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Subsistema de correos (Nodemailer + cola en BD) ────────────────
CREATE TABLE IF NOT EXISTS public.email_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name   TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending|sending|sent|failed
  attempts        INT  NOT NULL DEFAULT 0,
  last_error      TEXT,
  scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_send_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name   TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status          TEXT NOT NULL,
  message_id      TEXT,
  error_message   TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_send_state (
  id                              INT PRIMARY KEY DEFAULT 1,
  batch_size                      INT NOT NULL DEFAULT 10,
  send_delay_ms                   INT NOT NULL DEFAULT 200,
  retry_after_until               TIMESTAMPTZ,
  auth_email_ttl_minutes          INT NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INT NOT NULL DEFAULT 60,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  reason     TEXT NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tokens de recuperación de contraseña (reemplazo de Supabase Auth)
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    INT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documentos subidos (Multer + parseo PDF/DOCX)
CREATE TABLE IF NOT EXISTS public.uploaded_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_cc       TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_path     TEXT NOT NULL,           -- ruta en /var/app/uploads
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  extracted_text TEXT,
  ai_summary    TEXT,
  ai_metadata   JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =====================================================================
-- 6. FUNCIONES Y TRIGGERS
-- =====================================================================

-- Actualiza updated_at automáticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger genérico de auditoría
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  _old jsonb;
  _new jsonb;
  _record_id text;
  _changed text[];
  _key text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    _old := to_jsonb(OLD);
    _record_id := _old->>'id';
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, changed_fields)
    VALUES (TG_TABLE_NAME, COALESCE(_record_id, ''), 'DELETE', _old, NULL, NULL);
    RETURN OLD;
  ELSIF (TG_OP = 'INSERT') THEN
    _new := to_jsonb(NEW);
    _record_id := _new->>'id';
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, changed_fields)
    VALUES (TG_TABLE_NAME, COALESCE(_record_id, ''), 'INSERT', NULL, _new, NULL);
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
    _record_id := _new->>'id';
    _changed := ARRAY[]::text[];
    FOR _key IN SELECT jsonb_object_keys(_new) LOOP
      IF (_old->_key IS DISTINCT FROM _new->_key) THEN
        _changed := array_append(_changed, _key);
      END IF;
    END LOOP;
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, changed_fields)
    VALUES (TG_TABLE_NAME, COALESCE(_record_id, ''), 'UPDATE', _old, _new, _changed);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers de updated_at
DROP TRIGGER IF EXISTS trg_agendas_updated_at ON public.agendas;
CREATE TRIGGER trg_agendas_updated_at
  BEFORE UPDATE ON public.agendas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_agenda_views_updated_at ON public.agenda_views;
CREATE TRIGGER trg_agenda_views_updated_at
  BEFORE UPDATE ON public.agenda_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_docente_semester_config_updated_at ON public.docente_semester_config;
CREATE TRIGGER trg_docente_semester_config_updated_at
  BEFORE UPDATE ON public.docente_semester_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_recommendation_rules_updated_at ON public.recommendation_rules;
CREATE TRIGGER trg_recommendation_rules_updated_at
  BEFORE UPDATE ON public.recommendation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Triggers de auditoría sobre tablas críticas
DROP TRIGGER IF EXISTS audit_users           ON public.users;
DROP TRIGGER IF EXISTS audit_agendas         ON public.agendas;
DROP TRIGGER IF EXISTS audit_agenda_views    ON public.agenda_views;
DROP TRIGGER IF EXISTS audit_subjects        ON public.subjects;

CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_agendas
  AFTER INSERT OR UPDATE OR DELETE ON public.agendas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_agenda_views
  AFTER INSERT OR UPDATE OR DELETE ON public.agenda_views
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_subjects
  AFTER INSERT OR UPDATE OR DELETE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();


-- =====================================================================
-- 7. ÍNDICES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_users_cc                ON public.users (cc);
CREATE INDEX IF NOT EXISTS idx_users_email             ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_agendas_docente_cc      ON public.agendas (docente_cc);
CREATE INDEX IF NOT EXISTS idx_agendas_semester_id     ON public.agendas (semester_id);
CREATE INDEX IF NOT EXISTS idx_agenda_views_user_cc    ON public.agenda_views (user_cc);
CREATE INDEX IF NOT EXISTS idx_agenda_views_status     ON public.agenda_views (status);
CREATE INDEX IF NOT EXISTS idx_agenda_comments_agenda  ON public.agenda_comments (agenda_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table         ON public.audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_status      ON public.email_queue (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_subjects_career         ON public.subjects (id_professional_career);


-- =====================================================================
-- 8. DATOS INICIALES (SEED)
-- =====================================================================

-- Roles
INSERT INTO public.roles (id, name, description) VALUES
  (1, 'DocentePlanta',         'Rol encargado de diligenciar agenda sin responsabilidades diferentes a la docencia'),
  (2, 'DirectorPrograma',      'Rol encargado de diligenciar agenda con responsabilidades iguales o más que el docente planta'),
  (3, 'DecanoFacultad',        'Rol encargado de diligenciar agenda con responsabilidades iguales o más que el director del programa'),
  (4, 'VicerrectorAcadémico',  'Rol encargado de diligenciar agenda con responsabilidades iguales o más que el decano de la facultad')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- States
INSERT INTO public.states (id, name) VALUES
  (1, 'Activo'),
  (2, 'Inactivo')
ON CONFLICT (id) DO NOTHING;

-- Semestres
INSERT INTO public.semester (id, number, description) VALUES
  (1, 1, 'Primer semestre'),
  (2, 2, 'Segundo semestre'),
  (3, 3, 'Tercer semestre'),
  (4, 4, 'Cuarto semestre'),
  (5, 5, 'Quinto semestre'),
  (6, 6, 'Sexto semestre')
ON CONFLICT (id) DO NOTHING;

-- Facultades
INSERT INTO public.faculties (id, name) VALUES
  (1, 'Facultad de ciencias básicas e ingeniería')
ON CONFLICT (id) DO NOTHING;

-- Niveles educativos
INSERT INTO public.education_levels (id, name) VALUES
  (1, 'Pregrado'),
  (2, 'Especialización'),
  (3, 'Maestría'),
  (4, 'Doctorado')
ON CONFLICT (id) DO NOTHING;

-- Programas profesionales
INSERT INTO public.professional_careers (id, name, id_faculty) VALUES
  (1, 'Tecnología en desarrollo de software', 1)
ON CONFLICT (id) DO NOTHING;

-- Asignaturas
INSERT INTO public.subjects (id, name, weekly_hours, number_weeks, id_semester, id_education_level, id_state, id_faculty, id_professional_career) VALUES
  (1,  'Deportes formativo y cultural (Microfútbol mixto)',        2, 16, 1, 1, 1, 1, 1),
  (2,  'Desarrollo de software I',                                  4, 16, 1, 1, 1, 1, 1),
  (3,  'Desarrollo humano',                                         3, 16, 1, 1, 1, 1, 1),
  (4,  'Introducción a la tecnología',                              3, 16, 1, 1, 1, 1, 1),
  (5,  'Matemáticas I',                                             6, 16, 1, 1, 1, 1, 1),
  (6,  'Desarrollo de software II',                                 4, 16, 2, 1, 1, 1, 1),
  (7,  'Diálogo fe y cultura',                                      3, 16, 2, 1, 1, 1, 1),
  (8,  'Electiva I',                                                2, 16, 2, 1, 1, 1, 1),
  (9,  'Expresión oral y escrita',                                  3, 16, 2, 1, 1, 1, 1),
  (10, 'Matemáticas II',                                            4, 16, 2, 1, 1, 1, 1),
  (11, 'Administración y empresarismo',                             3, 16, 3, 1, 1, 1, 1),
  (12, 'Algebra lineal',                                            4, 16, 3, 1, 1, 1, 1),
  (13, 'Base de datos I',                                           3, 16, 3, 1, 1, 1, 1),
  (14, 'Desarrollo de software III',                                4, 16, 3, 1, 1, 1, 1),
  (15, 'Física I',                                                  4, 16, 3, 1, 1, 1, 1),
  (16, 'Base de datos II',                                          4, 16, 4, 1, 1, 1, 1),
  (17, 'Estadística I',                                             4, 16, 4, 1, 1, 1, 1),
  (18, 'Gestión de tecnología',                                     3, 16, 4, 1, 1, 1, 1),
  (19, 'Optativa I (Programación web)',                             3, 16, 4, 1, 1, 1, 1),
  (20, 'Electiva II (Introducción a la analítica de datos)',        2, 16, 5, 1, 1, 1, 1),
  (21, 'Formulación y evaluación de proyectos',                     3, 16, 5, 1, 1, 1, 1),
  (22, 'Investigación en tecnología',                               2, 16, 5, 1, 1, 1, 1),
  (23, 'Optativa II (Microservicios)',                              3, 16, 5, 1, 1, 1, 1),
  (24, 'Redes de computadores',                                     4, 16, 5, 1, 1, 1, 1),
  (25, 'Electiva III (Despliegue de aplicaciones)',                 2, 16, 6, 1, 1, 1, 1),
  (26, 'Optativa III (Ciberseguridad web)',                         3, 16, 6, 1, 1, 1, 1),
  (27, 'Trabajo final',                                             4, 16, 6, 1, 1, 1, 1),
  (28, 'Ética',                                                     3, 16, 6, 1, 1, 1, 1),
  (29, 'Electiva II (Robótica)',                                    2, 16, 5, 1, 1, 1, 1)
ON CONFLICT (id) DO NOTHING;

-- Usuarios de prueba (password = SHA-256 de "1234")
-- IMPORTANTE: en el nuevo backend Express se debe migrar a bcrypt.
INSERT INTO public.users (id, first_name, second_name, first_last_name, second_last_name, cc, email, password, id_rol, id_state) VALUES
  (1, 'Docente',     '', 'Planta',     'Pruebas', '12345678',     'docenteplanta.pruebas@ucp.edu.co',        '74d18a339850e92425fe1c8b3efeddd5ff024d5291c629d79b35720c4bfe8e53', 1, 1),
  (2, 'Director',    '', 'Programa',   'Pruebas', '123456789',    'directorprograma.pruebas@ucp.edu.co',     '74d18a339850e92425fe1c8b3efeddd5ff024d5291c629d79b35720c4bfe8e53', 2, 1),
  (3, 'Decano',      '', 'Facultad',   'Pruebas', '1234567890',   'decanofacultad.pruebas@ucp.edu.co',       '74d18a339850e92425fe1c8b3efeddd5ff024d5291c629d79b35720c4bfe8e53', 3, 1),
  (4, 'Vicerrector', '', 'Académico',  'Pruebas', '12345678900',  'vicerrectoracademico.pruebas@ucp.edu.co', '74d18a339850e92425fe1c8b3efeddd5ff024d5291c629d79b35720c4bfe8e53', 4, 1)
ON CONFLICT (id) DO NOTHING;

-- Docencia indirecta
INSERT INTO public.indirect_teaching (id, name, weekly_hours, number_weeks) VALUES
  (3, 'Preparación de clases',    0.50, 18),
  (4, 'Asesorías de estudiantes', 1.00, 18)
ON CONFLICT (id) DO NOTHING;

-- Investigación
INSERT INTO public.investigations (id, name, weekly_hours, number_weeks) VALUES
  (1, 'Investigador principal', 11, 23),
  (2, 'Co-investigador',         6, 23)
ON CONFLICT (id) DO NOTHING;

-- Proyección social
INSERT INTO public.social_projects (id, name, weekly_hours, number_weeks) VALUES
  (1, 'Actividad de proyección social', 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Formación docente
INSERT INTO public.teacher_training (id, name, weekly_hours, number_weeks) VALUES
  (1, 'Estudios maestría',   7, 23),
  (2, 'Estudios doctorado', 15, 23)
ON CONFLICT (id) DO NOTHING;

-- Trabajos de grado
INSERT INTO public.degree_works (id, name, number_projects, number_weeks) VALUES
  (1, 'Trabajo pregrado',        0, 15),
  (2, 'Trabajo especialización', 0, 15),
  (3, 'Trabajo maestría',        0, 30),
  (4, 'Trabajo doctorado',       0, 45)
ON CONFLICT (id) DO NOTHING;

-- Actividades complementarias
INSERT INTO public.complementary_activities (id, name, weekly_hours, number_weeks) VALUES
  (4, 'Participación en comités institucionales permanentes', 0, 23),
  (5, 'Coordinación gestión desarrollo de software',          0, 23),
  (6, 'Actividades de desarrollo personal',                   0, 23)
ON CONFLICT (id) DO NOTHING;

-- Actividades administrativas
INSERT INTO public.administrative_activities (id, name, weekly_hours, number_weeks) VALUES
  (5, 'Director de programa pregrado',  0, 23),
  (6, 'Director de departamento',       0, 23),
  (7, 'Director de programa posgrado',  0, 23),
  (8, 'Director de programa doctorado', 0, 23)
ON CONFLICT (id) DO NOTHING;

-- Prácticas académicas
INSERT INTO public.academic_practices (id, name, number_students, number_weeks) VALUES
  (1, 'Práctica profesional (IST)', 0, 10)
ON CONFLICT (id) DO NOTHING;

-- Jerarquía de supervisión
INSERT INTO public.user_hierarchy (user_id, supervisor_id) VALUES
  (1, 2),  -- DocentePlanta -> DirectorPrograma
  (2, 3),  -- DirectorPrograma -> DecanoFacultad
  (3, 4)   -- DecanoFacultad -> VicerrectorAcadémico
ON CONFLICT (user_id) DO NOTHING;

-- Estado inicial del envío de correos
INSERT INTO public.email_send_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;


-- =====================================================================
-- 9. RESET DE SECUENCIAS (para evitar conflictos con IDs sembrados)
-- =====================================================================
SELECT setval(pg_get_serial_sequence('roles',                     'id'), COALESCE((SELECT MAX(id) FROM public.roles),                     1));
SELECT setval(pg_get_serial_sequence('states',                    'id'), COALESCE((SELECT MAX(id) FROM public.states),                    1));
SELECT setval(pg_get_serial_sequence('semester',                  'id'), COALESCE((SELECT MAX(id) FROM public.semester),                  1));
SELECT setval(pg_get_serial_sequence('faculties',                 'id'), COALESCE((SELECT MAX(id) FROM public.faculties),                 1));
SELECT setval(pg_get_serial_sequence('education_levels',          'id'), COALESCE((SELECT MAX(id) FROM public.education_levels),          1));
SELECT setval(pg_get_serial_sequence('professional_careers',      'id'), COALESCE((SELECT MAX(id) FROM public.professional_careers),      1));
SELECT setval(pg_get_serial_sequence('subjects',                  'id'), COALESCE((SELECT MAX(id) FROM public.subjects),                  1));
SELECT setval(pg_get_serial_sequence('users',                     'id'), COALESCE((SELECT MAX(id) FROM public.users),                     1));
SELECT setval(pg_get_serial_sequence('indirect_teaching',         'id'), COALESCE((SELECT MAX(id) FROM public.indirect_teaching),         1));
SELECT setval(pg_get_serial_sequence('investigations',            'id'), COALESCE((SELECT MAX(id) FROM public.investigations),            1));
SELECT setval(pg_get_serial_sequence('social_projects',           'id'), COALESCE((SELECT MAX(id) FROM public.social_projects),           1));
SELECT setval(pg_get_serial_sequence('teacher_training',          'id'), COALESCE((SELECT MAX(id) FROM public.teacher_training),          1));
SELECT setval(pg_get_serial_sequence('degree_works',              'id'), COALESCE((SELECT MAX(id) FROM public.degree_works),              1));
SELECT setval(pg_get_serial_sequence('complementary_activities',  'id'), COALESCE((SELECT MAX(id) FROM public.complementary_activities),  1));
SELECT setval(pg_get_serial_sequence('administrative_activities', 'id'), COALESCE((SELECT MAX(id) FROM public.administrative_activities), 1));
SELECT setval(pg_get_serial_sequence('academic_practices',        'id'), COALESCE((SELECT MAX(id) FROM public.academic_practices),        1));

-- =====================================================================
-- FIN DEL SCRIPT
-- =====================================================================
