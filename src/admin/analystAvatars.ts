import { supabase } from '../supabaseClient';
import type { Analyst } from '../types';
import { escapeHtml, initials } from '../utils';

const AVATAR_BUCKET = 'profile-photos';
let avatarUrls = new Map<string, string>();
let loading: Promise<Map<string, string>> | null = null;

export function invalidateAnalystAvatars() {
  avatarUrls = new Map();
  loading = null;
}

export async function loadAnalystAvatars(force = false): Promise<Map<string, string>> {
  if (force) invalidateAnalystAvatars();
  if (avatarUrls.size) return avatarUrls;
  if (loading) return loading;

  loading = (async () => {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('analyst_id,avatar_path')
      .not('analyst_id', 'is', null)
      .not('avatar_path', 'is', null);
    if (error) throw error;

    const rows = (profiles ?? []).filter((profile): profile is { analyst_id: string; avatar_path: string } => Boolean(profile.analyst_id && profile.avatar_path));
    if (!rows.length) return avatarUrls;

    const { data: signed, error: signError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrls(rows.map((profile) => profile.avatar_path), 60 * 60);
    if (signError) throw signError;

    const byPath = new Map((signed ?? []).filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl]));
    avatarUrls = new Map(rows.flatMap((profile) => {
      const url = byPath.get(profile.avatar_path);
      return url ? [[profile.analyst_id, url]] : [];
    }));
    return avatarUrls;
  })().finally(() => { loading = null; });

  return loading;
}

export function analystAvatar(analyst: Pick<Analyst, 'id' | 'name' | 'color'>, size = ''): string {
  const url = avatarUrls.get(analyst.id);
  const classes = `avatar${size ? ` ${size}` : ''}`;
  return url
    ? `<span class="${classes}" title="${escapeHtml(analyst.name)}"><img src="${escapeHtml(url)}" alt="Foto de ${escapeHtml(analyst.name)}" /></span>`
    : `<span class="${classes}" style="background:${analyst.color}">${initials(analyst.name)}</span>`;
}
