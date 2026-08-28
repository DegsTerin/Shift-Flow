// en-GB: Parses an explicit proxy allowlist so string booleans cannot silently weaken client-IP trust.
import { isIP } from "node:net";

export function parseTrustedProxy(value: string | undefined): false | string[] {
  if (!value || value.trim().toLowerCase() === "false") return false;

  const addresses = value
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  if (!addresses.length || addresses.some((address) => isIP(address) === 0)) {
    throw new Error("TRUST_PROXY must be false or a comma-separated list of literal IP addresses");
  }
  return addresses;
}
