import { describe, expect, it } from 'vitest';
import { statusLine } from '../src/status';

const tela = { name: 'Tela', version: '1.1.1', dir: 'config/themes/Tela' };
const at = new Date(2026, 9, 23).getTime();
const day = new Date(at).toLocaleDateString();

describe('statusLine', () => {
	it('says when the plugin last updated or rolled back the theme', () => {
		expect(statusLine({ ...tela, version: '1.2.0' }, { version: '1.2.0', updatedAt: at, backup: { version: '1.1.1', hash: 'h', at } })).toBe(`1.2.0 · updated ${day}`);
		expect(statusLine(tela, { version: '1.1.1', updatedAt: at, skip: '1.2.0' })).toBe(`1.1.1 · rolled back ${day}, 1.2.0 skipped`);
	});

	it('names the version held back from a theme that does not match the published file', () => {
		expect(statusLine(tela, { version: '1.1.1', unverified: '1.1.1', latest: '1.2.0' })).toBe('1.1.1 · does not match the published file, so 1.2.0 was not installed');
		expect(statusLine(tela, { version: '1.1.1', unverified: '1.1.1', latest: '1.1.1' })).toBe('1.1.1 · does not match the published file, not updated automatically');
	});

	it('tells a current theme from one with an update waiting', () => {
		expect(statusLine(tela, { version: '1.1.1', hash: 'h', latest: '1.1.1' })).toBe('1.1.1 · up to date');
		expect(statusLine(tela, { version: '1.1.1', hash: 'h', latest: '1.2.0' })).toBe('1.1.1 · 1.2.0 available');
	});

	it('says so before the first check', () => {
		expect(statusLine(tela, undefined)).toBe('1.1.1 · not checked yet');
	});
});
