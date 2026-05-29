/**
 * Interpretación de lineamientos UCP desde PDF.
 * Modelo: Google Gemini 1.5 Flash (@google/generative-ai).
 * Requiere GEMINI_API_KEY. Si falla la API, usa fallbackExtract() (regex).
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractTextFromPDF } from "./pdfParser";

const GEMINI_MODEL = "gemini-1.5-flash";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Helper: fallback extraction using regex patterns
function fallbackExtract(raw: string): LineamientosData {
  const getNumber = (regex: RegExp) => {
    const match = raw.match(regex);
    if (!match) return undefined;
    // Buscamos el grupo que contenga el número (puede ser el 1 o el 2 dependiendo del regex)
    const valStr = match[1] || match[2];
    if (!valStr) return undefined;
    const value = valStr.replace(",", ".");
    return parseFloat(value);
  };

  return {
    version: "extracción-oficial-ucp",
    // Horas semestre: acepta "920 horas" o "horas: 920"
    horasSemestre: getNumber(/(\d+(?:[.,]\d+)?)\s*horas\s*al\s*semestre/i) || getNumber(/horas.*?semestre\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i) || 920,
    // Semanas: acepta "23 semanas" o "semanas: 23"
    semanasSemestre: getNumber(/(\d+)\s*semanas/i) || getNumber(/semanas.*?semestre\s*[:=]?\s*(\d+)/i) || 23,
    
    docenciaDirecta: {
      // Sin proyecto: acepta "16 horas... sin proyecto" o "sin proyecto: 16"
      sinProyecto: getNumber(/(\d+)\s*horas.*?sin\s*proyecto/i) || getNumber(/sin\s*proyecto.*?(\d+)\s*horas/i) || 16,
      // Investigador: acepta "10 horas... investigador" o "investigador: 10"
      investigadorPrincipal: getNumber(/(\d+)\s*horas.*?investigador\s*principal/i) || getNumber(/investigador\s*principal.*?(\d+)\s*horas/i) || 10,
      coinvestigador: getNumber(/(\d+)\s*horas.*?co-investigador/i) || getNumber(/co-investigador.*?(\d+)\s*horas/i) || 13,
      directorPrograma: getNumber(/(\d+)\s*horas.*?director\s*de\s*programa/i) || getNumber(/director\s*de\s*programa.*?(\d+)\s*horas/i) || 6,
      directorPosgradoDescarga: 9,
      coordinacionAreaDescarga: 6,
      formacionDoctorado: getNumber(/(\d+)\s*horas.*?doctorado/i) || getNumber(/doctorado.*?(\d+)\s*horas/i) || 8,
      formacionMaestria: getNumber(/(\d+)\s*horas.*?maestr[íi]a/i) || getNumber(/maestr[íi]a.*?(\d+)\s*horas/i) || 12,
    },
    equivalenciasPosgrado: {
      especializacion: getNumber(/especializaci[oó]n\s+([0-9.,]+)/i) || getNumber(/([0-9.,]+)\s+especializaci[oó]n/i) || 1.5,
      maestria: getNumber(/maestr[íi]a\s+([0-9.,]+)/i) || getNumber(/([0-9.,]+)\s+maestr[íi]a/i) || 2.0,
      doctorado: getNumber(/doctorado\s+([0-9.,]+)/i) || getNumber(/([0-9.,]+)\s+doctorado/i) || 2.5,
    },
    docenciaIndirecta: {
      // Preparación: Buscamos el número pegado a la palabra (máximo 10 caracteres de distancia)
      // Esto evita que salte hasta el "6" del título del artículo.
      preparacionClasePorHora: getNumber(/preparaci[oó]n\s*(?:de\s*clase)?\s*[:=]?\s*([0-9.,]+)/i) || 0.5,
      asesoriaPorCurso: getNumber(/asesor[íi]a\s*estudiantes\s*[:=]?\s*(\d+)/i) || 1,
      asesoriaTrabajoGradoPregrado: Number((15 / 23).toFixed(2)),
      asesoriaTrabajoGradoMaestria: Number((30 / 23).toFixed(2)),
      asesoriaTrabajoGradoDoctorado: Number((45 / 23).toFixed(2)),
      // Max trabajos: acepta "50... trabajos de grado" o "trabajos de grado: 50"
      maxTrabajosGrado: getNumber(/(\d+)\s*trabajos\s*de\s*grado/i) || getNumber(/trabajos\s*de\s*grado.*?(\d+)/i) || 4,
    },
    actividadesAnexas: {
      // Art 6 Notas
      liderColectivo: getNumber(/l[íi]der\s*colectivo\s*(\d+)/i) || 4,
      participacionColectivo: getNumber(/participaci[oó]n\s*en\s*colectivo\s*(\d+)/i) || 2,
      comiteCurricular: getNumber(/comit[ée]\s*curricular\s*(\d+)/i) || 3,
      comiteBasicoFacultad: getNumber(/comit[ée]\s*b[áa]sico.*?(\d+)/i) || 2,
      liderGrupoInvestigacion: getNumber(/l[íi]der\s*grupo\s*investigaci[oó]n\s*(\d+)/i) || 4,
      liderRevista: getNumber(/l[íi]der\s*revista\s*(\d+)/i) || 2,
    },
    registroHorasSemanales: {
      sinProyecto: extractRegistroHoras(raw, /sin\s*proyecto/i),
      investigadorPrincipal: extractRegistroHoras(raw, /investigador\s*principal/i),
      coinvestigador: extractRegistroHoras(raw, /co-?investigador/i),
      directorPrograma: extractRegistroHoras(raw, /director\s*de\s*programa/i),
      directorPosgrado: extractRegistroHoras(raw, /director\s*de\s*posgrado/i),
      coordinacionArea: extractRegistroHoras(raw, /coordinaci[oó]n\s*de\s*[áa]rea/i),
      formacionDoctorado: extractRegistroHoras(raw, /formaci[oó]n\s*doctoral|doctorado/i),
      formacionMaestria: extractRegistroHoras(raw, /formaci[oó]n\s*maestr[íi]a|maestr[íi]a/i),
    },
    visualSettings: {
      form_bg_color: (raw.match(/form_bg_color\s*[:=]?\s*#*(#[0-9A-Fa-f]{6})/i) || raw.match(/form_bg_color\s*[:=]?\s*(#[0-9A-Fa-f]{6})/i) || [])[1] || "#00804E"
    }
  };
}

/** "Se registrará en el formato ... X horas semanales" */
function extractRegistroHoras(raw: string, activityPattern: RegExp): number | undefined {
  const blocks = raw.split(/\n+/);
  for (const line of blocks) {
    if (!activityPattern.test(line)) continue;
    if (!/registr/i.test(line) && !/formato/i.test(line) && !/excel/i.test(line)) continue;
    const m =
      line.match(/(\d+(?:[.,]\d+)?)\s*horas?\s*semanales?/i) ||
      line.match(/registr(?:ar)?[áa]?\s+(\d+(?:[.,]\d+)?)\s*horas?/i);
    if (m?.[1]) return parseFloat(m[1].replace(",", "."));
  }
  const global =
    raw.match(
      new RegExp(
        `registr(?:ar)?[áa]?[^\\n]{0,120}${activityPattern.source}[^\\n]{0,120}(\\d+(?:[.,]\\d+)?)\\s*horas?\\s*semanales?`,
        "i"
      )
    ) ||
    raw.match(
      new RegExp(
        `${activityPattern.source}[^\\n]{0,160}registr(?:ar)?[áa]?[^\\n]{0,80}(\\d+(?:[.,]\\d+)?)\\s*horas?`,
        "i"
      )
    );
  if (global?.[1]) return parseFloat(global[1].replace(",", "."));
  return undefined;
}

