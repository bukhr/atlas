import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines class names using clsx and merges Tailwind classes intelligently
 * using tailwind-merge to avoid conflicts.
 *
 * @example
 * cn('px-4 py-2', isActive && 'bg-blue-500', 'px-6')
 * // Result: 'py-2 bg-blue-500 px-6' (px-4 merged with px-6)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
