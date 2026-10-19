import { describe, expect, it } from 'vitest';
import { hash } from '../src/hash';
import { checkAndUpdate, Data, rollback } from '../src/updater';
import { DIRECTORY, env, FakeIo } from './fake';

const OLD = 'body { color: red; }';
const NEW = 'body { color: blue; }';
const BACKUP = 'config/plugins/theme-autoupdater/backups/Tela';

function vault(): { io: FakeIo; data: Data } {
	const io = new FakeIo();
	io.installTheme('Tela', '1.1.0', OLD);
	io.release('Tela', 'rbartoli/obsidian-tela-theme', '1.1.0', OLD);
	io.publish('Tela', 'rbartoli/obsidian-tela-theme', '1.2.0', NEW);
	return { io, data: { themes: {} } };
}

describe('update', () => {
	it('installs a newer version, backing up the old one', async () => {
		const { io, data } = vault();
		const e = env(io);
		const { installed, events } = await checkAndUpdate(e, data);
		expect(installed).toEqual([{ name: 'Tela', version: '1.1.0', dir: 'config/themes/Tela' }]);
		expect(events).toEqual([{ type: 'updated', name: 'Tela', from: '1.1.0', to: '1.2.0' }]);
		expect(io.theme('Tela')).toEqual({ css: NEW, version: '1.2.0' });
		expect(io.files.get(`${BACKUP}/theme.css`)).toBe(OLD);
		expect(JSON.parse(io.files.get(`${BACKUP}/manifest.json`) ?? '')).toMatchObject({ version: '1.1.0' });
		expect(data.themes.Tela).toMatchObject({ version: '1.2.0', hash: hash(NEW), backup: { version: '1.1.0', hash: hash(OLD) } });
		expect(e.reloads).toBe(1);
		// The backup lands before the theme is touched.
		expect(io.writes.indexOf(`${BACKUP}/theme.css`)).toBeLessThan(io.writes.indexOf('config/themes/Tela/theme.css'));
	});

	it('does nothing when the installed version is current', async () => {
		const { io, data } = vault();
		io.installTheme('Tela', '1.2.0', NEW);
		const { events } = await checkAndUpdate(env(io), data);
		expect(events).toEqual([]);
		expect(io.writes).toEqual([]);
		expect(data.themes.Tela).toMatchObject({ version: '1.2.0', hash: hash(NEW) });
	});

	it('falls back to the default branch when the release has no assets', async () => {
		const { io, data } = vault();
		io.routes.delete('https://github.com/rbartoli/obsidian-tela-theme/releases/download/1.2.0/manifest.json');
		io.routes.delete('https://github.com/rbartoli/obsidian-tela-theme/releases/download/1.2.0/theme.css');
		const { events } = await checkAndUpdate(env(io), data);
		expect(events).toEqual([{ type: 'updated', name: 'Tela', from: '1.1.0', to: '1.2.0' }]);
		expect(io.theme('Tela').css).toBe(NEW);
	});

	it('refuses files whose manifest is not the version it expected', async () => {
		const { io, data } = vault();
		io.routes.set('https://github.com/rbartoli/obsidian-tela-theme/releases/download/1.2.0/manifest.json', JSON.stringify({ name: 'Tela', version: '1.1.9' }));
		const { events } = await checkAndUpdate(env(io), data);
		expect(events).toEqual([]);
		expect(io.theme('Tela')).toEqual({ css: OLD, version: '1.1.0' });
	});

	it('ignores themes that are not in the directory or whose manifest name differs', async () => {
		const { io, data } = vault();
		io.installTheme('Other', '0.1.0', OLD);
		io.routes.set('https://raw.githubusercontent.com/rbartoli/obsidian-tela-theme/HEAD/manifest.json', JSON.stringify({ name: 'Not Tela', version: '9.0.0' }));
		const { installed, events } = await checkAndUpdate(env(io), data);
		expect(installed.map((t) => t.name)).toEqual(['Other', 'Tela']);
		expect(events).toEqual([]);
		expect(io.writes).toEqual([]);
	});

	it('skips the check quietly when the directory cannot be fetched', async () => {
		const { io, data } = vault();
		io.routes.delete(DIRECTORY);
		const { events } = await checkAndUpdate(env(io), data);
		expect(events).toEqual([]);
		expect(io.requests).toEqual([DIRECTORY]);
	});

	it('honours minAppVersion through versions.json', async () => {
		const { io, data } = vault();
		io.publish('Tela', 'rbartoli/obsidian-tela-theme', '2.0.0', 'v2', { minAppVersion: '2.0.0', versions: { '1.1.0': '1.0.0', '1.2.0': '1.10.0', '2.0.0': '2.0.0' } });
		const { events } = await checkAndUpdate(env(io, { appVersion: '1.14.4' }), data);
		expect(events).toEqual([{ type: 'updated', name: 'Tela', from: '1.1.0', to: '1.2.0' }]);
		expect(io.theme('Tela').css).toBe(NEW);
	});
});

