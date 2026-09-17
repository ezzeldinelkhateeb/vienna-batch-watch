import { useState, useEffect } from "react";

let globalOpen = false;
const listeners = new Set<(open: boolean) => void>();

function setGlobalOpen(val: boolean) {
  globalOpen = val;
  listeners.forEach((listener) => listener(globalOpen));
}

export function useNavigationDrawer() {
  const [isOpen, setIsOpen] = useState(globalOpen);

  useEffect(() => {
    const onChange = (val: boolean) => setIsOpen(val);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return {
    isOpen,
    openDrawer: () => setGlobalOpen(true),
    closeDrawer: () => setGlobalOpen(false),
    toggleDrawer: () => setGlobalOpen(!globalOpen),
    setIsOpen: (val: boolean) => setGlobalOpen(val),
  };
}
