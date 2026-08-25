import assert from "node:assert/strict";
import { formatStorageBytes, storageQuotaError } from "../src/client/storage";

assert.equal(formatStorageBytes(0), "0 GB");
assert.equal(formatStorageBytes(9_400_000_000), "9.4 GB");
assert.equal(formatStorageBytes(750_000_000), "750 MB");

assert.deepEqual(storageQuotaError({
  code: "STORAGE_QUOTA_EXCEEDED",
  requiredBytes: 1_200_000_000,
  availableBytes: 750_000_000,
}), {
  required: "1.2 GB",
  available: "750 MB",
});
assert.equal(storageQuotaError({ code: "SOMETHING_ELSE" }), null);

console.log("storage UI tests passed");
