import React, { useEffect, useRef } from "react";

export const IsVisibleObserver = ({ callback }: { callback: () => void }) => {
  /*
   * This is a special component that uses the IntersectionObserver to watch for when it
   * comes into view and calls the `callback` prop.
   * It can be used to implement an "infinite" scrolling list by putting it at the end of
   * a scrollable list and then using the callback to request more data.
   * See: https://blog.logrocket.com/infinite-scrolling-react/
   */

  const ref = useRef()

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          callback()
        }
      },
      { threshold: 1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [ref]);

  return <div ref={ref} />
}
