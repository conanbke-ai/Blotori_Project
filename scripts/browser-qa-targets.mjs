const DEFAULT_LOCAL_URL = 'http://127.0.0.1:3000';

function normalizeURL(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute http(s) URL: ${value}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must use http or https: ${value}`);
  }
  url.pathname = url.pathname.replace(/\/$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function getLocalQaURL() {
  return normalizeURL(
    process.env.BLOTORI_QA_LOCAL_URL || process.env.BLOTORI_QA_URL || DEFAULT_LOCAL_URL,
    'BLOTORI_QA_LOCAL_URL',
  );
}

export function getQaTargets({ requireNetwork = false } = {}) {
  const localURL = getLocalQaURL();
  const networkValue = process.env.BLOTORI_QA_NETWORK_URL?.trim();
  if (requireNetwork && !networkValue) {
    throw new Error(
      'BLOTORI_QA_NETWORK_URL is required for dual-environment browser QA; do not substitute localhost.',
    );
  }

  const targets = [{ name: 'localhost', baseURL: localURL }];
  if (networkValue) {
    const networkURL = normalizeURL(networkValue, 'BLOTORI_QA_NETWORK_URL');
    if (networkURL === localURL) {
      throw new Error('Localhost and Network QA URLs must be different origins.');
    }
    targets.push({ name: 'network', baseURL: networkURL });
  }
  return targets;
}

export function getQaDeviceScaleFactor() {
  const value = Number(process.env.BLOTORI_QA_DEVICE_SCALE_FACTOR || '1');
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`BLOTORI_QA_DEVICE_SCALE_FACTOR must be positive: ${value}`);
  }
  return value;
}
