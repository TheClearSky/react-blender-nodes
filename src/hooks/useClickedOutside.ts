import { isCoordinateInBox, type Coordinate } from '@/utils';
import { useCallback, useEffect, type RefObject } from 'react';

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
      if (checkDescendants && !currentRef.contains(event.target as Node)) {
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
