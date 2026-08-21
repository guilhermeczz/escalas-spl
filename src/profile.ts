import { supabase } from './supabaseClient';
import imageCompression from 'browser-image-compression';
import { applyAppearance, type ColorPalette, type Theme } from './theme';
import { escapeHtml, initials } from './utils';

const AVATAR_BUCKET = 'profile-photos';
const MAX_PHOTO_SIZE = 30 * 1024 * 1024;
const CROP_SIZE = 280;

export interface AnalystProfileContext {
  userId: string;
  name: string;
  email: string;
  extension: string | null;
  role: string | null;
  birthDate: string | null;
  avatarPath: string | null;
  themeMode: Theme;
  colorPalette: ColorPalette;
}

type Toast = (message: string) => void;

async function signedAvatarUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
}

function updateHeaderAvatar(name: string, url: string | null) {
  const image = document.querySelector<HTMLImageElement>('#headerProfileImage')!;
  const fallback = document.querySelector<HTMLElement>('#headerProfileInitials')!;
  fallback.textContent = initials(name);
  image.classList.toggle('hidden', !url);
  fallback.classList.toggle('hidden', Boolean(url));
  if (url) image.src = url;
  else image.removeAttribute('src');
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
    image.src = url;
  });
}

async function openCropEditor(sourceUrl: string): Promise<Blob | null> {
  const source = await loadImage(sourceUrl);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay crop-editor-overlay';
  overlay.innerHTML = `<div class="modal crop-editor-modal" role="dialog" aria-modal="true" aria-labelledby="cropTitle">
    <div class="modal-head"><div><h3 id="cropTitle">Enquadrar foto</h3><p class="toolbar-sub">Arraste a imagem e ajuste o zoom</p></div><button class="modal-close" type="button" aria-label="Fechar">✕</button></div>
    <div class="modal-body">
      <div class="crop-stage" aria-label="Área de recorte"><img alt="Prévia para recorte" draggable="false" /></div>
      <label class="crop-zoom"><span>Zoom</span><input type="range" min="1" max="3" step="0.01" value="1" /></label>
      <div class="modal-actions"><button class="btn-ghost crop-cancel" type="button">Cancelar</button><button class="btn-primary crop-confirm" type="button">Usar esta foto</button></div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const preview = overlay.querySelector<HTMLImageElement>('.crop-stage img')!;
  const stage = overlay.querySelector<HTMLElement>('.crop-stage')!;
  const zoomInput = overlay.querySelector<HTMLInputElement>('.crop-zoom input')!;
  const baseScale = Math.max(CROP_SIZE / source.naturalWidth, CROP_SIZE / source.naturalHeight);
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragStart: { x: number; y: number; offsetX: number; offsetY: number } | null = null;

  preview.src = sourceUrl;
  const clampOffsets = () => {
    const width = source.naturalWidth * baseScale * zoom;
    const height = source.naturalHeight * baseScale * zoom;
    offsetX = Math.max(-(width - CROP_SIZE) / 2, Math.min((width - CROP_SIZE) / 2, offsetX));
    offsetY = Math.max(-(height - CROP_SIZE) / 2, Math.min((height - CROP_SIZE) / 2, offsetY));
    preview.style.width = `${width}px`;
    preview.style.height = `${height}px`;
    preview.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`;
  };
  clampOffsets();

  stage.addEventListener('pointerdown', (event) => {
    dragStart = { x: event.clientX, y: event.clientY, offsetX, offsetY };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    offsetX = dragStart.offsetX + event.clientX - dragStart.x;
    offsetY = dragStart.offsetY + event.clientY - dragStart.y;
    clampOffsets();
  });
  const endDrag = () => { dragStart = null; stage.classList.remove('dragging'); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  zoomInput.addEventListener('input', () => {
    zoom = Number(zoomInput.value);
    clampOffsets();
  });

  return new Promise((resolve) => {
    const close = (result: Blob | null) => { overlay.remove(); resolve(result); };
    overlay.querySelector('.modal-close')!.addEventListener('click', () => close(null));
    overlay.querySelector('.crop-cancel')!.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(null); });
    overlay.querySelector('.crop-confirm')!.addEventListener('click', () => {
      const renderedScale = baseScale * zoom;
      const renderedWidth = source.naturalWidth * renderedScale;
      const renderedHeight = source.naturalHeight * renderedScale;
      const imageLeft = (CROP_SIZE - renderedWidth) / 2 + offsetX;
      const imageTop = (CROP_SIZE - renderedHeight) / 2 + offsetY;
      const sourceX = -imageLeft / renderedScale;
      const sourceY = -imageTop / renderedScale;
      const sourceSize = CROP_SIZE / renderedScale;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 512, 512);
      context.drawImage(source, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 512, 512);
      canvas.toBlob((blob) => close(blob), 'image/jpeg', .9);
    });
  });
}

