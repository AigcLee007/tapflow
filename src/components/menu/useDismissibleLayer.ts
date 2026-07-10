import { useCallback, useEffect, useId, useRef, useState } from "react";

let activeLayerId: string | null = null;
const listeners = new Set<(nextActiveId: string | null) => void>();

function publish(nextActiveId: string | null) {
  activeLayerId = nextActiveId;
  listeners.forEach((listener) => listener(nextActiveId));
}

type DismissibleLayerOptions = {
  closeOnOtherLayer?: boolean;
};

export function useDismissibleLayer(layerKey?: string, options: DismissibleLayerOptions = {}) {
  const closeOnOtherLayer = options.closeOnOtherLayer ?? true;
  const generatedId = useId();
  const id = layerKey || generatedId;
  const ref = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const listener = (nextActiveId: string | null) => {
      if (!closeOnOtherLayer) {
        return;
      }
      if (nextActiveId !== id) {
        setOpen(false);
      }
    };

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
      if (activeLayerId === id) {
        publish(null);
      }
    };
  }, [closeOnOtherLayer, id]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
      if (activeLayerId === id) {
        publish(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      setOpen(false);
      if (activeLayerId === id) {
        publish(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [id, open]);

  const openLayer = useCallback(() => {
    publish(id);
    setOpen(true);
  }, [id]);

  const closeLayer = useCallback(() => {
    if (activeLayerId === id) {
      publish(null);
    }
    setOpen(false);
  }, [id]);

  const toggle = useCallback(() => {
    if (open) {
      closeLayer();
      return;
    }
    openLayer();
  }, [closeLayer, open, openLayer]);

  return { closeLayer, open, openLayer, ref, toggle, triggerRef };
}
