/**
 * Crea un limitador de concurrencia tipo semáforo.
 * Las llamadas que exceden maxConcurrent se encolan y ejecutan
 * a medida que se liberan slots.
 */
export function createLimiter(maxConcurrent: number) {
	let active = 0;
	const queue: Array<() => void> = [];

	return async function limit<T>(fn: () => Promise<T>): Promise<T> {
		if (active >= maxConcurrent) {
			await new Promise<void>((resolve) => queue.push(resolve));
		}
		active++;
		try {
			return await fn();
		} finally {
			active--;
			const next = queue.shift();
			if (next) next();
		}
	};
}