describe('local edits', () => {
	it('skips a theme whose theme.css differs from the published file, and says so once', async () => {
		const { io, data } = vault();
		io.installTheme('Tela', '1.1.0', `${OLD} /* mine */`);
		const first = await checkAndUpdate(env(io), data);
		expect(first.events).toEqual([{ type: 'edited', name: 'Tela', to: '1.2.0' }]);
		expect(io.theme('Tela').css).toBe(`${OLD} /* mine */`);
		expect(io.writes).toEqual([]);
		const second = await checkAndUpdate(env(io), data);
		expect(second.events).toEqual([]);
		// A later version is announced again.
		io.publish('Tela', 'rbartoli/obsidian-tela-theme', '1.3.0', 'v3');
		const third = await checkAndUpdate(env(io), data);
		expect(third.events).toEqual([{ type: 'edited', name: 'Tela', to: '1.3.0' }]);
	});

	it('detects an edit made after the plugin installed the theme', async () => {
		const { io, data } = vault();
		await checkAndUpdate(env(io), data);
		io.files.set('config/themes/Tela/theme.css', `${NEW} /* mine */`);
		io.publish('Tela', 'rbartoli/obsidian-tela-theme', '1.3.0', 'v3');
		const { events } = await checkAndUpdate(env(io), data);
		expect(events).toEqual([{ type: 'edited', name: 'Tela', to: '1.3.0' }]);
		expect(io.theme('Tela').css).toBe(`${NEW} /* mine */`);
	});

	it('treats a theme it cannot match to any published file as edited', async () => {
		const { io, data } = vault();
		io.routes.delete('https://github.com/rbartoli/obsidian-tela-theme/releases/download/1.1.0/theme.css');
		const { events } = await checkAndUpdate(env(io), data);
		expect(events).toEqual([{ type: 'edited', name: 'Tela', to: '1.2.0' }]);
		expect(data.themes.Tela).toMatchObject({ version: '1.1.0', unverified: '1.1.0' });
		// Verification is not retried for the same installed version.
		io.requests.length = 0;
		await checkAndUpdate(env(io), data);
		expect(io.requests).not.toContain('https://github.com/rbartoli/obsidian-tela-theme/releases/download/1.1.0/theme.css');
	});

	it('matches the default branch when the installed version is the current one and has no asset', async () => {
		const { io, data } = vault();
		io.installTheme('Tela', '1.2.0', NEW);
		io.routes.delete('https://github.com/rbartoli/obsidian-tela-theme/releases/download/1.2.0/theme.css');
		await checkAndUpdate(env(io), data);
		expect(data.themes.Tela).toMatchObject({ version: '1.2.0', hash: hash(NEW) });
	});

	it('re-verifies a theme that was updated outside the plugin', async () => {
		const { io, data } = vault();
		await checkAndUpdate(env(io), data);
		io.installTheme('Tela', '1.3.0', 'v3 edited');
		io.publish('Tela', 'rbartoli/obsidian-tela-theme', '1.4.0', 'v4');
		const { events } = await checkAndUpdate(env(io), data);
		expect(events).toEqual([{ type: 'edited', name: 'Tela', to: '1.4.0' }]);
		expect(data.themes.Tela).toMatchObject({ version: '1.3.0', unverified: '1.3.0' });
	});
});

describe('failed install', () => {
	it('restores the previous files when a write fails', async () => {
		const { io, data } = vault();
		const e = env(io);
		let armed = false;
		io.failWrite = (path) => {
			if (path !== 'config/themes/Tela/manifest.json' || armed) return false;
			armed = true;
			return true;
		};
		const { events } = await checkAndUpdate(e, data);
		expect(events).toEqual([{ type: 'failed', name: 'Tela', to: '1.2.0', restored: true, error: 'EIO config/themes/Tela/manifest.json' }]);
		expect(io.theme('Tela')).toEqual({ css: OLD, version: '1.1.0' });
		expect(data.themes.Tela).toMatchObject({ version: '1.1.0', hash: hash(OLD) });
		expect(data.themes.Tela?.backup).toBeUndefined();
		expect(e.reloads).toBe(1);
	});

	it('reports when the restore fails too', async () => {
		const { io, data } = vault();
		io.failWrite = (path) => path === 'config/themes/Tela/theme.css';
		const { events } = await checkAndUpdate(env(io), data);
		expect(events).toEqual([{ type: 'failed', name: 'Tela', to: '1.2.0', restored: false, error: 'EIO config/themes/Tela/theme.css' }]);
	});

	it('does not touch the theme when the backup cannot be written', async () => {
		const { io, data } = vault();
		io.failWrite = (path) => path.startsWith(BACKUP);
		const { events } = await checkAndUpdate(env(io), data);
		expect(events).toEqual([]);
		expect(io.theme('Tela')).toEqual({ css: OLD, version: '1.1.0' });
	});
});

