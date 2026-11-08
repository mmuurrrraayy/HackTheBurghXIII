const LOG_URL = import.meta.env.VITE_LOG_URL;

export function log(event, data = {}) {
  const entry = { t: Date.now(), event, ...data };
  window.__agentLog = window.__agentLog || [];
  window.__agentLog.push(entry);
  console.log("[agentlog]", entry);
  if (LOG_URL) {
    fetch(LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).catch(() => {});
  }
}