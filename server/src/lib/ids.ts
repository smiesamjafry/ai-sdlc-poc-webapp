import { createHash, randomBytes, randomUUID } from "node:crypto";

export const uuid = () => randomUUID();
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
