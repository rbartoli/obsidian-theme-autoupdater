import { App, PluginSettingTab, SettingDefinitionItem } from 'obsidian';
import type ThemeAutoupdater from './main';
import { Installed, ThemeState } from './updater';

export class ThemeAutoupdaterSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ThemeAutoupdater,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const items: SettingDefinitionItem[] = [];
		if (!this.plugin.canInstall) {
			items.push({
				name: 'Automatic updates are off',
				desc: 'This version of Obsidian does not expose its theme list to plugins, so Theme Autoupdater only tells you when a theme has an update.',
				searchable: false,
			});
		}
		if (this.plugin.scanned && !this.plugin.installed.length) {
			items.push({ name: 'No community themes installed', searchable: false });
		}
		for (const theme of this.plugin.installed) {
			const state = this.plugin.data.themes[theme.name];
			items.push({
				name: theme.name,
				desc: describe(theme, state),
				searchable: false,
				render: (setting) => {
					const backup = state?.backup;
					if (!backup) return;
					setting.addButton((button) =>
						button.setButtonText(`Roll back to ${backup.version}`).onClick(() => void this.plugin.rollback(theme.name)),
					);
				},
			});
		}
		return items;
	}
}

function describe(theme: Installed, state: ThemeState | undefined): string {
	const parts = [theme.version];
	if (state?.updatedAt && state.version === theme.version) {
		const when = new Date(state.updatedAt).toLocaleDateString();
		parts.push(state.skip && !state.backup ? `rolled back ${when}, ${state.skip} skipped` : `updated ${when}`);
	} else if (state?.hash === undefined && state?.unverified === theme.version) {
		parts.push('does not match the published file, not updated automatically');
	} else {
		parts.push('not updated yet');
	}
	return parts.join(' · ');
}
