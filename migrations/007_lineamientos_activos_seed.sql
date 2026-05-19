-- Semilla de lineamientos activos para entornos nuevos (Render, etc.)
INSERT INTO public.system_settings (key, value, updated_at)
VALUES (
  'lineamientos_activos',
  '{
    "version": "ucp-default-2025",
    "horasSemestre": 920,
    "semanasSemestre": 23,
    "docenciaDirecta": {
      "sinProyecto": 16,
      "investigadorPrincipal": 10,
      "coinvestigador": 13,
      "directorPrograma": 6,
      "directorPosgradoDescarga": 9,
      "coordinacionAreaDescarga": 6,
      "formacionDoctorado": 8,
      "formacionMaestria": 12
    },
    "equivalenciasPosgrado": {
      "especializacion": 1.5,
      "maestria": 2,
      "doctorado": 2.5
    },
    "docenciaIndirecta": {
      "preparacionClasePorHora": 0.5,
      "asesoriaPorCurso": 1,
      "asesoriaTrabajoGradoPregrado": 0.65,
      "asesoriaTrabajoGradoMaestria": 1.3,
      "asesoriaTrabajoGradoDoctorado": 1.96,
      "maxTrabajosGrado": 4
    },
    "actividadesAnexas": {
      "liderColectivo": 4,
      "participacionColectivo": 2,
      "comiteCurricular": 3,
      "comiteBasicoFacultad": 2,
      "liderGrupoInvestigacion": 4,
      "liderRevista": 2
    },
    "registroHorasSemanales": {},
    "visualSettings": {
      "form_bg_color": "#00804E"
    }
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;
