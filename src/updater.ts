// The update engine. It knows nothing about Obsidian: everything it reads,
// writes or fetches goes through `Io`, so the decision logic can be tested
// against an in-memory vault.
import { DIRECTORY_URL, rawUrl, releaseUrl } from './github';
import { hash } from './hash';
import { isNewer, resolveVersion, ThemeManifest } from './versions';

export interface Io {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	mkdir(path: string): Promise<void>;
	/** Full paths of the folders directly inside `path`. */
	listFolders(path: string): Promise<string[]>;
	/** Removes a folder and everything in it. */
	rmdir(path: string): Promise<void>;
	/** Never throws: a failed request has a status of 0. */
	fetch(url: string): Promise<{ status: number; text: string }>;
}

export interface Env {
	io: Io;
	/** `<configDir>/themes` */
	themesDir: string;
	/** Where backups go: one folder per theme, holding the previous version. */
	backupsDir: string;
	appVersion: string;
	/**
	 * Tells Obsidian to re-read the themes folder after a write. Null when the
	 * running Obsidian doesn't expose it: the plugin then never writes, and only
	 * reports that updates exist.
	 */
	reloadThemes: (() => Promise<void>) | null;
	now(): number;
}

export interface Backup {
	version: string;
	hash: string;
	at: number;
}

export interface ThemeState {
	/** The installed version this record describes. */
	version: string;
	/** Fingerprint of theme.css as published for `version`, once verified. */
	hash?: string;
	/** Version whose theme.css could not be matched to the published file. */
	unverified?: string;
	/** When the plugin last wrote this theme (an update or a rollback). */
	updatedAt?: number;
	backup?: Backup;
	/** A version not to install again, set by a rollback. */
	skip?: string;
	/** A version already announced, so a notice shows once. */
	notified?: string;
	/** The version the last check would install, for the settings tab. */
	latest?: string;
}

export interface Data {
	themes: Record<string, ThemeState>;
}

export interface Installed {
	name: string;
	version: string;
	dir: string;
}

export type Event =
	| { type: 'updated'; name: string; from: string; to: string }
	| { type: 'available'; name: string; to: string }
	| { type: 'edited'; name: string; to: string }
	| { type: 'failed'; name: string; to: string; restored: boolean; error: string }
	| { type: 'rolled-back'; name: string; to: string; skipped: string };

interface DirectoryEntry {
	name?: unknown;
	repo?: unknown;
}

interface Files {
	manifest: string;
	css: string;
}