export interface LineamientosData {
  version: string;
  horasSemestre: number;
  semanasSemestre: number;
  docenciaDirecta: {
    sinProyecto: number;
    investigadorPrincipal: number;
    coinvestigador: number;
    directorPrograma: number;
    directorPosgradoDescarga: number;
    coordinacionAreaDescarga: number;
    formacionDoctorado: number;
    formacionMaestria: number;
  };
  equivalenciasPosgrado: {
    especializacion: number;
    maestria: number;
    doctorado: number;
  };
  docenciaIndirecta: {
    preparacionClasePorHora: number;
    asesoriaPorCurso: number;
    asesoriaTrabajoGradoPregrado: number;
    asesoriaTrabajoGradoMaestria: number;
    asesoriaTrabajoGradoDoctorado: number;
    maxTrabajosGrado: number;
  };
  actividadesAnexas: {
    liderColectivo: number;
    participacionColectivo: number;
    comiteCurricular: number;
    comiteBasicoFacultad: number;
    liderGrupoInvestigacion: number;
    liderRevista: number;
  };
  /** Horas a registrar en Excel ("Se registrará ... X horas semanales"). */
  registroHorasSemanales?: {
    sinProyecto?: number;
    investigadorPrincipal?: number;
    coinvestigador?: number;
    directorPrograma?: number;
    directorPosgrado?: number;
    coordinacionArea?: number;
    formacionDoctorado?: number;
    formacionMaestria?: number;
  };
  visualSettings?: {
    form_bg_color?: string;
  };
}

interface GeminiRoleValue {
  dd?: unknown;
  Fxl?: unknown;
}

