import { App, PluginSettingTab, SettingDefinitionItem } from 'obsidian';
import type ThemeAutoupdater from './main';
import { statusLine } from './status';
import { isNewer } from './versions';

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
				desc: statusLine(theme, state),
				searchable: false,
				render: (setting) => {
					const backup = state?.backup;
					if (backup) {
						setting.addButton((button) =>
							button.setButtonText(`Roll back to ${backup.version}`).onClick(() => void this.plugin.rollback(theme.name)),
						);
					}
					const skipped = state?.skip;
					if (skipped && this.plugin.canInstall && state?.version === theme.version && isNewer(theme.version, skipped)) {
						setting.addButton((button) =>
							button.setButtonText(`Install ${skipped}`).onClick(() => void this.plugin.installSkipped(theme.name)),
						);
					}
				},
			});
		}
		return items;
	}
}
