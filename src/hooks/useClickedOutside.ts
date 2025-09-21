import { isCoordinateInBox, type Coordinate } from '@/utils';
import { useCallback, useEffect, type RefObject } from 'react';

/**
 * Custom hook for detecting clicks outside of a specified element
 *
 * This hook provides functionality to detect when a user clicks outside of a
 * specified element, commonly used for closing dropdowns, modals, or other
 * overlay components.
 *
 * @template T - The type of HTML element being referenced
 * @param ref - Reference to the element to monitor (can be RefObject or direct element)
 * @param callback - Function to call when a click outside is detected
 * @param checkDescendants - Whether to check if the click target is a descendant of the ref element (default: true)
 * @param checkCoordinates - Whether to use coordinate-based checking instead of DOM hierarchy (default: false)
 *
 * @example
 * ```tsx
 * function Dropdown() {
 *   const [isOpen, setIsOpen] = useState(false);
 *   const dropdownRef = useRef<HTMLDivElement>(null);
 *
 *   useClickedOutside(dropdownRef, () => {
 *     setIsOpen(false);
 *   });
 *
 *   return (
 *     <div ref={dropdownRef}>
 *       {isOpen && <div>Dropdown content</div>}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Using coordinate-based checking for more precise control
 * function Modal() {
 *   const modalRef = useRef<HTMLDivElement>(null);
 *
 *   useClickedOutside(
 *     modalRef,
 *     () => closeModal(),
 *     false, // Don't check descendants
 *     true   // Use coordinate checking
 *   );
 *
 *   return <div ref={modalRef}>Modal content</div>;
 * }
 * ```
 */
function useClickedOutside<T extends HTMLElement>(
  ref: RefObject<T | null> | T | null,
  callback: () => void,
  checkDescendants: boolean = true,
  checkCoordinates: boolean = false,
) {
  //Get the current ref from all the possible types
  const currentRef =
    ref !== null ? ('current' in ref ? ref.current : ref) : null;

  const listener = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!currentRef) {
        return;
      }
      let allChecksPassed = true;
      // Check if the target is a descendant of the ref, if not, the callback is called
      if (
        checkDescendants &&
        event.target instanceof Node &&
        !currentRef.contains(event.target)
      ) {
        allChecksPassed = false;
      }
      // Check if the target is inside the ref, if not, the callback is called
      else if (checkCoordinates) {
        const coordinate: Coordinate =
          'clientX' in event
            ? // Mouse event
              { x: event.clientX, y: event.clientY }
            : // Touch event
              { x: event.touches[0].clientX, y: event.touches[0].clientY };
        const boundingBox = currentRef.getBoundingClientRect();
        if (!isCoordinateInBox(coordinate, boundingBox)) {
          allChecksPassed = false;
        }
      }
      // If any of the checks fail, the callback is called
      if (!allChecksPassed) {
        callback();
      }
    },
    [currentRef, callback, checkDescendants, checkCoordinates],
  );
  useEffect(() => {
    //Listen to mouse and touch events for the entire page, evaluate if callback should be called
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      //Remove the listeners when the component unmounts
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [currentRef, listener]);
}

export { useClickedOutside };
