import { apiVersion, Notice, Plugin, requestUrl } from 'obsidian';
import { ThemeAutoupdaterSettingTab } from './settings';
import { checkAndUpdate, Data, Env, Event, Installed, installedThemes, Io, normaliseData, rollback, unskip } from './updater';

export default class ThemeAutoupdater extends Plugin {
	data: Data = { themes: {} };
	installed: Installed[] = [];
	scanned = false;
	settingTab!: ThemeAutoupdaterSettingTab;
	private queue: Promise<unknown> = Promise.resolve();

	async onload(): Promise<void> {
		this.data = normaliseData(await this.loadData());
		this.settingTab = new ThemeAutoupdaterSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);
		this.app.workspace.onLayoutReady(() => void this.checkForUpdates());
	}

	/** False when this Obsidian doesn't expose its theme registry: the plugin then only reports updates. */
	get canInstall(): boolean {
		return this.themeRegistry() !== null;
	}

	checkForUpdates(): Promise<void> {
		return this.serial(async () => {
			const { installed, events } = await checkAndUpdate(this.env(), this.data);
			this.installed = installed;
			this.scanned = true;
			await this.saveData(this.data);
			this.settingTab.update();
			for (const event of events) this.announce(event);
		});
	}

	rollback(name: string): Promise<void> {
		return this.serial(async () => {
			try {
				this.announce(await rollback(this.env(), this.data, name));
				this.installed = await installedThemes(this.env());
			} catch (err) {
				console.error('Theme Autoupdater: rollback failed', err);
				new Notice(`${name} could not be rolled back: ${err instanceof Error ? err.message : String(err)}`);
			}
			await this.saveData(this.data);
			this.settingTab.update();
		});
	}

	/** Installs the version a rollback skipped, through the usual checked update. */
	installSkipped(name: string): Promise<void> {
		return this.serial(async () => unskip(this.data, name)).then(() => this.checkForUpdates());
	}

	// Runs are serialised so a rollback never overlaps the startup check.
	private serial(task: () => Promise<void>): Promise<void> {
		const run = this.queue.then(task, task);
		this.queue = run.catch((err: unknown) => console.error('Theme Autoupdater', err));
		return run;
	}

	private announce(event: Event): void {
		switch (event.type) {
			case 'updated': {
				const notice = new Notice(
					createFragment((f) => {
						f.appendText(`${event.name} updated to ${event.to} · `);
						f.createEl('a', { text: 'Roll back', cls: 'theme-autoupdater-action' }).onClickEvent(() => {
							notice.hide();
							void this.rollback(event.name);
						});
					}),
					10000,
				);
				return;
			}
			case 'rolled-back':
				new Notice(`${event.name} rolled back to ${event.to}. ${event.skipped} will be skipped; you can install it again from Theme Autoupdater's settings.`, 8000);
				return;
			case 'edited':
				new Notice(`${event.name} ${event.to} was not installed: its theme.css does not match the published file, so it may have been edited locally. Update it from Settings → Appearance when you are ready.`, 15000);
				return;
			case 'available':
				new Notice(`${event.name} ${event.to} is available. Install it from Settings → Appearance → Check for updates.`, 15000);
				return;
			case 'failed':
				new Notice(
					event.restored
						? `${event.name} ${event.to} failed to install. The previous version was restored.`
						: `${event.name} ${event.to} failed to install and the previous version could not be restored. Reinstall it from Settings → Appearance.`,
					15000,
				);
				return;
		}
	}

	private env(): Env {
		const configDir = this.app.vault.configDir;
		const registry = this.themeRegistry();
		return {
			io: this.io(),
			themesDir: `${configDir}/themes`,
			backupsDir: `${configDir}/plugins/${this.manifest.id}/backups`,
			appVersion: apiVersion,
			reloadThemes: registry ? async () => void (await registry.readThemes(true)) : null,
			now: () => Date.now(),
		};
	}

	// Obsidian's theme registry (what Settings → Appearance lists) is not part
	// of the public API. The plugin only writes to the themes folder when it
	// finds the registry in the shape it expects, so an installed update takes
	// effect without a restart; otherwise it stays notify-only.
	private themeRegistry(): { readThemes: (reload: boolean) => unknown } | null {
		const customCss = (this.app as unknown as { customCss?: unknown }).customCss;
		if (!customCss || typeof customCss !== 'object') return null;
		const { themes, readThemes } = customCss as { themes?: unknown; readThemes?: unknown };
		if (!themes || typeof themes !== 'object' || typeof readThemes !== 'function') return null;
		return { readThemes: (reload) => (readThemes as (reload: boolean) => unknown).call(customCss, reload) };
	}

	private io(): Io {
		const adapter = this.app.vault.adapter;
		return {
			exists: (path) => adapter.exists(path),
			read: (path) => adapter.read(path),
			write: (path, data) => adapter.write(path, data),
			mkdir: (path) => adapter.mkdir(path),
			listFolders: async (path) => (await adapter.list(path)).folders,
			rmdir: (path) => adapter.rmdir(path, true),
			fetch: async (url) => {
				try {
					const res = await requestUrl({ url, throw: false });
					return { status: res.status, text: res.text };
				} catch {
					return { status: 0, text: '' };
				}
			},
		};
	}
}
