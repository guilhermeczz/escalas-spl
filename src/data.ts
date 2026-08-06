import { supabase } from './supabaseClient';
import type { Analyst, EscalaKind, EscalaWithAnalysts, Notice } from './types';

export const ESCALA_SELECT =
  'id, kind, title, start_value, end_value, note, active, created_at, escala_analysts(schedule_start, schedule_end, schedule_note, analyst_id(*))';

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

export async function fetchPublicData(): Promise<{ notices: Notice[]; escalas: EscalaWithAnalysts[] }> {
  const [noticesRes, escalasRes] = await Promise.all([
    supabase.from('notices').select('*').eq('active', true).order('created_at', { ascending: false }),
    supabase.from('escalas').select(ESCALA_SELECT).eq('active', true).order('created_at', { ascending: true }),
  ]);

  if (noticesRes.error) throw new Error(noticesRes.error.message);
  if (escalasRes.error) throw new Error(escalasRes.error.message);

  return {
    notices: noticesRes.data ?? [],
    escalas: ((escalasRes.data ?? []) as unknown as RawEscala[]).map(resolveAnalysts),
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
  const { data, error } = await supabase.from('notices').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
