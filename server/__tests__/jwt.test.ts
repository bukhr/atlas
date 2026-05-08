import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signSessionJwt, verifySessionJwt } from '../lib/jwt.js';

describe('JWT', () => {
	let prevSecret: string | undefined;

	beforeEach(() => {
		prevSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
	});

	afterEach(() => {
		if (prevSecret === undefined) delete process.env.JWT_SECRET;
		else process.env.JWT_SECRET = prevSecret;
	});

	it('signs and verifies a payload round-trip', async () => {
		const payload = {
			sub: 'user-1',
			email: 'a@b.com',
			name: 'A',
			picture: 'https://example.com/p.png',
		};
		const token = await signSessionJwt(payload);
		const verified = await verifySessionJwt(token);
		expect(verified).toEqual(payload);
	});

	it('returns null on tampered token', async () => {
		const token = await signSessionJwt({
			sub: 'u',
			email: 'a@b.com',
			name: 'A',
			picture: '',
		});
		const tampered = token.slice(0, -2) + 'AB';
		expect(await verifySessionJwt(tampered)).toBeNull();
	});

	it('returns null on garbage token', async () => {
		expect(await verifySessionJwt('not.a.jwt')).toBeNull();
	});
});
