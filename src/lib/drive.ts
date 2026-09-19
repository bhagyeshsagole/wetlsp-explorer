/**
 * Google Drive import: Google Identity Services for the token, the Drive Picker
 * for selection, and the Drive REST API for the download.
 *
 * The default selected-files mode uses `drive.file`. Optional folder mode uses
 * `drive.readonly`, because selecting a folder with `drive.file` does not grant
 * access to each child that must be listed and downloaded recursively.
 */
import type { IngestEntry } from './ingest';
import type { ProgressEvent } from './types';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID as string | undefined;
const DRIVE_MODE = import.meta.env.VITE_GOOGLE_DRIVE_MODE === 'folder' ? 'folder' : 'files';
const SCOPE = DRIVE_MODE === 'folder'
  ? 'https://www.googleapis.com/auth/drive.readonly'
  : 'https://www.googleapis.com/auth/drive.file';
const CONSENT_KEY = `wetlsp.drive.consent-granted:${DRIVE_MODE}`;

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function rememberedConsent(): boolean {
  try { return sessionStorage.getItem(CONSENT_KEY) === 'true'; }
  catch { return false; }
}

function rememberConsent(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(CONSENT_KEY, 'true');
    else sessionStorage.removeItem(CONSENT_KEY);
  } catch { /* Token flow still works when session storage is unavailable. */ }
}

export function isDriveConfigured(): boolean {
  return Boolean(CLIENT_ID && API_KEY);
}

export function driveSelectionMode(): 'files' | 'folder' {
  return DRIVE_MODE;
}

export function drivePermissionDescription(): string {
  return DRIVE_MODE === 'folder'
    ? 'Folder import can recursively read the selected site folder. Google classifies this read-only Drive permission as restricted.'
    : 'Selected-files mode can read only the files you explicitly share through Google Picker.';
}

export function driveConfigHint(): string {
  const missing = [
    !CLIENT_ID && 'VITE_GOOGLE_CLIENT_ID',
    !API_KEY && 'VITE_GOOGLE_API_KEY',
  ].filter(Boolean);
  return `Google Drive import needs ${missing.join(' and ')} in your .env file.`;
}

/* --------------------------------------------------------------- loading */

const scripts = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const existing = scripts.get(src);
  if (existing) return existing;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scripts.delete(src);
      reject(new Error(`Could not load ${src} — are you online?`));
    };
    document.head.appendChild(el);
  });
  scripts.set(src, p);
  return p;
}

interface GapiLike {
  load(name: string, cb: () => void): void;
}
interface PickerNamespace {
  PickerBuilder: new () => PickerBuilderLike;
  DocsView: new (viewId?: unknown) => DocsViewLike;
  ViewId: { FOLDERS: unknown; DOCS: unknown };
  Action: { PICKED: string; CANCEL: string };
  Feature: { MULTISELECT_ENABLED: unknown; SUPPORT_DRIVES: unknown };
}
interface DocsViewLike {
  setIncludeFolders(v: boolean): DocsViewLike;
  setSelectFolderEnabled(v: boolean): DocsViewLike;
  setMimeTypes(v: string): DocsViewLike;
  setParent(v: string): DocsViewLike;
}
interface PickerBuilderLike {
  addView(v: unknown): PickerBuilderLike;
  setOAuthToken(t: string): PickerBuilderLike;
  setDeveloperKey(k: string): PickerBuilderLike;
  setAppId(id: string): PickerBuilderLike;
  setOrigin(origin: string): PickerBuilderLike;
  enableFeature(f: unknown): PickerBuilderLike;
  setTitle(t: string): PickerBuilderLike;
  setCallback(cb: (data: PickerResponse) => void): PickerBuilderLike;
  build(): { setVisible(v: boolean): void };
}
interface PickerResponse {
  action: string;
  docs?: Array<{ id: string; name: string; mimeType: string; sizeBytes?: string }>;
}

declare global {
  interface Window {
    gapi?: GapiLike;
    google?: {
      picker?: PickerNamespace;
      accounts?: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) => void;
          }): { requestAccessToken(opts?: { prompt?: string }): void };
        };
      };
    };
  }
}

async function ensurePicker(): Promise<PickerNamespace> {
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise<void>((resolve) => window.gapi!.load('picker', () => resolve()));
  const picker = window.google?.picker;
  if (!picker) throw new Error('The Google Picker failed to load.');
  return picker;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (!isDriveConfigured()) throw new Error(driveConfigHint());
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  await loadScript('https://accounts.google.com/gsi/client');
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google sign-in failed to load.');

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID!,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description ?? resp.error ?? 'Google sign-in was cancelled.'));
          return;
        }
        rememberConsent(true);
        const lifetime = Math.max(60, resp.expires_in ?? 3600);
        cachedToken = { value: resp.access_token, expiresAt: Date.now() + (lifetime - 60) * 1000 };
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken({
      prompt: rememberedConsent() ? '' : 'consent',
    });
  });
}