describe('rollback', () => {
	it('restores the backup and skips the version it replaces', async () => {
		const { io, data } = vault();
		const e = env(io);
		await checkAndUpdate(e, data);
		const event = await rollback(e, data, 'Tela');
		expect(event).toEqual({ type: 'rolled-back', name: 'Tela', to: '1.1.0', skipped: '1.2.0' });
		expect(io.theme('Tela')).toEqual({ css: OLD, version: '1.1.0' });
		expect(data.themes.Tela).toMatchObject({ version: '1.1.0', hash: hash(OLD), skip: '1.2.0' });
		expect(data.themes.Tela?.backup).toBeUndefined();
		expect(await io.exists(`${BACKUP}/theme.css`)).toBe(false);
		expect(e.reloads).toBe(2);
	});

	it('does not reinstall the skipped version, but installs the one after it', async () => {
		const { io, data } = vault();
		const e = env(io);
		await checkAndUpdate(e, data);
		await rollback(e, data, 'Tela');
		const again = await checkAndUpdate(e, data);
		expect(again.events).toEqual([]);
		expect(io.theme('Tela').version).toBe('1.1.0');
		io.publish('Tela', 'rbartoli/obsidian-tela-theme', '1.2.1', 'v2.1');
		const next = await checkAndUpdate(e, data);
		expect(next.events).toEqual([{ type: 'updated', name: 'Tela', from: '1.1.0', to: '1.2.1' }]);
		expect(io.theme('Tela')).toEqual({ css: 'v2.1', version: '1.2.1' });
	});

	it('refuses without a backup or with a backup that does not match its record', async () => {
		const { io, data } = vault();
		const e = env(io);
		await expect(rollback(e, data, 'Tela')).rejects.toThrow('no backup of Tela');
		await checkAndUpdate(e, data);
		io.files.set(`${BACKUP}/theme.css`, 'tampered');
		await expect(rollback(e, data, 'Tela')).rejects.toThrow('does not match its record');
		expect(io.theme('Tela').css).toBe(NEW);
	});
});

describe('without the theme registry', () => {
	it('only reports updates, once per version, and never writes', async () => {
		const { io, data } = vault();
		const first = await checkAndUpdate(env(io, { canInstall: false }), data);
		expect(first.events).toEqual([{ type: 'available', name: 'Tela', to: '1.2.0' }]);
		expect(io.writes).toEqual([]);
		expect(io.theme('Tela').version).toBe('1.1.0');
		const second = await checkAndUpdate(env(io, { canInstall: false }), data);
		expect(second.events).toEqual([]);
	});

	it('refuses to roll back', async () => {
		const { io, data } = vault();
		await checkAndUpdate(env(io), data);
		await expect(rollback(env(io, { canInstall: false }), data, 'Tela')).rejects.toThrow('does not let the plugin write');
	});
});

describe('housekeeping', () => {
	it('drops the record and backup of a theme that was uninstalled', async () => {
		const { io, data } = vault();
		await checkAndUpdate(env(io), data);
		await io.rmdir('config/themes/Tela');
		await checkAndUpdate(env(io), data);
		expect(data.themes.Tela).toBeUndefined();
		expect(await io.exists(BACKUP)).toBe(false);
	});

	it('lists only directory themes that Obsidian would', async () => {
		const io = new FakeIo();
		io.installTheme('Tela', '1.1.0', OLD);
		io.folders.add('config/themes/Broken');
		io.files.set('config/themes/Broken/theme.css', OLD);
		io.folders.add('config/themes/Renamed');
		io.files.set('config/themes/Renamed/theme.css', OLD);
		io.files.set('config/themes/Renamed/manifest.json', JSON.stringify({ name: 'Other', version: '1.0.0' }));
		const { installed } = await checkAndUpdate(env(io), { themes: {} });
		expect(installed.map((t) => t.name)).toEqual(['Tela']);
	});
});
