// An in-memory vault and GitHub for the engine tests.
import { Env, Io } from '../src/updater';

export class FakeIo implements Io {
	files = new Map<string, string>();
	folders = new Set<string>();
	routes = new Map<string, string>();
	requests: string[] = [];
	writes: string[] = [];
	failWrite: ((path: string) => boolean) | null = null;

	exists(path: string): Promise<boolean> {
		return Promise.resolve(this.files.has(path) || this.folders.has(path));
	}

	read(path: string): Promise<string> {
		const data = this.files.get(path);
		return data === undefined ? Promise.reject(new Error(`ENOENT ${path}`)) : Promise.resolve(data);
	}

	write(path: string, data: string): Promise<void> {
		this.writes.push(path);
		if (this.failWrite?.(path)) return Promise.reject(new Error(`EIO ${path}`));
		this.files.set(path, data);
		return Promise.resolve();
	}

	mkdir(path: string): Promise<void> {
		this.folders.add(path);
		return Promise.resolve();
	}

	listFolders(path: string): Promise<string[]> {
		const prefix = `${path}/`;
		const direct = [...this.folders].filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes('/'));
		return Promise.resolve(direct);
	}

	rmdir(path: string): Promise<void> {
		for (const f of [...this.files.keys()]) if (f.startsWith(`${path}/`)) this.files.delete(f);
		for (const f of [...this.folders]) if (f === path || f.startsWith(`${path}/`)) this.folders.delete(f);
		return Promise.resolve();
	}

	fetch(url: string): Promise<{ status: number; text: string }> {
		this.requests.push(url);
		const text = this.routes.get(url);
		return Promise.resolve(text === undefined ? { status: 404, text: '' } : { status: 200, text });
	}

	// A theme folder as Obsidian lays it out.
	installTheme(name: string, version: string, css: string): void {
		this.folders.add('config/themes');
		this.folders.add(`config/themes/${name}`);
		this.files.set(`config/themes/${name}/theme.css`, css);
		this.files.set(`config/themes/${name}/manifest.json`, manifest(name, version));
	}

	// A theme on GitHub: listed in the directory, with its default branch at
	// `version` and, unless `assets` is false, a release carrying the files.
	publish(name: string, repo: string, version: string, css: string, opts: { assets?: boolean; minAppVersion?: string; versions?: Record<string, string> } = {}): void {
		const entries = JSON.parse(this.routes.get(DIRECTORY) ?? '[]') as { name: string; repo: string }[];
		if (!entries.some((e) => e.name === name)) entries.push({ name, repo });
		this.routes.set(DIRECTORY, JSON.stringify(entries));
		this.routes.set(`https://raw.githubusercontent.com/${repo}/HEAD/manifest.json`, manifest(name, version, opts.minAppVersion));
		this.routes.set(`https://raw.githubusercontent.com/${repo}/HEAD/theme.css`, css);
		if (opts.versions) this.routes.set(`https://raw.githubusercontent.com/${repo}/HEAD/versions.json`, JSON.stringify(opts.versions));
		if (opts.assets !== false) this.release(name, repo, version, css, opts.minAppVersion);
	}

	release(name: string, repo: string, version: string, css: string, minAppVersion?: string): void {
		this.routes.set(`https://github.com/${repo}/releases/download/${version}/manifest.json`, manifest(name, version, minAppVersion));
		this.routes.set(`https://github.com/${repo}/releases/download/${version}/theme.css`, css);
	}

	theme(name: string): { css: string | undefined; version: string | undefined } {
		const raw = this.files.get(`config/themes/${name}/manifest.json`);
		return { css: this.files.get(`config/themes/${name}/theme.css`), version: raw ? (JSON.parse(raw) as { version: string }).version : undefined };
	}
}

export const DIRECTORY = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-css-themes.json';

export function manifest(name: string, version: string, minAppVersion = '1.0.0'): string {
	return JSON.stringify({ name, version, minAppVersion, author: 'Someone' });
}

export function env(io: FakeIo, opts: { canInstall?: boolean; appVersion?: string } = {}): Env & { reloads: number } {
	const e = {
		io,
		themesDir: 'config/themes',
		backupsDir: 'config/plugins/theme-autoupdater/backups',
		appVersion: opts.appVersion ?? '1.14.4',
		reloads: 0,
		reloadThemes: null as (() => Promise<void>) | null,
		now: () => 1_700_000_000_000,
	};
	if (opts.canInstall !== false) e.reloadThemes = () => Promise.resolve(void e.reloads++);
	return e;
}
