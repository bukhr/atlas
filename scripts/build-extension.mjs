#!/usr/bin/env node
/**
 * Renders browser-extensions/atlas-links/manifest.template.json into
 * manifest.json + privacy-policy.html using values from .env (or defaults).
 *
 * Recognized variables (all optional, sensible defaults provided):
 *
 *   EXTENSION_ADDON_ID         Firefox addon id (required by AMO if you sign).
 *                              Default: 'atlas-links@example.com'
 *
 *   EXTENSION_NAME             Display name of the extension.
 *                              Default: 'Atlas - Links'
 *
 *   PUBLIC_APP_NAME            App name referenced in description / privacy policy.
 *                              Default: 'Atlas'
 *
 *   PUBLIC_APP_URL             URL of the app the extension companions.
 *                              Used to derive APP_HOST and the content_script match
 *                              for the app-detect script. Defaults to
 *                              'http://localhost:3000', which means the extension
 *                              only "wakes up" on localhost out of the box.
 *
 *   PUBLIC_CONTACT_EMAIL       Contact email used in the privacy policy.
 *                              Default: '' (the placeholder remains, you can fill
 *                              it in by hand for publishing).
 *
 * Run:
 *   node scripts/build-extension.mjs
 *   npm run build:extension
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const extDir = resolve(repoRoot, 'browser-extensions/atlas-links');

await loadDotEnv(resolve(repoRoot, '.env'));

const cfg = {
	EXTENSION_ADDON_ID: process.env.EXTENSION_ADDON_ID ?? 'atlas-links@example.com',
	EXTENSION_NAME: process.env.EXTENSION_NAME ?? 'Atlas - Links',
	PUBLIC_APP_NAME: process.env.PUBLIC_APP_NAME ?? 'Atlas',
	PUBLIC_APP_URL: process.env.PUBLIC_APP_URL ?? 'http://localhost:3000',
	PUBLIC_CONTACT_EMAIL: process.env.PUBLIC_CONTACT_EMAIL ?? '{{CONTACT_EMAIL}}',
};

const appHost = hostMatchPattern(cfg.PUBLIC_APP_URL);

await renderManifest();
await renderPrivacyPolicy();

console.log('[build-extension] manifest.json and privacy-policy.html generated.');
console.log(`  EXTENSION_ADDON_ID = ${cfg.EXTENSION_ADDON_ID}`);
console.log(`  app-detect match  = ${appHost}`);

async function renderManifest() {
	const tpl = await readFile(resolve(extDir, 'manifest.template.json'), 'utf-8');

	// Always allow localhost matches alongside the configured app host so that
	// loading "unpacked" against a local dev server keeps working out of the box.
	const matches = JSON.stringify(unique([appHost, 'http://localhost/*']));

	const rendered = tpl
		.replaceAll('{{ADDON_ID}}', cfg.EXTENSION_ADDON_ID)
		.replaceAll('{{EXTENSION_NAME}}', cfg.EXTENSION_NAME)
		.replaceAll('{{APP_NAME}}', cfg.PUBLIC_APP_NAME)
		.replaceAll('{{APP_HOST_MATCHES}}', matches);

	// Validate it's parseable JSON before writing.
	JSON.parse(rendered);

	await writeFile(resolve(extDir, 'manifest.json'), rendered);
}

async function renderPrivacyPolicy() {
	const tplPath = resolve(repoRoot, 'static/privacy-policy.template.html');
	const outPath = resolve(repoRoot, 'static/privacy-policy.html');
	const tpl = await readFile(tplPath, 'utf-8');

	const host = new URL(cfg.PUBLIC_APP_URL).host || 'localhost';

	const rendered = tpl
		.replaceAll('{{APP_HOST}}', host)
		.replaceAll('{{APP_NAME}}', cfg.PUBLIC_APP_NAME)
		.replaceAll('{{CONTACT_EMAIL}}', cfg.PUBLIC_CONTACT_EMAIL);

	await writeFile(outPath, rendered);
}

function hostMatchPattern(url) {
	const u = new URL(url);
	return `${u.protocol}//${u.host}/*`;
}

function unique(arr) {
	return [...new Set(arr)];
}

async function loadDotEnv(envPath) {
	if (!existsSync(envPath)) return;
	const content = await readFile(envPath, 'utf-8');
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		const rawVal = trimmed.slice(eq + 1).trim();
		const val = stripQuotes(rawVal);
		if (process.env[key] === undefined) process.env[key] = val;
	}
}

function stripQuotes(s) {
	if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
		return s.slice(1, -1);
	}
	return s;
}
