import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function for combining and merging CSS classes
 *
 * This function combines clsx for conditional class handling with tailwind-merge
 * for intelligent Tailwind CSS class merging. It resolves conflicts between
 * Tailwind classes and ensures only the last conflicting class is applied.
 *
 * @param inputs - Variable number of class values (strings, objects, arrays, etc.)
 * @returns Merged and deduplicated class string
 *
 * @example
 * ```tsx
 * // Basic usage
 * cn('px-4 py-2', 'bg-blue-500', 'text-white')
 * // Returns: "px-4 py-2 bg-blue-500 text-white"
 *
 * // Conditional classes
 * cn('base-class', isActive && 'active-class', isDisabled && 'disabled-class')
 *
 * // Tailwind class merging (conflicts resolved)
 * cn('px-4 px-6', 'py-2 py-4')
 * // Returns: "px-6 py-4" (last conflicting classes win)
 *
 * // With objects
 * cn({
 *   'bg-blue-500': isPrimary,
 *   'bg-gray-500': !isPrimary,
 *   'text-white': true,
 * })
 * ```
 */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { cn };
