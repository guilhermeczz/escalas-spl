import imageCompression from 'browser-image-compression';
import { supabase } from '../supabaseClient';
import { fetchAnalysts } from '../data';
import { escapeHtml, formatDateTime, initials } from '../utils';
import { errMessage, toast } from './ui';
import { analystAvatar, loadAnalystAvatars } from './analystAvatars';

const MEDIA_BUCKET = 'recognition-media';
const MAX_MEDIA_SIZE = 30 * 1024 * 1024;
const allowedAudio = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/ogg', 'audio/webm'];
const allowedImages = ['image/png', 'image/jpeg', 'image/webp'];

type RecognitionRow = {
  id: string;
  title: string;
  message: string;
  media_type: string | null;
  created_at: string;
  slack_sent_at: string | null;
  slack_error: string | null;
  analysts: { id: string; name: string; color: string } | Array<{ id: string; name: string; color: string }> | null;
};

function fileExtension(type: string): string {
  const extensions: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
    'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
  };
  return extensions[type] ?? 'bin';
}

export async function refreshRecognitionHistory(root: HTMLElement) {
  const history = root.querySelector<HTMLElement>('#recognitionHistory');
  if (!history) return;
  const [{ data, error }] = await Promise.all([supabase
    .from('recognition_posts')
    .select('id,title,message,media_type,created_at,slack_sent_at,slack_error,analysts(id,name,color)')
    .order('created_at', { ascending: false })
    .limit(30), loadAnalystAvatars()]);
  if (error) { history.innerHTML = `<div class="empty-inline">${escapeHtml(error.message)}</div>`; return; }
  const rows = (data ?? []) as unknown as RecognitionRow[];
  history.innerHTML = rows.map((row) => {
    const analyst = Array.isArray(row.analysts) ? row.analysts[0] : row.analysts;
    const name = analyst?.name ?? 'Analista';
    return `<article class="recognition-history-row">
      ${analyst ? analystAvatar(analyst, 'avatar-xs') : `<span class="avatar avatar-xs" style="background:#64748b">${initials(name)}</span>`}
      <div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(row.title)}</span><small>${formatDateTime(row.created_at)}${row.media_type ? ` · ${row.media_type.startsWith('audio/') ? 'Áudio' : 'Imagem'}` : ''}</small>${row.slack_error && !row.slack_sent_at ? `<em>${escapeHtml(row.slack_error)}</em>` : ''}</div>
      <span class="chip chip-${row.slack_sent_at ? 'ok' : 'warn'}">${row.slack_sent_at ? 'Publicado no Slack' : 'Envio pendente'}</span>
      ${row.slack_sent_at ? '' : `<button class="btn-mini" data-retry-recognition="${row.id}" type="button">Tentar novamente</button>`}
    </article>`;
  }).join('') || '<div class="empty-inline">Os reconhecimentos publicados aparecerão aqui.</div>';

  history.querySelectorAll<HTMLButtonElement>('[data-retry-recognition]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    const { data: result, error: invokeError } = await supabase.functions.invoke('send-recognition', { body: { recognitionId: button.dataset.retryRecognition } });
    if (invokeError || result?.error) toast(result?.error ?? invokeError?.message ?? 'Não foi possível concluir o envio. Tente novamente.', 'error');
    else toast('Reconhecimento publicado no Slack com sucesso.');
    await refreshRecognitionHistory(root);
  }));
}