export function signOutDrive(): void {
  cachedToken = null;
  rememberConsent(false);
}

/* ---------------------------------------------------------------- picker */

export interface PickedItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export async function pickFromDrive(): Promise<PickedItem[]> {
  const token = await getAccessToken();
  const picker = await ensurePicker();

  return new Promise<PickedItem[]>((resolve, reject) => {
    try {
      const files = new picker.DocsView(picker.ViewId.DOCS)
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false);

      const builder = new picker.PickerBuilder()
        .addView(files)
        .setOAuthToken(token)
        .setDeveloperKey(API_KEY!)
        .setOrigin(window.location.origin)
        .enableFeature(picker.Feature.MULTISELECT_ENABLED)
        .enableFeature(picker.Feature.SUPPORT_DRIVES)
        .setTitle(DRIVE_MODE === 'folder' ? 'Choose a WetLSP site folder or files' : 'Choose WetLSP site files')
        .setCallback((data) => {
          if (data.action === picker.Action.PICKED) {
            resolve(
              (data.docs ?? []).map((d) => ({
                id: d.id,
                name: d.name,
                mimeType: d.mimeType,
                size: Number(d.sizeBytes ?? 0),
              })),
            );
          } else if (data.action === picker.Action.CANCEL) {
            resolve([]);
          }
        });
      if (DRIVE_MODE === 'folder') {
        const folders = new picker.DocsView(picker.ViewId.FOLDERS)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true);
        builder.addView(folders);
      }
      if (APP_ID) builder.setAppId(APP_ID);
      builder.build().setVisible(true);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/* -------------------------------------------------------------- download */

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

async function driveGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 403 || res.status === 404) {
      throw new Error(
        DRIVE_MODE === 'folder'
          ? 'Drive could not read that item. Check that the signed-in account can open it and that the OAuth client includes the drive.readonly scope.'
          : 'Drive did not share that file with the app. Pick the individual WetLSP files in Google Picker; selected-files mode cannot expand folders.',
      );
    }
    throw new Error(`Drive request failed (${res.status}). ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function listFolder(folderId: string, token: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size)',
      pageSize: '200',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await driveGet<{ files: DriveFile[]; nextPageToken?: string }>(
      `files?${params}`,
      token,
    );
    out.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

/** Expand picked items into a flat file list, walking any picked folders. */
async function expand(
  items: PickedItem[],
  token: string,
  onProgress?: (p: ProgressEvent) => void,
): Promise<Array<{ path: string; file: DriveFile }>> {
  const out: Array<{ path: string; file: DriveFile }> = [];
  const walk = async (folderId: string, prefix: string) => {
    onProgress?.({ phase: 'Listing Drive folder', fraction: null, detail: prefix || '/' });
    const children = await listFolder(folderId, token);
    for (const child of children) {
      if (child.mimeType === FOLDER_MIME) await walk(child.id, `${prefix}${child.name}/`);
      else out.push({ path: `${prefix}${child.name}`, file: child });
    }
  };

  for (const item of items) {
    if (item.mimeType === FOLDER_MIME) await walk(item.id, `${item.name}/`);
    else out.push({ path: item.name, file: { id: item.id, name: item.name, mimeType: item.mimeType } });
  }
  return out;
}

async function downloadFile(
  file: DriveFile,
  token: string,
  onBytes: (n: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!res.ok) throw new Error(`Could not download "${file.name}" (${res.status}).`);
  if (!res.body) return res.blob();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      onBytes(value.byteLength);
    }
  }
  return new Blob(chunks as BlobPart[]);
}

/** Pick, expand and download — the result plugs straight into `ingestEntries`. */
export async function importFromDrive(opts: {
  onProgress?: (p: ProgressEvent) => void;
  signal?: AbortSignal;
}): Promise<{ entries: IngestEntry[]; folderHint?: string }> {
  const picked = await pickFromDrive();
  if (picked.length === 0) return { entries: [] };

  const token = await getAccessToken();
  const listed = await expand(picked, token, opts.onProgress);
  if (listed.length === 0) throw new Error('That Drive selection contains no files.');

  const total = listed.reduce((s, l) => s + Number(l.file.size ?? 0), 0);
  let done = 0;
  const entries: IngestEntry[] = [];
  for (const item of listed) {
    if (opts.signal?.aborted) throw new Error('Drive import cancelled.');
    opts.onProgress?.({
      phase: 'Downloading from Drive',
      fraction: total > 0 ? done / total : null,
      detail: item.path,
    });
    const blob = await downloadFile(
      item.file,
      token,
      (n) => {
        done += n;
        opts.onProgress?.({
          phase: 'Downloading from Drive',
          fraction: total > 0 ? Math.min(1, done / total) : null,
          detail: item.path,
        });
      },
      opts.signal,
    );
    entries.push({ path: item.path, file: new File([blob], item.file.name) });
  }

  const folderHint = picked.find((p) => p.mimeType === FOLDER_MIME)?.name;
  return { entries, folderHint };
}
