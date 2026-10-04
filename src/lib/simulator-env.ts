/** Hosts where the payment simulator may run. Published / custom domains never match. */
export function isSimulatorHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("id-preview--") ||
    hostname.endsWith("-dev.lovable.app")
  );
}

export function simulatorAvailableInBrowser(): boolean {
  return typeof window !== "undefined" && isSimulatorHost(window.location.hostname);
}
