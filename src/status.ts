// The status line under each theme in the settings tab.
import { Installed, ThemeState } from './updater';
import { isNewer } from './versions';

export function statusLine(theme: Installed, state: ThemeState | undefined): string {
	const parts = [theme.version];
	if (state?.updatedAt && state.version === theme.version) {
		const when = new Date(state.updatedAt).toLocaleDateString();
		parts.push(state.skip && !state.backup ? `rolled back ${when}, ${state.skip} skipped` : `updated ${when}`);
	} else if (state?.hash === undefined && state?.unverified === theme.version) {
		parts.push(
			state.latest && isNewer(theme.version, state.latest)
				? `does not match the published file, so ${state.latest} was not installed`
				: 'does not match the published file, not updated automatically',
		);
	} else if (state?.latest) {
		parts.push(isNewer(theme.version, state.latest) ? `${state.latest} available` : 'up to date');
	} else {
		parts.push('not checked yet');
	}
	return parts.join(' · ');
}
