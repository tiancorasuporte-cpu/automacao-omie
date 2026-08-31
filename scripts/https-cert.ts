import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

import { generate } from "selfsigned";

const dir = resolve(process.cwd(), "certs");
const keyPath = resolve(dir, "dev-key.pem");
const certPath = resolve(dir, "dev-cert.pem");
const hostsPath = resolve(dir, "hosts.txt");

function localIpv4s() {
  const ips = new Set<string>(["127.0.0.1"]);
  for (const extra of (process.env["HTTPS_IPS"] ?? "").split(",")) {
    const ip = extra.trim();
    if (ip) ips.add(ip);
  }
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) ips.add(addr.address);
    }
  }
  return [...ips];
}

export async function httpsCert() {
  mkdirSync(dir, { recursive: true });
  const ips = localIpv4s();
  const hosts = ["localhost", ...ips];
  const stamp = hosts.slice().sort().join(",");
  const stale =
    !existsSync(keyPath) ||
    !existsSync(certPath) ||
    !existsSync(hostsPath) ||
    readFileSync(hostsPath, "utf8").trim() !== stamp;

  if (stale) {
    const notAfterDate = new Date();
    notAfterDate.setFullYear(notAfterDate.getFullYear() + 10);
    const pems = await generate([{ name: "commonName", value: "Ancora Access" }], {
      keySize: 2048,
      algorithm: "sha256",
      notAfterDate,
      extensions: [
        { name: "basicConstraints", cA: false },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
        { name: "extKeyUsage", serverAuth: true },
        {
          name: "subjectAltName",
          altNames: [{ type: 2, value: "localhost" }, ...ips.map((ip) => ({ type: 7 as const, ip }))],
        },
      ],
    });
    writeFileSync(keyPath, pems.private);
    writeFileSync(certPath, pems.cert);
    writeFileSync(hostsPath, stamp);
    console.info(`[https] certificado gerado para ${hosts.join(", ")}`);
  }

  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
  };
}
