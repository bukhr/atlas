const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined

let initialized = false

/** Inyecta el script de gtag.js y configura GA4. Llamar una vez en onMount del layout. */
export function initGA(): void {
	if (initialized || !GA_ID || typeof window === 'undefined') return
	initialized = true

	const w = window as any
	w.dataLayer = w.dataLayer || []
	w.gtag = function () {
		// eslint-disable-next-line prefer-rest-params
		w.dataLayer.push(arguments)
	}
	w.gtag('js', new Date())
	w.gtag('config', GA_ID)

	const script = document.createElement('script')
	script.async = true
	script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
	document.head.appendChild(script)
}

/** Envía un evento custom a GA4 */
export function trackEvent(eventName: string, params?: Record<string, string | number | boolean>): void {
	if (!GA_ID || typeof window === 'undefined') return
	const gtag = (window as any).gtag
	if (typeof gtag === 'function') {
		gtag('event', eventName, params)
	}
}
