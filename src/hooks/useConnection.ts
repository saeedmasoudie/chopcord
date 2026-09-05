import { useState, useEffect, useCallback } from "react";
import type { ConnectionStatus } from "../App";

export function useConnection() {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [latency, setLatency] = useState<number | null>(null);

  const ping = useCallback(async () => {
    if (window.chopcord?.ping) {
      // Electron: real HTTPS ping to discord.com
      const result = await window.chopcord.ping();
      setStatus(result.online ? "online" : "offline");
      setLatency(result.online ? result.latency : null);
    } else {
      // Browser fallback: navigator.onLine
      setStatus(navigator.onLine ? "online" : "offline");
      setLatency(null);
    }
  }, []);

  useEffect(() => {
    ping();
    const interval = setInterval(ping, 8000);

    const handleOnline  = () => { setStatus("online");  ping(); };
    const handleOffline = () => { setStatus("offline"); setLatency(null); };

    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [ping]);

  return { status, latency };
}
