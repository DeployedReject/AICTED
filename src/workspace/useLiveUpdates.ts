import { portalClient } from "./api";
import { useEffect } from "react";
/** Server invalidation hints carry no case data; normal scoped APIs revalidate every read. */
export default function useLiveUpdates(refresh: () => void) {
  useEffect(() => {
    let socket: WebSocket | null = null,
      retry = 1000,
      stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      debounce: ReturnType<typeof setTimeout> | undefined;
    function changed() {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!stopped) refresh();
      }, 600);
    }
    function connect() {
      if (stopped || document.visibilityState === "hidden") return;
      socket = new WebSocket(
        location.origin.replace(/^http/, "ws") +
          "/api/live?client=" +
          encodeURIComponent(portalClient),
      );
      socket.onopen = () => {
        retry = 1000;
      };
      socket.onmessage = (event) => {
        try {
          if (JSON.parse(event.data).type === "changed") changed();
        } catch {}
      };
      socket.onclose = () => {
        if (!stopped) {
          timer = setTimeout(connect, retry);
          retry = Math.min(retry * 2, 60000);
        }
      };
      socket.onerror = () => socket?.close();
    }
    function visibility() {
      if (document.visibilityState === "visible") {
        changed();
        if (!socket || socket.readyState === WebSocket.CLOSED) {
          clearTimeout(timer);
          connect();
        }
      }
    }
    connect();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", visibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(debounce);
      socket?.close();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", visibility);
    };
  }, [refresh]);
}
