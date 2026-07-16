import { useCallback, useEffect, useId, useRef, useState } from "react";

let activeLayerId: string | null = null;
const listeners = new Set<(nextActiveId: string | null) => void>();

function publish(nextActiveId: string | null) {
  activeLayerId = nextActiveId;
  listeners.forEach((listener) => listener(nextActiveId));
}

type DismissibleLayerOptions = {
  closeOnOtherLayer?: boolean;
  onDismiss?: () => void;
};

export function useDismissibleLayer(layerKey?: string, options: DismissibleLayerOptions = {}) {
  const closeOnOtherLayer = options.closeOnOtherLayer ?? true;
  const generatedId = useId();
  const id = layerKey || generatedId;
  const ref = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onDismissRef = useRef(options.onDismiss);
  const openRef = useRef(false);
  const [open, setOpen] = useState(false);

  onDismissRef.current = options.onDismiss;

  const dismissLayer = useCallback(() => {
    const wasOpen = openRef.current;
    openRef.current = false;
    if (activeLayerId === id) {
      publish(null);
    }
    setOpen(false);
    if (wasOpen) {
      onDismissRef.current?.();
    }
  }, [id]);

  useEffect(() => {
    const listener = (nextActiveId: string | null) => {
      if (!closeOnOtherLayer) {
        return;
      }
      if (nextActiveId !== id) {
        dismissLayer();
      }
    };

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
      if (activeLayerId === id) {
        publish(null);
      }
    };
  }, [closeOnOtherLayer, dismissLayer, id]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      dismissLayer();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      dismissLayer();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissLayer, open]);

  const openLayer = useCallback(() => {
    openRef.current = true;
    publish(id);
    setOpen(true);
  }, [id]);

  const closeLayer = useCallback(() => {
    openRef.current = false;
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

  return { closeLayer, dismissLayer, open, openLayer, ref, toggle, triggerRef };
}
