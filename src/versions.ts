// Version rules, mirroring what Obsidian's own theme updater does
// (Settings → Appearance → Check for updates), so the plugin installs exactly
// the version Obsidian would.

export interface ThemeManifest {
	name?: unknown;
	version?: unknown;
	minAppVersion?: unknown;
}

function parse(version: unknown): number[] | null {
	if (typeof version !== 'string' || !version) return null;
	const parts = version.split('.').map((p) => parseInt(p, 10));
	return parts.some((n) => isNaN(n)) ? null : parts;
}

// True when `candidate` is newer than `current`. An unparsable current version
// counts as older than anything; an unparsable candidate is never newer.
export function isNewer(current: unknown, candidate: unknown): boolean {
	const a = parse(current);
	const b = parse(candidate);
	if (!b) return false;
	if (!a) return true;
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) {
		const x = a[i] ?? 0;
		const y = b[i] ?? 0;
		if (x < y) return true;
		if (x > y) return false;
	}
	return a.length < b.length;
}

// The version to install for a theme whose default branch carries `manifest`:
// the manifest's version when this app is new enough for it, otherwise the
// newest entry in versions.json this app can run, or null when there is none.
export async function resolveVersion(
	manifest: ThemeManifest,
	appVersion: string,
	versionsJson: () => Promise<unknown>,
): Promise<string | null> {
	const version = typeof manifest.version === 'string' ? manifest.version : null;
	const minApp = manifest.minAppVersion;
	if (typeof minApp !== 'string' || !isNewer(appVersion, minApp)) return version;
	const versions = await versionsJson();
	if (!versions || typeof versions !== 'object') return null;
	let best: string | null = null;
	for (const [candidate, required] of Object.entries(versions as Record<string, unknown>)) {
		if (isNewer(appVersion, required)) continue;
		if (best && !isNewer(best, candidate)) continue;
		best = candidate;
	}
	return best;
}