function paletteOptions(selected: ColorPalette): string {
  const options: Array<{ value: ColorPalette; name: string; colors: string[] }> = [
    { value: 'dark', name: 'Dark', colors: ['#111827', '#374151', '#9ca3af'] },
    { value: 'pink', name: 'Pink', colors: ['#67234f', '#d43f8d', '#f9a8d4'] },
    { value: 'blue', name: 'Blue', colors: ['#13315c', '#1e88e5', '#93c5fd'] },
    { value: 'green', name: 'Green', colors: ['#164e3b', '#15966a', '#86efac'] },
  ];
  return options.map((option) => `<button class="palette-option ${selected === option.value ? 'selected' : ''}" type="button" data-profile-palette="${option.value}" aria-pressed="${selected === option.value}"><span>${option.colors.map((color) => `<i style="background:${color}"></i>`).join('')}</span><strong>${option.name}</strong></button>`).join('');
}

export async function initAnalystProfile(context: AnalystProfileContext, toast: Toast) {
  let avatarUrl = await signedAvatarUrl(context.avatarPath);
  updateHeaderAvatar(context.name, avatarUrl);
  applyAppearance(context.themeMode, context.colorPalette);

  const trigger = document.querySelector<HTMLButtonElement>('#analystProfileButton')!;
  trigger.classList.remove('hidden');
  trigger.addEventListener('click', () => {
    const initialTheme = context.themeMode;
    const initialPalette = context.colorPalette;
    let selectedTheme = context.themeMode;
    let selectedPalette = context.colorPalette;
    let pendingPhoto: Blob | null = null;
    let pendingPreviewUrl: string | null = null;
    let removeAvatar = false;
    let saved = false;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay profile-overlay';
    overlay.innerHTML = `<div class="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profileTitle">
      <div class="modal-head"><div><h3 id="profileTitle">Meu perfil</h3><p class="toolbar-sub">Informações pessoais e aparência do sistema</p></div><button class="modal-close" type="button" aria-label="Fechar">✕</button></div>
      <form class="modal-body profile-form">
        <section class="profile-personal-card">
          <div class="profile-photo-column">
            <div class="profile-photo-preview"><span>${initials(context.name)}</span><img class="${avatarUrl ? '' : 'hidden'}" src="${avatarUrl ?? ''}" alt="Foto de ${escapeHtml(context.name)}" /></div>
            <input id="profilePhotoInput" class="hidden" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" />
            <div class="profile-photo-actions"><button class="btn-mini" data-photo-action="upload" type="button">${avatarUrl ? 'Trocar foto' : 'Enviar foto'}</button><button class="btn-mini ${avatarUrl ? '' : 'hidden'}" data-photo-action="edit" type="button">Enquadrar</button><button class="btn-mini btn-mini-danger ${avatarUrl ? '' : 'hidden'}" data-photo-action="remove" type="button">Excluir</button></div>
            <small>PNG ou JPEG · até 30 MB · compressão automática</small>
          </div>
          <div class="profile-personal-info"><span class="profile-eyebrow">Analista</span><h4>${escapeHtml(context.name)}</h4><p>${escapeHtml(context.email)}</p><dl><div><dt>Função</dt><dd>${escapeHtml(context.role ?? 'Analista')}</dd></div><div><dt>Ramal</dt><dd>${escapeHtml(context.extension ?? 'Não informado')}</dd></div></dl><div class="field"><label for="profileBirthDate">Data de nascimento</label><input id="profileBirthDate" type="date" min="1900-01-01" max="${new Date().toLocaleDateString('sv-SE')}" value="${context.birthDate ?? ''}" /></div></div>
        </section>
        <section class="appearance-settings"><div class="profile-section-heading"><strong>Aparência</strong><span>Escolha uma combinação confortável e com bom contraste.</span></div>
          <div class="appearance-mode"><span>Modo do sistema</span><div><button type="button" data-profile-theme="light" class="${selectedTheme === 'light' ? 'selected' : ''}">☀️ Claro</button><button type="button" data-profile-theme="dark" class="${selectedTheme === 'dark' ? 'selected' : ''}">🌙 Escuro</button></div></div>
          <div class="appearance-palettes"><span>Combinação principal</span><div>${paletteOptions(selectedPalette)}</div></div>
        </section>
        <div class="modal-actions"><button class="btn-ghost profile-cancel" type="button">Cancelar</button><button class="btn-primary" type="submit">Salvar perfil</button></div>
      </form>
    </div>`;
    document.querySelector('#profileModalRoot')!.appendChild(overlay);

    const previewImage = overlay.querySelector<HTMLImageElement>('.profile-photo-preview img')!;
    const previewFallback = overlay.querySelector<HTMLElement>('.profile-photo-preview span')!;
    const fileInput = overlay.querySelector<HTMLInputElement>('#profilePhotoInput')!;
    const editButton = overlay.querySelector<HTMLButtonElement>('[data-photo-action="edit"]')!;
    const removeButton = overlay.querySelector<HTMLButtonElement>('[data-photo-action="remove"]')!;
    const setPreview = (url: string | null) => {
      previewImage.classList.toggle('hidden', !url);
      previewFallback.classList.toggle('hidden', Boolean(url));
      editButton.classList.toggle('hidden', !url);
      removeButton.classList.toggle('hidden', !url);
      if (url) previewImage.src = url;
    };
    const useCroppedPhoto = (blob: Blob) => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      pendingPhoto = blob;
      pendingPreviewUrl = URL.createObjectURL(blob);
      removeAvatar = false;
      setPreview(pendingPreviewUrl);
    };

    const uploadButton = overlay.querySelector<HTMLButtonElement>('[data-photo-action="upload"]')!;
    uploadButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      if (!['image/png', 'image/jpeg'].includes(file.type)) { toast('Escolha uma imagem PNG ou JPEG.'); return; }
      if (file.size > MAX_PHOTO_SIZE) { toast('A foto deve ter no máximo 30 MB.'); return; }
      uploadButton.disabled = true;
      uploadButton.textContent = 'Otimizando...';
      let url: string | null = null;
      try {
        const optimized = await imageCompression(file, {
          maxSizeMB: 6,
          maxWidthOrHeight: 2560,
          useWebWorker: true,
          initialQuality: .9,
          fileType: file.type,
          preserveExif: false,
        });
        url = URL.createObjectURL(optimized);
        const cropped = await openCropEditor(url);
        if (cropped) useCroppedPhoto(cropped);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Não foi possível comprimir e editar a foto.');
      } finally {
        if (url) URL.revokeObjectURL(url);
        uploadButton.disabled = false;
        uploadButton.textContent = avatarUrl || pendingPhoto ? 'Trocar foto' : 'Enviar foto';
      }
    });
    editButton.addEventListener('click', async () => {
      const source = pendingPreviewUrl ?? avatarUrl;
      if (!source) return;
      try {
        const cropped = await openCropEditor(source);
        if (cropped) useCroppedPhoto(cropped);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Não foi possível editar a foto.');
      }
    });
    removeButton.addEventListener('click', () => {
      pendingPhoto = null;
      removeAvatar = true;
      if (pendingPreviewUrl) { URL.revokeObjectURL(pendingPreviewUrl); pendingPreviewUrl = null; }
      setPreview(null);
    });

    overlay.querySelectorAll<HTMLButtonElement>('[data-profile-theme]').forEach((button) => button.addEventListener('click', () => {
      selectedTheme = button.dataset.profileTheme as Theme;
      overlay.querySelectorAll('[data-profile-theme]').forEach((item) => item.classList.toggle('selected', item === button));
      applyAppearance(selectedTheme, selectedPalette);
    }));
    overlay.querySelectorAll<HTMLButtonElement>('[data-profile-palette]').forEach((button) => button.addEventListener('click', () => {
      selectedPalette = button.dataset.profilePalette as ColorPalette;
      overlay.querySelectorAll<HTMLButtonElement>('[data-profile-palette]').forEach((item) => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); });
      applyAppearance(selectedTheme, selectedPalette);
    }));

    const close = () => {
      if (!saved) applyAppearance(initialTheme, initialPalette);
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      overlay.remove();
    };
    overlay.querySelector('.modal-close')!.addEventListener('click', close);
    overlay.querySelector('.profile-cancel')!.addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });

    overlay.querySelector<HTMLFormElement>('form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = overlay.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      submit.disabled = true;
      submit.textContent = 'Salvando...';
      let uploadedPath: string | null = null;
      try {
        let nextAvatarPath = removeAvatar ? null : context.avatarPath;
        if (pendingPhoto) {
          uploadedPath = `${context.userId}/avatar-${Date.now()}.jpg`;
          const finalPhoto = await imageCompression(new File([pendingPhoto], 'avatar.jpg', { type: 'image/jpeg' }), {
            maxSizeMB: 1,
            maxWidthOrHeight: 512,
            useWebWorker: true,
            initialQuality: .88,
            fileType: 'image/jpeg',
            preserveExif: false,
          });
          const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(uploadedPath, finalPhoto, { contentType: 'image/jpeg', upsert: false });
          if (uploadError) throw uploadError;
          nextAvatarPath = uploadedPath;
        }
        const birthDate = overlay.querySelector<HTMLInputElement>('#profileBirthDate')!.value || null;
        const { error } = await supabase.rpc('update_my_profile_settings', {
          p_birth_date: birthDate,
          p_avatar_path: nextAvatarPath,
          p_theme_mode: selectedTheme,
          p_color_palette: selectedPalette,
        });
        if (error) throw error;
        if (context.avatarPath && context.avatarPath !== nextAvatarPath) await supabase.storage.from(AVATAR_BUCKET).remove([context.avatarPath]);
        context.birthDate = birthDate;
        context.avatarPath = nextAvatarPath;
        context.themeMode = selectedTheme;
        context.colorPalette = selectedPalette;
        avatarUrl = await signedAvatarUrl(nextAvatarPath);
        updateHeaderAvatar(context.name, avatarUrl);
        applyAppearance(selectedTheme, selectedPalette);
        saved = true;
        toast('Perfil atualizado com sucesso.');
        close();
      } catch (error) {
        if (uploadedPath) await supabase.storage.from(AVATAR_BUCKET).remove([uploadedPath]);
        submit.disabled = false;
        submit.textContent = 'Salvar perfil';
        toast(error instanceof Error ? error.message : 'Não foi possível salvar o perfil.');
      }
    });
  });
}
