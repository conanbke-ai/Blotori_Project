import type { NextConfig } from "next";

const qaLanIp = process.env.BLOTORI_QA_LAN_IP;
const safeQaLanIp = qaLanIp && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(qaLanIp) ? qaLanIp : undefined;

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "172.30.1.21",
    ...(safeQaLanIp ? [safeQaLanIp] : []),
  ],
};

export default nextConfig;
