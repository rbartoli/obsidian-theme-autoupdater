const RAW = 'https://raw.githubusercontent.com/';
const RELEASES = 'https://github.com/';

export const DIRECTORY_URL = `${RAW}obsidianmd/obsidian-releases/HEAD/community-css-themes.json`;

export const rawUrl = (repo: string, file: string): string => `${RAW}${repo}/HEAD/${file}`;

export const releaseUrl = (repo: string, tag: string, file: string): string =>
	`${RELEASES}${repo}/releases/download/${tag}/${file}`;