interface GeminiPromptOutput {
  parametros_generales?: {
    semanasSemestre?: unknown;
    horasContratoSemanal?: unknown;
    totalHorasSemestre?: unknown;
  };
  defecto?: unknown;
  valores_roles?: Record<string, GeminiRoleValue>;
  otras_actividades?: {
    preparacion_clase?: unknown;
    asesoria_estudiantes_por_curso?: unknown;
    lider_colectivo_semanal?: unknown;
    participacion_colectivo_semanal?: unknown;
    asesoria_practica_semestral?: unknown;
    asesoria_grado_pregrado_semestral?: unknown;
    asesoria_grado_maestria_semestral?: unknown;
    asesoria_grado_doctorado_semestral?: unknown;
    comite_curricular_semanal?: unknown;
    comite_basico_facultad_semanal?: unknown;
    lider_grupo_investigacion_semanal?: unknown;
    lider_revista_semanal?: unknown;
  };
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    const direct = Number(normalized);
    if (Number.isFinite(direct)) return direct;
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function toPositiveOrZero(value: unknown, fallback = 0): number {
  const n = toNumber(value);
  if (n == null || !Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

function roleDd(roles: Record<string, GeminiRoleValue>, key: string): number {
  const raw = roles[key]?.dd;
  if (typeof raw === "string" && /curso/i.test(raw)) {
    // "Solo N cursos" is not a direct-hours value for this schema.
    return 0;
  }
  return toPositiveOrZero(raw, 0);
}

function roleDdFromKeys(roles: Record<string, GeminiRoleValue>, keys: string[]): number {
  for (const key of keys) {
    const n = roleDd(roles, key);
    if (n > 0) return n;
  }
  return 0;
}

function roleFxl(roles: Record<string, GeminiRoleValue>, key: string): number | undefined {
  const n = toNumber(roles[key]?.Fxl);
  if (n == null || !Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function roleFxlFromKeys(
  roles: Record<string, GeminiRoleValue>,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const n = roleFxl(roles, key);
    if (n != null && n > 0) return n;
  }
  return undefined;
}

function extractArticles4to6(raw: string): string {
  const normalized = raw.replace(/\r/g, "");
  const startRegex = /art[íi]culo\s*4\b/i;
  const endRegex = /art[íi]culo\s*7\b/i;
  const start = normalized.search(startRegex);
  if (start < 0) return raw;
  const afterStart = normalized.slice(start);
  const endRel = afterStart.search(endRegex);
  const scoped = endRel > 0 ? afterStart.slice(0, endRel) : afterStart;
  return scoped.trim() || raw;
}

function captureNumberNear(text: string, anchor: RegExp, value: RegExp): number | undefined {
  const m = text.match(anchor);
  if (!m || m.index == null) return undefined;
  const start = Math.max(0, m.index - 120);
  const end = Math.min(text.length, m.index + 800);
  const zone = text.slice(start, end);
  const v = zone.match(value);
  if (!v?.[1]) return undefined;
  const n = Number(v[1].replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function enrichFromArticlesText(config: LineamientosData, text: string): LineamientosData {
  const c: LineamientosData = JSON.parse(JSON.stringify(config));
  c.registroHorasSemanales = c.registroHorasSemanales ?? {};

  // Art.4 explicit period tuple
  const art4 = text.match(
    /per[ií]odo\s+semestral\s*\(de\s*(\d+)\s*semanas,\s*de\s*(\d+)\s*horas.*?total\s+de\s*(\d+)\s*horas\s+al\s+semestre\)/i
  );
  if (art4) {
    c.semanasSemestre = Number(art4[1]);
    c.horasSemestre = Number(art4[3]);
  }

  // Core base: docentes sin proyecto
  const sinProyecto =
    captureNumberNear(
      text,
      /no\s+tengan\s+aprobados\s+proyectos\s+de\s+investigaci[oó]n/i,
      /(\d+)\s*horas?\s+semanales?\s+de\s+docencia/i
    ) ??
    captureNumberNear(
      text,
      /docentes\s+sin\s+proyecto/i,
      /(\d+)\s*horas?\s+semanales?/i
    );
  if (sinProyecto != null && sinProyecto > 0) {
    c.docenciaDirecta.sinProyecto = sinProyecto;
    c.registroHorasSemanales = c.registroHorasSemanales ?? {};
    c.registroHorasSemanales.sinProyecto = sinProyecto;
  }

  const defectoBase = c.docenciaDirecta.sinProyecto > 0 ? c.docenciaDirecta.sinProyecto : sinProyecto ?? 0;
  const num = (s: string): number | undefined => {
    const m = s.match(/\d+(?:[.,]\d+)?/);
    if (!m) return undefined;
    const n = Number(m[0].replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  };

  const inferDdFromRoleBlock = (anchor: RegExp): number | undefined => {
    const m = text.match(anchor);
    if (!m || m.index == null) return undefined;
    const zone = text.slice(Math.max(0, m.index - 80), Math.min(text.length, m.index + 900));
    const descarga = zone.match(
      /(\d+(?:[.,]\d+)?)\s*horas?\s+semanales?\s+de\s+(?:descarga|disminuci[oó]n|reducci[oó]n).*?docencia\s+directa/i
    ) || zone.match(
      /(?:descarga|disminuci[oó]n|reducci[oó]n)\s+de\s+(\d+(?:[.,]\d+)?)\s*horas?.*?docencia\s+directa/i
    );
    if (descarga?.[1]) {
      const d = Number(descarga[1].replace(",", "."));
      if (Number.isFinite(d) && defectoBase > 0) return Math.max(0, defectoBase - d);
    }
    const direct = zone.match(
      /(?:asignaci[oó]n\s+de\s+hasta|tendr[aá]n\s+a\s+cargo|tendr[aá]n)\s+(\d+(?:[.,]\d+)?)\s*horas?.{0,60}docencia\s+directa/i
    ) || zone.match(/(\d+(?:[.,]\d+)?)\s*horas?.{0,80}docencia\s+directa/i);
    if (direct?.[1]) {
      const h = Number(direct[1].replace(",", "."));
      if (Number.isFinite(h)) return h;
    }
    return undefined;
  };

  const inferRoleDdPreferringDescarga = (anchor: RegExp): number | undefined => {
    const m = text.match(anchor);
    if (!m || m.index == null) return undefined;
    const zone = text.slice(Math.max(0, m.index - 120), Math.min(text.length, m.index + 1200));

    // Prefer "descarga/disminución/reducción" because DD must be (defecto - descarga).
    const descargaPatterns = [
      /(?:descarga|disminuci[oó]n|reducci[oó]n)\s+de\s+hasta\s+([^(.\n]*\(?\d+(?:[.,]\d+)?\)?)[^.\n]{0,160}docencia\s+directa/i,
      /(?:descarga|disminuci[oó]n|reducci[oó]n)\s+de\s+([^(.\n]*\(?\d+(?:[.,]\d+)?\)?)[^.\n]{0,160}docencia\s+directa/i,
      /([^(.\n]*\(?\d+(?:[.,]\d+)?\)?)\s*horas?\s+semanales?\s+de\s+(?:descarga|disminuci[oó]n|reducci[oó]n)[^.\n]{0,160}docencia\s+directa/i,
    ];
    for (const pattern of descargaPatterns) {
      const hit = zone.match(pattern);
      if (hit?.[1] && defectoBase > 0) {
        const descarga = num(hit[1]);
        if (descarga != null && Number.isFinite(descarga)) {
          return Math.max(0, defectoBase - descarga);
        }
      }
    }

    // Fallback to explicit direct-hour phrasing.
    const directPatterns = [
      /(?:asignaci[oó]n\s+de\s+hasta|tendr[aá]n\s+a\s+cargo|tendr[aá]n)\s+(\d+(?:[.,]\d+)?)\s*horas?.{0,80}docencia\s+directa/i,
      /(\d+(?:[.,]\d+)?)\s*horas?.{0,100}docencia\s+directa/i,
    ];
    for (const pattern of directPatterns) {
      const hit = zone.match(pattern);
      if (hit?.[1]) {
        const dd = Number(hit[1].replace(",", "."));
        if (Number.isFinite(dd)) return dd;
      }
    }
    return undefined;
  };

  const inferRegistroExcelHoursNearRole = (anchor: RegExp): number | undefined => {
    const m = text.match(anchor);
    if (!m || m.index == null) return undefined;
    const zone = text.slice(Math.max(0, m.index - 100), Math.min(text.length, m.index + 1300));
    const hit =
      zone.match(
        /registr(?:ar|ará|a)\s+en\s+el\s+formato\s+de\s+excel[^.\n]{0,80}?(\d+(?:[.,]\d+)?)\s*horas?\s+semanales?/i
      ) ||
      zone.match(
        /formato\s+de\s+excel[^.\n]{0,80}?(\d+(?:[.,]\d+)?)\s*horas?\s+semanales?/i
      ) ||
      zone.match(
        /excel[^.\n]{0,50}?\((\d+(?:[.,]\d+)?)\)[^.\n]{0,50}?horas?\s+semanales?/i
      );
    if (!hit?.[1]) return undefined;
    const n = Number(hit[1].replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const roleStartPatterns: RegExp[] = [
    /investigador\s+principal(?:es)?(?:\s+con\s+proyecto\s+aprobado)?/i,
    /co-?\s*investigador(?:es)?|coinvestigador(?:es)?/i,
    /jefes?\s+de\s+departamento|director(?:es)?\s+de\s+programa/i,
    /direcci[oó]n\s+de\s+un\s+programa\s+de\s+posgrado/i,
    /coordinaci[oó]n\s+de\s+un\s+[áa]rea/i,
    /decanos?|vicerrector|director\s+de\s+doctorado/i,
    /formaci[oó]n\s+de\s+doctorado|formaci[oó]n\s+doctoral|docentes?\s+en\s+formaci[oó]n\s+de\s+doctorado/i,
    /formaci[oó]n\s+de\s+maestr[íi]a|docentes?\s+en\s+formaci[oó]n\s+de\s+maestr[íi]a/i,
    /formaci[oó]n\s+pedag[oó]gica/i,
  ];

  const getRoleZone = (anchor: RegExp): string | undefined => {
    const m = text.match(anchor);
    if (!m || m.index == null) return undefined;
    const start = Math.max(0, m.index - 40);
    let end = text.length;
    for (const next of roleStartPatterns) {
      if (String(next) === String(anchor)) continue;
      const rel = text.slice(start + 1).search(next);
      if (rel >= 0) {
        const abs = start + 1 + rel;
        if (abs > start && abs < end) end = abs;
      }
    }
    return text.slice(start, end);
  };

  const descargaFromZone = (zone?: string): number | undefined => {
    if (!zone) return undefined;
    const m =
      zone.match(
        /(?:descarga|disminuci[oó]n|reducci[oó]n)[^.\n]{0,90}?\(?(\d+(?:[.,]\d+)?)\)?\s*horas?/i
      ) ||
      zone.match(
        /de\s+hasta\s+(\d+(?:[.,]\d+)?)\s*horas?[^.\n]{0,80}(?:descarga|disminuci[oó]n|reducci[oó]n)/i
      );
    if (!m?.[1]) return undefined;
    const n = Number(m[1].replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  };

  const excelFromZone = (zone?: string): number | undefined => {
    if (!zone) return undefined;
    const m =
      zone.match(/excel[^.\n]{0,100}?(\d+(?:[.,]\d+)?)\s*horas?\s+semanales?/i) ||
      zone.match(/formato\s+de\s+excel[^.\n]{0,100}?(\d+(?:[.,]\d+)?)\s*horas?\s+semanales?/i);
    if (!m?.[1]) return undefined;
    const n = Number(m[1].replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  };

  const getBoundedRoleZone = (
    start: RegExp,
    endPatterns: RegExp[],
    maxWindow = 1800
  ): string | undefined => {
    const m = text.match(start);
    if (!m || m.index == null) return undefined;
    const from = m.index;
    const window = text.slice(from, Math.min(text.length, from + maxWindow));
    let end = window.length;
    for (const endPattern of endPatterns) {
      const rel = window.slice(1).search(endPattern);
      if (rel >= 0) {
        const idx = rel + 1;
        if (idx > 0 && idx < end) end = idx;
      }
    }
    return window.slice(0, end);
  };

  const invDd = inferRoleDdPreferringDescarga(
    /investigador\s+principal(?:es)?(?:\s+con\s+proyecto\s+aprobado)?/i
  );
  if (invDd != null && invDd > 0) c.docenciaDirecta.investigadorPrincipal = invDd;
  const coInvDd = inferRoleDdPreferringDescarga(/co-?\s*investigador(?:es)?|coinvestigador(?:es)?/i);
  if (coInvDd != null && coInvDd > 0) c.docenciaDirecta.coinvestigador = coInvDd;
  const posDd = inferRoleDdPreferringDescarga(/direcci[oó]n\s+de\s+un\s+programa\s+de\s+posgrado/i);
  if (posDd != null && posDd > 0 && defectoBase > 0) {
    c.docenciaDirecta.directorPosgradoDescarga = Math.max(0, defectoBase - posDd);
  }
  const coordDd = inferRoleDdPreferringDescarga(/coordinaci[oó]n\s+de\s+un\s+[áa]rea/i);
  if (coordDd != null && coordDd > 0 && defectoBase > 0) {
    c.docenciaDirecta.coordinacionAreaDescarga = Math.max(0, defectoBase - coordDd);
  }
  const formDocDd = inferRoleDdPreferringDescarga(
    /docentes?\s+en\s+formaci[oó]n\s+(?:de\s+)?(?:doctorado|doctoral)|formaci[oó]n\s+de\s+doctorado|formaci[oó]n\s+doctoral/i
  );
  if (formDocDd != null && formDocDd > 0) c.docenciaDirecta.formacionDoctorado = formDocDd;
  const formMaesDd = inferRoleDdPreferringDescarga(
    /docentes?\s+en\s+formaci[oó]n\s+(?:de\s+)?maestr[íi]a|formaci[oó]n\s+de\s+maestr[íi]a/i
  );
  if (formMaesDd != null && formMaesDd > 0) c.docenciaDirecta.formacionMaestria = formMaesDd;

  const invFxl = inferRegistroExcelHoursNearRole(
    /investigador\s+principal(?:es)?(?:\s+con\s+proyecto\s+aprobado)?/i
  );
  if (invFxl != null) c.registroHorasSemanales.investigadorPrincipal = invFxl;
  const coInvFxl = inferRegistroExcelHoursNearRole(
    /co-?\s*investigador(?:es)?|coinvestigador(?:es)?/i
  );
  if (coInvFxl != null) c.registroHorasSemanales.coinvestigador = coInvFxl;
  const dirPosFxl = inferRegistroExcelHoursNearRole(
    /direcci[oó]n\s+de\s+un\s+programa\s+de\s+posgrado/i
  );
  if (dirPosFxl != null) c.registroHorasSemanales.directorPosgrado = dirPosFxl;
  const coordFxl = inferRegistroExcelHoursNearRole(
    /coordinaci[oó]n\s+de\s+un\s+[áa]rea/i
  );
  if (coordFxl != null) c.registroHorasSemanales.coordinacionArea = coordFxl;

  // Strict role overrides (avoid cross-role numeric leakage).
  const invDescarga = captureNumberNear(
    text,
    /investigador\s+principal(?:es)?(?:\s+con\s+proyecto\s+aprobado)?/i,
    /(?:descarga|disminuci[oó]n|reducci[oó]n)[^.\n]{0,80}?\(?(\d+(?:[.,]\d+)?)\)?\s*horas?/i
  );
  if (invDescarga != null && defectoBase > 0) {
    c.docenciaDirecta.investigadorPrincipal = Math.max(0, defectoBase - invDescarga);
  }
  const invRegistro = captureNumberNear(
    text,
    /investigador\s+principal(?:es)?(?:\s+con\s+proyecto\s+aprobado)?/i,
    /excel[^.\n]{0,90}?(\d+(?:[.,]\d+)?)\s*horas?\s+semanales?/i
  );
  if (invRegistro != null && invRegistro > 0) c.registroHorasSemanales.investigadorPrincipal = invRegistro;

  const coInvDescarga = captureNumberNear(
    text,
    /co-?\s*investigador(?:es)?|coinvestigador(?:es)?/i,
    /(?:descarga|disminuci[oó]n|reducci[oó]n)[^.\n]{0,80}?\(?(\d+(?:[.,]\d+)?)\)?\s*horas?/i
  );
  if (coInvDescarga != null && defectoBase > 0) {
    c.docenciaDirecta.coinvestigador = Math.max(0, defectoBase - coInvDescarga);
  }
  const coInvRegistro = captureNumberNear(
    text,
    /co-?\s*investigador(?:es)?|coinvestigador(?:es)?/i,
    /excel[^.\n]{0,90}?(\d+(?:[.,]\d+)?)\s*horas?\s+semanales?/i
  );
  if (coInvRegistro != null && coInvRegistro > 0) c.registroHorasSemanales.coinvestigador = coInvRegistro;

  const posDescarga = captureNumberNear(
    text,
    /direcci[oó]n\s+de\s+un\s+programa\s+de\s+posgrado/i,
    /(?:descarga|disminuci[oó]n|reducci[oó]n)[^.\n]{0,80}?\(?(\d+(?:[.,]\d+)?)\)?\s*horas?/i
  );
  if (posDescarga != null && posDescarga >= 0) c.docenciaDirecta.directorPosgradoDescarga = posDescarga;
  const posRegistro = captureNumberNear(
    text,
    /direcci[oó]n\s+de\s+un\s+programa\s+de\s+posgrado/i,
    /excel[^.\n]{0,90}?(\d+(?:[.,]\d+)?)\s*horas?\s+semanales?/i
  );
  if (posRegistro != null && posRegistro > 0) c.registroHorasSemanales.directorPosgrado = posRegistro;

  const coordDescarga = captureNumberNear(
    text,
    /coordinaci[oó]n\s+de\s+un\s+[áa]rea/i,
    /(?:descarga|disminuci[oó]n|reducci[oó]n)[^.\n]{0,80}?\(?(\d+(?:[.,]\d+)?)\)?\s*horas?/i
  );
  if (coordDescarga != null && coordDescarga >= 0) c.docenciaDirecta.coordinacionAreaDescarga = coordDescarga;
  const coordRegistroStrict = captureNumberNear(
    text,
    /coordinaci[oó]n\s+de\s+un\s+[áa]rea/i,
    /excel[^.\n]{0,90}?(\d+(?:[.,]\d+)?)\s*horas?\s+semanales?/i
  );
  if (coordRegistroStrict != null && coordRegistroStrict > 0) c.registroHorasSemanales.coordinacionArea = coordRegistroStrict;

  // Final strict fixes for reported mismatches (extract from exact role block).
  const invZone = getRoleZone(/investigador\s+principal(?:es)?(?:\s+con\s+proyecto\s+aprobado)?/i);
  const invDesc = descargaFromZone(invZone);
  const invXls = excelFromZone(invZone);
  if (invDesc != null && defectoBase > 0) {
    c.docenciaDirecta.investigadorPrincipal = Math.max(0, defectoBase - invDesc);
  }
  if (invXls != null && invXls > 0) c.registroHorasSemanales.investigadorPrincipal = invXls;

  // Ultra-strict override for Art. 6.a to avoid taking values from neighboring roles.
  const invStrictZone = getBoundedRoleZone(
    /investigador\s+principal(?:es)?(?:\s+con\s+proyecto\s+aprobado)?/i,
    [
      /co-?\s*investigador(?:es)?|coinvestigador(?:es)?/i,
      /direcci[oó]n\s+de\s+un\s+programa\s+de\s+posgrado/i,
      /coordinaci[oó]n\s+de\s+un\s+[áa]rea/i,
      /formaci[oó]n\s+de\s+maestr[íi]a|docentes?\s+en\s+formaci[oó]n\s+de\s+maestr[íi]a/i,
      /art[íi]culo\s*7\b/i,
    ]
  );
  const invStrictDesc = descargaFromZone(invStrictZone);
  const invStrictXls =
    invStrictZone != null
      ? (() => {
          const m =
            invStrictZone.match(
              /excel[^.\n]{0,100}?(\d+(?:[.,]\d+)?)\s*horas?\s+semanales?[^.\n]{0,80}investigaci[oó]n/i
            ) ||
            invStrictZone.match(
              /registr(?:ar|ará|a)[^.\n]{0,120}?excel[^.\n]{0,80}?(\d+(?:[.,]\d+)?)\s*horas?\s+semanales?/i
            );
          if (!m?.[1]) return undefined;
          const n = Number(m[1].replace(",", "."));
          return Number.isFinite(n) ? n : undefined;
        })()
      : undefined;
  if (invStrictDesc != null && defectoBase > 0) {
    c.docenciaDirecta.investigadorPrincipal = Math.max(0, defectoBase - invStrictDesc);
  }
  if (invStrictXls != null && invStrictXls > 0) {
    c.registroHorasSemanales.investigadorPrincipal = invStrictXls;
  }

  const maesZone = getRoleZone(
    /formaci[oó]n\s+de\s+maestr[íi]a|docentes?\s+en\s+formaci[oó]n\s+de\s+maestr[íi]a/i
  );
  const maesDesc = descargaFromZone(maesZone);
  const maesXls = excelFromZone(maesZone);
  if (maesDesc != null && defectoBase > 0) {
    c.docenciaDirecta.formacionMaestria = Math.max(0, defectoBase - maesDesc);
  }
  if (maesXls != null && maesXls > 0) c.registroHorasSemanales.formacionMaestria = maesXls;

  // Formación doctoral: Fxl explícito "Se registrará ... X horas semanales"
  const formDocFxl = captureNumberNear(
    text,
    /docentes?\s+en\s+formaci[oó]n\s+de\s+doctorado/i,
    /registrar[áa]?\s+en\s+el\s+formato\s+de\s+excel\s+(\d+)\s*horas?\s+semanales?/i
  );
  if (formDocFxl != null && formDocFxl > 0) {
    c.registroHorasSemanales = c.registroHorasSemanales ?? {};
    c.registroHorasSemanales.formacionDoctorado = formDocFxl;
  }

  // Formación maestría: Fxl explícito
  const formMaesFxl = captureNumberNear(
    text,
    /docentes?\s+en\s+formaci[oó]n\s+de\s+maestr[íi]a/i,
    /registrar[áa]?\s+en\s+el\s+formato\s+de\s+excel\s+(\d+)\s*horas?\s+semanales?/i
  );
  if (formMaesFxl != null && formMaesFxl > 0) {
    c.registroHorasSemanales = c.registroHorasSemanales ?? {};
    c.registroHorasSemanales.formacionMaestria = formMaesFxl;
  }

  // Preparación de clase y asesoría por curso from Art.6 table
  const prep = text.match(/preparaci[oó]n\s+de\s+clase\s+([0-9]+(?:[.,][0-9]+)?)/i);
  if (prep?.[1]) {
    const n = Number(prep[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) c.docenciaIndirecta.preparacionClasePorHora = n;
  }
  if (/asesor[íi]a\s+estudiantes\s+una\s+hora\s+por\s+cada\s+curso\s+asignado/i.test(text)) {
    c.docenciaIndirecta.asesoriaPorCurso = 1;
  }

  return c;
}

function normalizeGeminiOutput(parsed: unknown): LineamientosData {
  // If Gemini already returned the expected structure, keep it.
  const direct = parsed as Partial<LineamientosData>;
  if (
    typeof direct?.horasSemestre === "number" &&
    typeof direct?.semanasSemestre === "number" &&
    typeof direct?.docenciaDirecta === "object" &&
    typeof direct?.docenciaIndirecta === "object"
  ) {
    return direct as LineamientosData;
  }

  const data = (parsed ?? {}) as GeminiPromptOutput & { error?: string };
  if (data.error) {
    throw new Error(`Gemini respondió error semántico: ${data.error}`);
  }

  const roles = data.valores_roles ?? {};
  const defecto = toPositiveOrZero(data.defecto, 0);

  // In current backend schema, these two fields are "descarga" hours.
  const directorPosgradoDd = roleDdFromKeys(roles, [
    "director_posgrado_x1",
    "director_posgrado",
  ]);
  const coordinadorAreaDd = roleDdFromKeys(roles, [
    "coordinador_area",
    "coordinacion_area",
  ]);
  const directorPosgradoDescarga =
    defecto > 0 && directorPosgradoDd > 0
      ? Math.max(0, defecto - directorPosgradoDd)
      : 0;
  const coordinacionAreaDescarga =
    defecto > 0 && coordinadorAreaDd > 0 ? Math.max(0, defecto - coordinadorAreaDd) : 0;

  const semanasSemestre = toPositiveOrZero(
    data.parametros_generales?.semanasSemestre,
    23
  );
  const horasContratoSemanal = toPositiveOrZero(
    data.parametros_generales?.horasContratoSemanal,
    40
  );
  const totalHorasSemestre = toPositiveOrZero(
    data.parametros_generales?.totalHorasSemestre,
    semanasSemestre * horasContratoSemanal
  );

  const otras = data.otras_actividades ?? {};
  return {
    version: "gemini-normalized-v2",
    horasSemestre: totalHorasSemestre,
    semanasSemestre,
    docenciaDirecta: {
      sinProyecto: defecto,
      investigadorPrincipal: roleDdFromKeys(roles, [
        "investigador_principal",
        "investigador",
      ]),
      coinvestigador: roleDdFromKeys(roles, ["co_investigador", "coinvestigador"]),
      directorPrograma: roleDdFromKeys(roles, [
        "jefes_depto_director_programa",
        "director_programa",
      ]),
      directorPosgradoDescarga,
      coordinacionAreaDescarga,
      formacionDoctorado: roleDdFromKeys(roles, [
        "formacion_doctoral",
        "formacion_doctorado",
      ]),
      formacionMaestria: roleDdFromKeys(roles, [
        "formacion_maestria",
        "formacion_magister",
      ]),
    },
    equivalenciasPosgrado: {
      especializacion: 1.5,
      maestria: 2.0,
      doctorado: 2.5,
    },
    docenciaIndirecta: {
      preparacionClasePorHora: toPositiveOrZero(otras.preparacion_clase, 0.5),
      asesoriaPorCurso: toPositiveOrZero(otras.asesoria_estudiantes_por_curso, 1),
      asesoriaTrabajoGradoPregrado: toPositiveOrZero(
        otras.asesoria_grado_pregrado_semestral,
        Number((15 / 23).toFixed(2))
      ),
      asesoriaTrabajoGradoMaestria: toPositiveOrZero(
        otras.asesoria_grado_maestria_semestral,
        Number((30 / 23).toFixed(2))
      ),
      asesoriaTrabajoGradoDoctorado: toPositiveOrZero(
        otras.asesoria_grado_doctorado_semestral,
        Number((45 / 23).toFixed(2))
      ),
      maxTrabajosGrado: 4,
    },
    actividadesAnexas: {
      liderColectivo: toPositiveOrZero(otras.lider_colectivo_semanal, 4),
      participacionColectivo: toPositiveOrZero(otras.participacion_colectivo_semanal, 2),
      comiteCurricular: toPositiveOrZero(otras.comite_curricular_semanal, 3),
      comiteBasicoFacultad: toPositiveOrZero(otras.comite_basico_facultad_semanal, 2),
      liderGrupoInvestigacion: toPositiveOrZero(
        otras.lider_grupo_investigacion_semanal,
        4
      ),
      liderRevista: toPositiveOrZero(otras.lider_revista_semanal, 2),
    },
    registroHorasSemanales: {
      sinProyecto: roleFxl(roles, "defecto"),
      investigadorPrincipal: roleFxlFromKeys(roles, [
        "investigador_principal",
        "investigador",
      ]),
      coinvestigador: roleFxlFromKeys(roles, ["co_investigador", "coinvestigador"]),
      directorPrograma: roleFxlFromKeys(roles, [
        "jefes_depto_director_programa",
        "director_programa",
      ]),
      directorPosgrado: roleFxlFromKeys(roles, [
        "director_posgrado_x1",
        "director_posgrado",
      ]),
      coordinacionArea: roleFxlFromKeys(roles, [
        "coordinador_area",
        "coordinacion_area",
      ]),
      formacionDoctorado: roleFxlFromKeys(roles, [
        "formacion_doctoral",
        "formacion_doctorado",
      ]),
      formacionMaestria: roleFxlFromKeys(roles, [
        "formacion_maestria",
        "formacion_magister",
      ]),
    },
    visualSettings: {
      form_bg_color: "#00804E",
    },
  };
}

const PROMPT = `Eres un extractor de configuración normativa académica. Tu única tarea es leer el texto del PDF proporcionado y devolver un JSON con los valores que rigen la Agenda Docente para ese semestre específico. Los valores cambian cada semestre; NUNCA uses valores de memoria o de documentos anteriores.

Sigue estos pasos en orden estricto:

---

### PASO 1 — Encontrar el DEFECTO (valor base universal)

Busca el párrafo del Artículo 6 que hable de docentes SIN proyecto de investigación. Ese párrafo contiene frases como:
- "Los docentes que no tengan aprobados proyectos de investigación durante el período académico tendrán a cargo X horas semanales de docencia durante el semestre"
- "docentes sin proyecto"
- "docentes que no tengan proyecto"

Extrae el número X de horas semanales. Ese número es el DEFECTO.
Ejemplo: "tendrán a cargo 18 horas semanales de docencia" → DEFECTO = 18

El DEFECTO es la base aritmética para calcular todos los demás roles que usen descarga.
Si no lo encuentras, detente y devuelve: { "error": "DEFECTO_NO_ENCONTRADO" }

---

### PASO 2 — Calcular "dd" (Docencia Directa) para cada rol

Para cada rol del Artículo 6, aplica EXACTAMENTE UNA de estas tres reglas según lo que diga el texto:

REGLA A — Carga directa explícita:
  El texto dice "tendrán X horas semanales de docencia directa" o "tendrán una asignación de hasta X horas semanales de docencia directa".
  → dd = X  (usar el número X tal cual, sin restar nada)
  Ejemplos reales observados:
  - "tendrán 10 horas semanales de docencia directa" → dd = 10
  - "tendrán una asignación de hasta 8 horas semanales de docencia directa" → dd = 8
  - "tendrán una asignación de hasta 9 horas semanales de docencia directa" → dd = 9
  - "tendrán una asignación de hasta de 12 horas de docencia directa" → dd = 12

REGLA B — Descarga o disminución sobre el DEFECTO:
  El texto dice "tendrán X horas semanales de descarga en docencia directa" o "tendrán una disminución/descarga de X horas semanales de docencia directa" o "podrán tener una reducción de hasta X horas semanales de docencia directa".
  → dd = DEFECTO − X  (restar X al DEFECTO)
  Ejemplos reales observados:
  - DEFECTO=18, "tendrán 6 horas semanales de descarga en docencia directa" → dd = 18 − 6 = 12
  - DEFECTO=18, "tendrán una descarga de 5 horas en docencia directa" → dd = 18 − 5 = 13
  - DEFECTO=18, "podrán tener una reducción de hasta 3 horas semanales de docencia directa" → dd = 18 − 3 = 15
  - DEFECTO=16, "tendrán una disminución de 5 horas semanales de docencia directa" → dd = 16 − 5 = 11

REGLA C — Roles sin horas numéricas (roles administrativos altos):
  Aplica SOLO cuando el texto NO tenga un número de horas semanales explícito y únicamente hable de cursos.
  Si aparece "X horas semanales ... (o N cursos)", prevalece X horas (REGLA A).
  → dd = "Solo N curso(s)" (texto literal)
  Ejemplos reales observados:
  - "tendrán la asignación de dos cursos (pregrado o posgrado)" → dd = "Solo 2 cursos"
  - "tendrán la asignación de un curso en su plan de trabajo semestral" → dd = "Solo 1 curso"
  - "tendrán a cargo 6 horas semanales de docencia (o dos cursos en pregrado y/o posgrado)" → dd = "Solo 2 cursos"

REGLA DE ACUMULACIÓN (aplica solo a Director de Posgrado):
  El documento siempre incluye una nota que dice "Un mismo docente de planta podrá asumir máximo 2 direcciones de posgrados, siendo acumulable la disminución de docencia directa".
  → Siempre genera DOS entradas separadas:
    director_posgrado_x1: dd = DEFECTO − X,  Fxl = Fxl_unitario
    director_posgrado_x2: dd = DEFECTO − X − X,  Fxl = Fxl_unitario × 2

---

### PASO 3 — Extraer "Fxl" (horas a registrar en Formato Excel) para cada rol

Inmediatamente después de cada párrafo de rol, busca la frase de registro. Esa frase siempre aparece en el mismo párrafo o en el párrafo siguiente al del rol. Tiene alguna de estas formas:
- "Se registrará en el formato de Excel X horas semanales de investigación (...)"
- "Se registrará en el formato de Excel X horas semanales (...)"
- "Se registrará en el formato de Excel X horas semanales"

El número X justo después de "Excel" es el valor Fxl para ese rol.

Ejemplos reales observados por rol:
- Investigador principal → "Se registrará en el formato de Excel 11 horas semanales de investigación" → Fxl = 11
- Co-investigador → "Se registrará en el formato de Excel 6 horas semanales de investigación" → Fxl = 6
- Director posgrado x1 → "Se registrará en el formato de Excel 9 horas semanales" → Fxl = 9
- Director posgrado x2 → Fxl = 9 × 2 = 18 (por acumulación, ver Paso 2)
- Coordinador de área → "Se registrará en el formato de Excel 6 horas semanales" → Fxl = 6
- Formación doctoral → "Se registrará en el formato de Excel 17 horas semanales" → Fxl = 17  (puede variar: 15 en otros semestres)
- Formación maestría → "Se registrará en el formato de Excel 9 horas semanales" → Fxl = 9  (puede variar: 7 en otros semestres)

Si la frase "Se registrará en el formato de Excel" NO aparece para un rol → Fxl = "No aplica"
Roles que históricamente NO tienen frase de registro (Fxl = "No aplica"):
- Defecto (sin proyecto)
- Jefes de departamento / Directores de programa
- Decanos / Vicerrector / Director de Doctorado
- Formación pedagógica

---

### PASO 4 — Extraer parámetros generales y actividades complementarias

PARÁMETROS GENERALES — busca en el Artículo 4 la frase:
"período semestral (de X semanas, de Y horas cada una, para un total de Z horas al semestre)"
→ semanasSemestre = X, horasContratoSemanal = Y, totalHorasSemestre = Z
Valores históricos estables (pueden cambiar): X=23, Y=40, Z=920

ACTIVIDADES COMPLEMENTARIAS — busca al final del Artículo 6 la tabla de tiempos. Esa tabla siempre aparece con este formato:
"Preparación de clase    0,5 hora por cada hora programada"
"Asesoría Estudiantes    una hora por cada curso asignado"
"Líder Colectivo    4 horas (semanal)"
"Participación en Colectivo    2 horas (semanal)"
"Asesoría Práctica    10 horas (semestre)"
"Asesoría Trabajo de Grado Pregrado    15 horas (semestre)"
"Asesoría Trabajo de Grado Posgrado (Maestría)    30 horas (semestre)"
"Asesoría Trabajo de Grado Posgrado (Doctorado)    45 horas (semestre)"
"Comité Curricular    3 horas (semanal)"
"Comité Básico de Facultad    2 horas (semanal)"
"Líder Grupo de Investigación    4 horas (semanal)"
"Líder de Revista    2 horas (semanal)"

Extrae cada valor numérico exactamente como aparece en el texto. Si "una hora" está escrito en palabras, conviértelo a 1.
Si un número tiene coma decimal (ej. "0,5") conviértelo a punto decimal (0.5).

---

### REGLAS DE ROBUSTEZ (aplican siempre, sin importar el semestre)

- NUNCA uses valores de semestres anteriores. Cada PDF es independiente.
- Aplica REGLA A o REGLA B según la redacción exacta del párrafo. La misma clave puede usar REGLA A en un semestre y REGLA B en otro; la redacción del PDF manda siempre.
- Si un rol desaparece del PDF → omite su clave del JSON.
- Si aparece un rol nuevo no contemplado en la estructura → agrégalo bajo "valores_roles" con su nombre en snake_case.
- Si un valor es ambiguo o no fue encontrado → usa el string "NO_ENCONTRADO".
- No inferas ni calcules valores que no estén explícitamente escritos en el texto del PDF.

---

### FORMATO DE SALIDA

Devuelve ÚNICAMENTE el objeto JSON. Sin markdown, sin bloques de código, sin texto explicativo antes o después. Comienza directamente con { y termina con }.

{
  "parametros_generales": {
    "semanasSemestre": 0,
    "horasContratoSemanal": 0,
    "totalHorasSemestre": 0
  },
  "defecto": 0,
  "valores_roles": {
    "defecto": { "dd": 0, "Fxl": "No aplica" },
    "investigador_principal": { "dd": 0, "Fxl": 0 },
    "co_investigador": { "dd": 0, "Fxl": 0 },
    "jefes_depto_director_programa": { "dd": "Solo 2 cursos", "Fxl": "No aplica" },
    "director_posgrado_x1": { "dd": 0, "Fxl": 0 },
    "director_posgrado_x2": { "dd": 0, "Fxl": 0 },
    "coordinador_area": { "dd": 0, "Fxl": 0 },
    "decano_vicerrector_director_doctorado": { "dd": "Solo 1 curso", "Fxl": "No aplica" },
    "formacion_doctoral": { "dd": 0, "Fxl": 0 },
    "formacion_maestria": { "dd": 0, "Fxl": 0 },
    "formacion_pedagogica": { "dd": 0, "Fxl": "No aplica" }
  },
  "otras_actividades": {
    "preparacion_clase": 0.0,
    "asesoria_estudiantes_por_curso": 0,
    "lider_colectivo_semanal": 0,
    "participacion_colectivo_semanal": 0,
    "asesoria_practica_semestral": 0,
    "asesoria_grado_pregrado_semestral": 0,
    "asesoria_grado_maestria_semestral": 0,
    "asesoria_grado_doctorado_semestral": 0,
    "comite_curricular_semanal": 0,
    "comite_basico_facultad_semanal": 0,
    "lider_grupo_investigacion_semanal": 0,
    "lider_revista_semanal": 0
  }
}`;

export async function interpretLineamientosWithGemini(filePath: string): Promise<LineamientosData> {
  const rawText = await extractTextFromPDF(filePath);
  const relevantText = extractArticles4to6(rawText);
  console.log("=== PROCESANDO PDF CON GEMINI ===");

  if (!relevantText.trim()) {
    throw new Error("El PDF no contiene texto extraíble");
  }

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await model.generateContent(
      `${PROMPT}\n\nTexto del documento (solo Artículo 4 al 6):\n${relevantText}`
    );
    const responseText = result.response.text();
    
    const parsed = JSON.parse(responseText) as unknown;
    const normalized = normalizeGeminiOutput(parsed);
    return enrichFromArticlesText(normalized, relevantText);
  } catch (e) {
    console.warn("Fallo al procesar con Gemini, intentando extracción fallback", e);
    const fallback = fallbackExtract(relevantText);
    return enrichFromArticlesText(fallback, relevantText);
  }
}