export type EscalaKind = 'horario' | 'plantao' | 'almoco';

export interface Analyst {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  extension: string | null;
  slack_user_id: string | null;
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
  generated_from_plantao?: string | null;
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

export type ImprovementCategory = 'bug' | 'new_implementation' | 'process_improvement';

export interface ImprovementRequest {
  id: string; title: string; description: string; category: ImprovementCategory;
  created_at: string; author_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  reviewed_at: string | null; reviewed_by: string | null;
  profiles: { name: string | null; email: string } | null;
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
