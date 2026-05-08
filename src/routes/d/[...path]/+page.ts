// Desactivar SSR para esta página porque usa stores client-side
// que dependen de localStorage y Google Identity Services
export const ssr = false;

// Prerender también desactivado (es una página dinámica)
export const prerender = false;