export function normaliseData(raw: unknown): Data {
	const themes = (raw as Partial<Data> | null)?.themes;
	return { themes: themes && typeof themes === 'object' ? themes : {} };
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

async function fetchJson(io: Io, url: string): Promise<unknown> {
	const res = await io.fetch(url);
	return res.status === 200 ? parseJson(res.text) : null;
}

async function mkdirp(io: Io, path: string): Promise<void> {
	if (await io.exists(path)) return;
	const parent = path.slice(0, path.lastIndexOf('/'));
	if (parent) await mkdirp(io, parent);
	await io.mkdir(path);
}

// Every directory theme in the themes folder, read the way Obsidian reads
// them: a folder with a theme.css and a manifest.json whose name is the folder.
export async function installedThemes(env: Env): Promise<Installed[]> {
	const { io, themesDir } = env;
	if (!(await io.exists(themesDir))) return [];
	const found: Installed[] = [];
	for (const dir of (await io.listFolders(themesDir)).sort()) {
		const name = dir.slice(dir.lastIndexOf('/') + 1);
		if (!(await io.exists(`${dir}/theme.css`)) || !(await io.exists(`${dir}/manifest.json`))) continue;
		const manifest = parseJson(await io.read(`${dir}/manifest.json`)) as ThemeManifest | null;
		if (manifest?.name !== name || typeof manifest.version !== 'string') continue;
		found.push({ name, version: manifest.version, dir });
	}
	return found;
}

export async function checkAndUpdate(env: Env, data: Data): Promise<{ installed: Installed[]; events: Event[] }> {
	const installed = await installedThemes(env);
	await forgetUninstalled(env, data, installed);
	const events: Event[] = [];
	if (!installed.length) return { installed, events };
	const directory = await fetchJson(env.io, DIRECTORY_URL);
	if (!Array.isArray(directory)) return { installed, events };
	for (const theme of installed) {
		const entry = (directory as DirectoryEntry[]).find((e) => e.name === theme.name && typeof e.repo === 'string');
		if (!entry) continue;
		try {
			const event = await checkTheme(env, data, theme, entry.repo as string);
			if (event) events.push(event);
		} catch (err) {
			console.error(`Theme Autoupdater: ${theme.name}`, err);
		}
	}
	// Re-read the folder when something was written, so the list reports what is installed now.
	return { installed: events.some((e) => e.type === 'updated' || e.type === 'failed') ? await installedThemes(env) : installed, events };
}

// Drops records and backups of themes that are no longer installed.
async function forgetUninstalled(env: Env, data: Data, installed: Installed[]): Promise<void> {
	for (const name of Object.keys(data.themes)) {
		if (installed.some((t) => t.name === name)) continue;
		delete data.themes[name];
		const dir = `${env.backupsDir}/${name}`;
		if (await env.io.exists(dir)) await env.io.rmdir(dir);
	}
}

async function checkTheme(env: Env, data: Data, theme: Installed, repo: string): Promise<Event | null> {
	const { io } = env;
	const manifest = (await fetchJson(io, rawUrl(repo, 'manifest.json'))) as ThemeManifest | null;
	if (!manifest || manifest.name !== theme.name) return null;
	const latest = await resolveVersion(manifest, env.appVersion, () => fetchJson(io, rawUrl(repo, 'versions.json')));

	const state = (data.themes[theme.name] ??= { version: theme.version });
	if (state.version !== theme.version) {
		// Installed by something else since the record was written.
		state.version = theme.version;
		delete state.hash;
		delete state.unverified;
	}
	if (latest) state.latest = latest;
	else delete state.latest;
	const update = latest && isNewer(theme.version, latest) && latest !== state.skip ? latest : null;

	if (!env.reloadThemes) {
		if (!update || state.notified === update) return null;
		state.notified = update;
		return { type: 'available', name: theme.name, to: update };
	}

	const css = await io.read(`${theme.dir}/theme.css`);
	const current = hash(css);
	if (state.hash === undefined && state.unverified !== theme.version) {
		const published = await publishedCss(env, repo, theme.version, manifest);
		if (published.some((text) => hash(text) === current)) state.hash = current;
		else state.unverified = theme.version;
	}
	if (!update) return null;
	if (state.hash !== current) {
		if (state.notified === update) return null;
		state.notified = update;
		return { type: 'edited', name: theme.name, to: update };
	}
	return install(env, state, theme, repo, update, css);
}

// theme.css as published for `version`: the release asset, and the default
// branch's copy when the default branch is still at that version.
async function publishedCss(env: Env, repo: string, version: string, head: ThemeManifest): Promise<string[]> {
	const candidates: string[] = [];
	const asset = await env.io.fetch(releaseUrl(repo, version, 'theme.css'));
	if (asset.status === 200) candidates.push(asset.text);
	if (head.version === version) {
		const raw = await env.io.fetch(rawUrl(repo, 'theme.css'));
		if (raw.status === 200) candidates.push(raw.text);
	}
	return candidates;
}

// The release assets for `version`, or the default branch's files when the
// release has none: the same order Obsidian's own installer uses.
async function download(io: Io, repo: string, version: string): Promise<Files | null> {
	const fetchPair = async (url: (file: string) => string): Promise<Files | null> => {
		const manifest = await io.fetch(url('manifest.json'));
		if (manifest.status !== 200) return null;
		const css = await io.fetch(url('theme.css'));
		return css.status === 200 ? { manifest: manifest.text, css: css.text } : null;
	};
	return (await fetchPair((file) => releaseUrl(repo, version, file))) ?? fetchPair((file) => rawUrl(repo, file));
}

async function install(env: Env, state: ThemeState, theme: Installed, repo: string, version: string, currentCss: string): Promise<Event | null> {
	const { io } = env;
	const files = await download(io, repo, version);
	if (!files) return null;
	const manifest = parseJson(files.manifest) as ThemeManifest | null;
	if (manifest?.name !== theme.name || manifest.version !== version) return null;

	// Back up first, and prove the backup is readable before touching the theme.
	const currentManifest = await io.read(`${theme.dir}/manifest.json`);
	const backupDir = `${env.backupsDir}/${theme.name}`;
	await mkdirp(io, backupDir);
	await io.write(`${backupDir}/theme.css`, currentCss);
	await io.write(`${backupDir}/manifest.json`, currentManifest);
	if ((await io.read(`${backupDir}/theme.css`)) !== currentCss) return null;
	const backup: Backup = { version: theme.version, hash: hash(currentCss), at: env.now() };

	try {
		await io.write(`${theme.dir}/theme.css`, files.css);
		await io.write(`${theme.dir}/manifest.json`, files.manifest);
		if ((await io.read(`${theme.dir}/theme.css`)) !== files.css) throw new Error('theme.css did not read back as written');
	} catch (err) {
		let restored = false;
		try {
			await io.write(`${theme.dir}/theme.css`, currentCss);
			await io.write(`${theme.dir}/manifest.json`, currentManifest);
			restored = (await io.read(`${theme.dir}/theme.css`)) === currentCss;
		} catch (restoreErr) {
			console.error(`Theme Autoupdater: could not restore ${theme.name}`, restoreErr);
		}
		await env.reloadThemes?.();
		return { type: 'failed', name: theme.name, to: version, restored, error: err instanceof Error ? err.message : String(err) };
	}

	state.version = version;
	state.hash = hash(files.css);
	state.updatedAt = env.now();
	state.backup = backup;
	delete state.unverified;
	await env.reloadThemes?.();
	return { type: 'updated', name: theme.name, from: backup.version, to: version };
}

// Puts the backed-up version back and marks the version it replaces as one
// not to install again. Throws when there is nothing to roll back to or the
// backup doesn't match its record.
export async function rollback(env: Env, data: Data, name: string): Promise<Event> {
	const state = data.themes[name];
	const backup = state?.backup;
	if (!state || !backup) throw new Error(`no backup of ${name}`);
	if (!env.reloadThemes) throw new Error('this version of Obsidian does not let the plugin write themes');
	const { io } = env;
	const backupDir = `${env.backupsDir}/${name}`;
	const css = await io.read(`${backupDir}/theme.css`);
	const manifest = await io.read(`${backupDir}/manifest.json`);
	if (hash(css) !== backup.hash) throw new Error(`the backup of ${name} does not match its record`);

	const dir = `${env.themesDir}/${name}`;
	const onDisk = parseJson(await io.read(`${dir}/manifest.json`)) as ThemeManifest | null;
	const skipped = typeof onDisk?.version === 'string' ? onDisk.version : state.version;
	await io.write(`${dir}/theme.css`, css);
	await io.write(`${dir}/manifest.json`, manifest);
	if ((await io.read(`${dir}/theme.css`)) !== css) throw new Error('theme.css did not read back as written');

	state.version = backup.version;
	state.hash = backup.hash;
	state.skip = skipped;
	state.updatedAt = env.now();
	delete state.backup;
	delete state.unverified;
	await io.rmdir(backupDir);
	await env.reloadThemes();
	return { type: 'rolled-back', name, to: backup.version, skipped };
}

// Lifts a rollback's skip, so the next check installs that version again.
export function unskip(data: Data, name: string): void {
	const state = data.themes[name];
	if (!state) return;
	delete state.skip;
	delete state.notified;
}
