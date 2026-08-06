/** Utilitários de formatação de data/hora e renderização. */

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function formatTime(value: string): string {
  return value.length === 5 ? `${value}h` : value;
}

export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** "Hoje" em YYYY-MM-DD (timezone local). */
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Hora atual em HH:MM (timezone local). */
export function nowTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** O intervalo [start, end] inclui a data de hoje? */
export function dateRangeIncludesToday(start: string, end: string): boolean {
  return todayKey() >= start && todayKey() <= end;
}

/** O intervalo [start, end] inclui a hora atual? */
export function timeRangeIncludesNow(start: string, end: string): boolean {
  return nowTime() >= start && nowTime() <= end;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}

export function todayBR(): string {
  const d = new Date();
  const weekdays = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  return `${weekdays[d.getDay()]}, ${pad(d.getDate())} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

export const KIND_LABEL: Record<string, string> = {
  horario: 'Escala URA',
  plantao: 'Plantão',
  almoco: 'Almoço',
};
