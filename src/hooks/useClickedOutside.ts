import { isCoordinateInBox, type Coordinate } from '@/utils';
import { useCallback, useEffect, type RefObject } from 'react';

function useClickedOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  callback: () => void,
  checkDescendants: boolean = true,
  checkCoordinates: boolean = false,
) {
  const listener = useCallback(
    (event: MouseEvent | TouchEvent) => {
      // if (ref.current && !ref.current.contains(event.target as Node)) {
      //   callback();
      // }
      if (!ref?.current) {
        return;
      }
      let allChecksPassed = true;
      // Check if the target is a descendant of the ref, if not, the callback is called
      if (checkDescendants && !ref.current.contains(event.target as Node)) {
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
        const boundingBox = ref.current.getBoundingClientRect();
        if (!isCoordinateInBox(coordinate, boundingBox)) {
          allChecksPassed = false;
        }
      }
      // If any of the checks fail, the callback is called
      if (!allChecksPassed) {
        callback();
      }
    },
    [ref, callback, checkDescendants, checkCoordinates],
  );
  useEffect(() => {
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, listener]);
}

export { useClickedOutside };
