import * as admin from "firebase-admin";
import {EntitlementsDoc, EntitlementProduct} from "./types.js";

// Ensure Firebase Admin is initialized before accessing Firestore
if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const db = admin.firestore();

/**
 * Reads environment variable from functions config or process.env
 * @param {string} keyPath - Path to config key (e.g., "rc.pro_products")
 * @param {string} fallback - Default value if not found
 * @return {string} Configuration value or fallback
 */
function readEnv(keyPath: string, fallback = ""): string {
  // Try functions.config() via process.env fallback from CLI
  const parts = keyPath.split(".");
  try {
    const cfg = (globalThis as any).functions?.config?.() ??
      (globalThis as any).functions?.config ?? {};
    let ref: any = cfg;
    for (const k of parts) ref = ref?.[k];
    if (typeof ref === "string") return ref;
  } catch {
    // Ignore config errors, fall back to process.env
  }
  const envKey = keyPath.toUpperCase().replaceAll(".", "_");
  return process.env[envKey] ?? fallback;
}

/**
 * Parses pro products from configuration
 * @return {Set<string>} Set of pro product IDs
 */
export function parseProSet(): Set<string> {
  const raw = readEnv("rc.pro_products", "");
  return new Set(
    raw.split(",").map((s) => s.trim()).filter(Boolean)
  );
}

/**
 * Updates or creates an entitlement product for a user
 * @param {string} uid - User ID
 * @param {string} productId - Product ID
 * @param {Partial<EntitlementProduct>} patch - Partial product data to update
 * @return {Promise<void>}
 */
export async function upsertEntitlementProduct(
  uid: string,
  productId: string,
  patch: Partial<EntitlementProduct>
): Promise<void> {
  const entRef = db.collection("entitlements").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(entRef);
    const data = (snap.exists ? (snap.data() as any) : {}) as EntitlementsDoc;

    const products = {...(data.products || {})};
    const prev = products[productId] || {};
    products[productId] = {
      source: "revenuecat",
      active: prev.active ?? false,
      end: prev.end ?? null,
      quotaRemaining: prev.quotaRemaining,
      ...patch,
    };

    // Derive tags.pro
    const proSet = parseProSet();
    const isProActive = Object.entries(products).some(([pid, val]: any) => {
      const endMillis = val?.end?.toMillis ? val.end.toMillis() : undefined;
      const notExpired = endMillis ? endMillis > Date.now() : true;
      return proSet.has(pid) && !!val.active && notExpired;
    });

    const tags = new Set<string>(data.tags || []);
    if (isProActive) tags.add("pro"); else tags.delete("pro");

    const updated: EntitlementsDoc = {
      products,
      tags: Array.from(tags),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    tx.set(entRef, updated, {merge: true});
  });
}
