import { supabase } from './supabaseClient';
import type { Analyst, EscalaKind, EscalaWithAnalysts, Notice } from './types';

export const ESCALA_SELECT =
  'id, kind, title, start_value, end_value, note, schedule_date, generated_from_plantao, active, created_at, escala_analysts(schedule_start, schedule_end, schedule_note, analyst_id(*))';

interface RawEscalaLink {
  analyst_id: Analyst | Analyst[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_note: string | null;
}

interface RawEscala {
  id: string;
  kind: EscalaKind;
  title: string;
  start_value: string | null;
  end_value: string | null;
  note: string | null;
  schedule_date: string | null;
  generated_from_plantao: string | null;
  active: boolean;
  created_at: string;
  escala_analysts: RawEscalaLink[] | null;
}

/** Converte o retorno do embed aninhado do PostgREST em uma lista de analistas. */
function resolveAnalysts(escala: RawEscala): EscalaWithAnalysts {
  const analysts: EscalaWithAnalysts['analysts'] = [];
  for (const link of escala.escala_analysts ?? []) {
    const a = link.analyst_id;
    if (Array.isArray(a)) {
      analysts.push(...a.filter((x): x is Analyst => Boolean(x)).map((x) => ({ ...x, schedule_start: link.schedule_start, schedule_end: link.schedule_end, schedule_note: link.schedule_note })));
    } else if (a) {
      analysts.push({ ...a, schedule_start: link.schedule_start, schedule_end: link.schedule_end, schedule_note: link.schedule_note });
    }
  }
  const { escala_analysts: _omit, ...rest } = escala;
  return { ...rest, analysts };
}

/** Data operacional usada para arquivar plantões, independente do fuso do dispositivo. */
export function operationToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

export function isArchivedPlantao(escala: EscalaWithAnalysts, today = operationToday()): boolean {
  return escala.kind === 'plantao' && Boolean(escala.end_value) && escala.end_value! < today;
}

export async function fetchPublicData(): Promise<{ notices: Notice[]; escalas: EscalaWithAnalysts[] }> {
  const [noticesRes, escalasRes, absencesRes] = await Promise.all([
    supabase.from('notices').select('*').eq('active', true).order('created_at', { ascending: true }),
    supabase.from('escalas').select(ESCALA_SELECT).eq('active', true).order('created_at', { ascending: true }),
    supabase.rpc('active_absent_analyst_ids'),
  ]);

  if (noticesRes.error) throw new Error(noticesRes.error.message);
  if (escalasRes.error) throw new Error(escalasRes.error.message);
  if (absencesRes.error) throw new Error(absencesRes.error.message);
  const absentIds = new Set((absencesRes.data ?? []).map((row: { analyst_id: string }) => row.analyst_id));

  const resolved = ((escalasRes.data ?? []) as unknown as RawEscala[])
    .map(resolveAnalysts)
    .map((escala) => ({ ...escala, analysts: escala.analysts.filter((analyst) => !absentIds.has(analyst.id)) }));
  const archivedPlantaoIds = new Set(resolved.filter((escala) => isArchivedPlantao(escala)).map((escala) => escala.id));

  return {
    notices: noticesRes.data ?? [],
    escalas: resolved.filter((escala) => !isArchivedPlantao(escala) && !archivedPlantaoIds.has(escala.generated_from_plantao ?? '')),
  };
}

export async function fetchAllEscalas(): Promise<EscalaWithAnalysts[]> {
  const { data, error } = await supabase
    .from('escalas')
    .select(ESCALA_SELECT)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawEscala[]).map(resolveAnalysts);
}

export async function fetchAnalysts(): Promise<Analyst[]> {
  const { data, error } = await supabase.from('analysts').select('*').order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchNotices(): Promise<Notice[]> {
  const { data, error } = await supabase.from('notices').select('*').order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
