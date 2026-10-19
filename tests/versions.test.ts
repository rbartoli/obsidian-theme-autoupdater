import { describe, expect, it } from 'vitest';
import { isNewer, resolveVersion } from '../src/versions';

describe('isNewer', () => {
	it('compares numerically, part by part', () => {
		expect(isNewer('1.1.0', '1.2.0')).toBe(true);
		expect(isNewer('1.2.0', '1.1.0')).toBe(false);
		expect(isNewer('1.2.0', '1.2.0')).toBe(false);
		expect(isNewer('1.9.0', '1.10.0')).toBe(true);
		expect(isNewer('1.2', '1.2.0')).toBe(true);
		expect(isNewer('1.2.0', '1.2')).toBe(false);
	});

	it('treats an unparsable installed version as old and an unparsable candidate as nothing', () => {
		expect(isNewer('beta', '1.0.0')).toBe(true);
		expect(isNewer(undefined, '1.0.0')).toBe(true);
		expect(isNewer('1.0.0', 'latest')).toBe(false);
		expect(isNewer('1.0.0', undefined)).toBe(false);
	});
});

describe('resolveVersion', () => {
	const never = (): Promise<unknown> => Promise.reject(new Error('versions.json should not be fetched'));

	it('uses the manifest version when the app is new enough', async () => {
		expect(await resolveVersion({ version: '1.2.0', minAppVersion: '1.0.0' }, '1.14.4', never)).toBe('1.2.0');
		expect(await resolveVersion({ version: '1.2.0' }, '1.14.4', never)).toBe('1.2.0');
	});

	it('picks the newest versions.json entry the app can run otherwise', async () => {
		const versions = (): Promise<unknown> => Promise.resolve({ '1.0.0': '1.0.0', '1.1.0': '1.12.0', '1.2.0': '1.14.5' });
		expect(await resolveVersion({ version: '1.2.0', minAppVersion: '1.14.5' }, '1.14.4', versions)).toBe('1.1.0');
		expect(await resolveVersion({ version: '1.2.0', minAppVersion: '1.14.5' }, '1.14.4', () => Promise.resolve({ '1.2.0': '1.14.5' }))).toBe(null);
		expect(await resolveVersion({ version: '1.2.0', minAppVersion: '1.14.5' }, '1.14.4', () => Promise.resolve(null))).toBe(null);
	});
});