export async function initRecognitions(root: HTMLElement) {
  const analysts = await fetchAnalysts();
  root.innerHTML = `<div class="recognition-layout">
    <form id="recognitionForm" class="recognition-compose">
      <div class="recognition-intro"><span>★</span><div><strong>Criar reconhecimento</strong><p>Transforme um bom trabalho em uma mensagem especial para toda a equipe.</p></div></div>
      <div class="field"><label for="recognitionAnalyst">Quem você quer reconhecer? *</label><select id="recognitionAnalyst" required><option value="">Selecione um analista</option>${analysts.map((analyst) => `<option value="${analyst.id}">${escapeHtml(analyst.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="recognitionTitle">Título da homenagem *</label><input id="recognitionTitle" maxlength="80" minlength="3" value="Parabéns pelo excelente trabalho!" required /><small>Uma frase curta que resuma o motivo do reconhecimento.</small></div>
      <div class="field"><label for="recognitionMessage">Mensagem de reconhecimento *</label><textarea id="recognitionMessage" rows="5" maxlength="1200" minlength="10" placeholder="Conte o que a pessoa fez e por que essa atitude merece ser reconhecida." required></textarea><small>Seja específico: destaque a atitude, o resultado ou o impacto positivo.</small></div>
      <div class="field"><label>Foto ou áudio <span class="muted">(opcional)</span></label><label id="recognitionDropzone" class="recognition-dropzone" for="recognitionMedia"><input id="recognitionMedia" class="hidden" type="file" accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,audio/webm,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.ogg,.webm" /><span class="dropzone-icon">＋</span><strong>Arraste o arquivo para cá</strong><small>ou clique para selecionar no computador · limite de 30 MB</small></label><div id="recognitionMediaPreview" class="recognition-media-preview hidden"></div></div>
      <div class="recognition-publish-note"><strong>Pronto para compartilhar?</strong><span>A publicação será enviada ao canal do suporte e notificará o analista e toda a equipe. A foto aparecerá no cartão; o áudio ficará disponível no botão “Ouvir áudio”.</span></div>
      <button class="btn-primary recognition-submit" type="submit">Publicar no Slack</button>
    </form>
    <aside class="recognition-history"><div class="recognition-history-head"><div><strong>Publicações recentes</strong><span>Acompanhe os últimos reconhecimentos enviados</span></div></div><div id="recognitionHistory"><div class="list-loading">Buscando publicações...</div></div></aside>
  </div>`;

  const form = root.querySelector<HTMLFormElement>('#recognitionForm')!;
  const input = root.querySelector<HTMLInputElement>('#recognitionMedia')!;
  const dropzone = root.querySelector<HTMLElement>('#recognitionDropzone')!;
  const preview = root.querySelector<HTMLElement>('#recognitionMediaPreview')!;
  let selectedFile: File | null = null;
  let previewUrl: string | null = null;

  const clearFile = () => {
    selectedFile = null;
    input.value = '';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    preview.classList.add('hidden');
    preview.innerHTML = '';
    dropzone.classList.remove('hidden');
  };
  const chooseFile = async (file: File) => {
    if (![...allowedImages, ...allowedAudio].includes(file.type)) { toast('Formato não aceito. Escolha uma imagem PNG, JPEG ou WebP, ou um áudio MP3, M4A, WAV, OGG ou WebM.', 'error'); return; }
    if (file.size > MAX_MEDIA_SIZE) { toast('Este arquivo ultrapassa o limite de 30 MB. Escolha um arquivo menor.', 'error'); return; }
    dropzone.classList.add('processing');
    try {
      selectedFile = allowedImages.includes(file.type)
        ? await imageCompression(file, { maxSizeMB: 8, maxWidthOrHeight: 2560, useWebWorker: true, initialQuality: .9, fileType: file.type, preserveExif: false })
        : file;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(selectedFile);
      preview.innerHTML = `${selectedFile.type.startsWith('image/') ? `<img src="${previewUrl}" alt="Prévia da mídia" />` : `<audio src="${previewUrl}" controls></audio>`}<div><strong>${escapeHtml(selectedFile.name)}</strong><small>${(selectedFile.size / 1024 / 1024).toFixed(1)} MB · ${selectedFile.type}</small></div><button class="btn-mini btn-mini-danger" type="button">Remover</button>`;
      preview.classList.remove('hidden');
      dropzone.classList.add('hidden');
      preview.querySelector('button')!.addEventListener('click', clearFile);
    } catch (error) {
      toast(errMessage(error), 'error');
      clearFile();
    } finally {
      dropzone.classList.remove('processing');
    }
  };

  input.addEventListener('change', () => { const file = input.files?.[0]; if (file) void chooseFile(file); });
  ['dragenter', 'dragover'].forEach((type) => dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); }));
  dropzone.addEventListener('drop', (event) => { const file = event.dataTransfer?.files[0]; if (file) void chooseFile(file); });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.disabled = true;
    button.textContent = 'Publicando no Slack...';
    let mediaPath: string | null = null;
    let postCreated = false;
    try {
      if (selectedFile) {
        mediaPath = `${crypto.randomUUID()}.${fileExtension(selectedFile.type)}`;
        const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(mediaPath, selectedFile, { contentType: selectedFile.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      const { data: post, error } = await supabase.from('recognition_posts').insert({
        analyst_id: root.querySelector<HTMLSelectElement>('#recognitionAnalyst')!.value,
        title: root.querySelector<HTMLInputElement>('#recognitionTitle')!.value.trim(),
        message: root.querySelector<HTMLTextAreaElement>('#recognitionMessage')!.value.trim(),
        media_path: mediaPath,
        media_type: selectedFile?.type ?? null,
      }).select('id').single();
      if (error) throw error;
      postCreated = true;
      const { data: result, error: invokeError } = await supabase.functions.invoke('send-recognition', { body: { recognitionId: post.id } });
      if (invokeError || result?.error) throw new Error(result?.error ?? invokeError?.message ?? 'Não foi possível publicar no Slack. Tente novamente.');
      toast('Reconhecimento publicado! O analista e a equipe foram notificados.');
      form.reset();
      root.querySelector<HTMLInputElement>('#recognitionTitle')!.value = 'Parabéns pelo excelente trabalho!';
      clearFile();
      await refreshRecognitionHistory(root);
    } catch (error) {
      if (mediaPath && !postCreated) await supabase.storage.from(MEDIA_BUCKET).remove([mediaPath]);
      toast(errMessage(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Publicar no Slack';
    }
  });

  await refreshRecognitionHistory(root);
}
