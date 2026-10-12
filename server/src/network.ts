import os from 'os';

/**
 * Returns the best local IPv4 address for clients (e.g. mobile phones or
 * other laptops connected to the same Wi-Fi / hotspot / LAN) to connect to.
 *
 * It filters out internal/loopback addresses, scores interfaces so that real
 * wireless/Ethernet adapters take precedence over Docker, bridges, VMs, and
 * VPN tunnels, and falls back gracefully to 127.0.0.1 if offline.
 */
export function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  const candidates: Array<{ address: string; score: number; name: string }> = [];

  // Patterns that typically belong to virtual, container, or tunnel interfaces
  const virtualRegex = /^(docker|br-|veth|virbr|vboxnet|vmnet|tun|tap|utun|wg|dummy|kube|flannel)/i;
  // Patterns that typically belong to physical Wi-Fi or LAN adapters
  const wifiLanRegex = /^(wl|en|eth|wlan|wi-fi|ethernet|lan|ap)/i;

  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets) continue;

    for (const net of nets) {
      // Must be IPv4, non-internal, and not a link-local (169.254.x.x)
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        let score = 10;

        if (wifiLanRegex.test(name)) {
          score += 50; // strongly prefer physical wireless/ethernet
        }
        if (virtualRegex.test(name)) {
          score -= 40; // penalize docker/bridges/vms
        }

        // Prefer standard private LAN IP blocks (Class C: 192.168.x.x, Class A: 10.x.x.x, Class B: 172.16-31.x.x)
        if (net.address.startsWith('192.168.')) {
          score += 20; // very common for mobile hotspots and home Wi-Fi
        } else if (net.address.startsWith('10.')) {
          score += 15;
        } else if (/^172\.(1[6-9]|2\d|3[01])\./.test(net.address)) {
          score += 10;
        }

        candidates.push({ address: net.address, score, name });
      }
    }
  }

  if (candidates.length > 0) {
    // Sort highest score first
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].address;
  }

  return '127.0.0.1';
}

export function getHostname(): string {
  return os.hostname();
}

