import { useEffect, useRef } from "react";

export function useAuthRequestGuard() {
  const mounted = useRef(false);
  const sequence = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
    };
  }, []);

  return {
    begin: () => ++sequence.current,
    cancel: () => { sequence.current += 1; },
    isCurrent: (request: number) => mounted.current && sequence.current === request,
  };
}
