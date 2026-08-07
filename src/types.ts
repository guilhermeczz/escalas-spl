export type EscalaKind = 'horario' | 'plantao' | 'almoco';

export interface Analyst {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  extension: string | null;
  color: string;
  created_at: string;
}

export interface Escala {
  id: string;
  kind: EscalaKind;
  title: string;
  start_value: string | null;
  end_value: string | null;
  note: string | null;
  schedule_date?: string | null;
  active: boolean;
  created_at: string;
  escala_analysts?: { analyst_id: Analyst | null }[];
}

export interface Notice {
  id: string;
  text: string;
  active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
  analyst_id: string | null;
}

/** Escala já resolvida com a lista de analistas vinculados. */
export interface EscalaWithAnalysts extends Escala {
  analysts: ScheduledAnalyst[];
}

export interface ScheduledAnalyst extends Analyst {
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_note: string | null;
}
