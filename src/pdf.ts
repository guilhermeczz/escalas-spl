import { jsPDF } from 'jspdf';
import type { EscalaWithAnalysts } from './types';
import { formatDateBR, formatTime, KIND_LABEL } from './utils';

function period(escala: EscalaWithAnalysts): string {
  if (escala.kind === 'horario') return `${formatTime(escala.start_value ?? '')} às ${formatTime(escala.end_value ?? '')}`;
  if (escala.kind === 'plantao') return `${formatDateBR(escala.start_value ?? '')} a ${formatDateBR(escala.end_value ?? '')}`;
  return escala.note?.trim() || 'Horário definido diariamente';
}

function fileName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

export function downloadEscalasPdf(escalas: EscalaWithAnalysts[]): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 18;
  let y = 20;
  const ensureSpace = (needed: number) => { if (y + needed > height - 18) { doc.addPage(); y = 20; } };

  doc.setFillColor(11, 49, 94);
  doc.rect(0, 0, width, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Escalas - Controle de Acesso', margin, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`, margin, 24);
  y = 44;

  for (const escala of escalas) {
    ensureSpace(30 + Math.max(1, escala.analysts.length) * 7);
    doc.setTextColor(11, 49, 94);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(escala.title, margin, y);
    y += 6;
    doc.setTextColor(80, 96, 112);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`${KIND_LABEL[escala.kind]} - ${period(escala)}`, margin, y);
    y += 7;
    doc.setDrawColor(215, 223, 231);
    doc.line(margin, y, width - margin, y);
    y += 7;
    if (!escala.analysts.length) {
      doc.text('Nenhum analista vinculado.', margin + 3, y);
      y += 7;
    } else {
      const orderedAnalysts = escala.kind === 'almoco'
        ? [...escala.analysts].sort((a, b) => (a.schedule_start ?? '99:99').localeCompare(b.schedule_start ?? '99:99'))
        : escala.analysts;
      for (const analyst of orderedAnalysts) {
        doc.setTextColor(30, 45, 60);
        doc.setFont('helvetica', 'bold');
        const individualTime = escala.kind === 'almoco' && analyst.schedule_start && analyst.schedule_end
          ? ` - ${formatTime(analyst.schedule_start)} às ${formatTime(analyst.schedule_end)}`
          : '';
        doc.text(`• ${analyst.name}${individualTime}`, margin + 3, y);
        if (analyst.role) {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 110, 120);
          doc.text(analyst.role, width - margin, y, { align: 'right' });
        }
        y += 7;
      }
    }
    y += 8;
  }

  const base = escalas.length === 1 ? fileName(escalas[0].title) : 'escalas-selecionadas';
  doc.save(`${base || 'escala'}.pdf`);
}
