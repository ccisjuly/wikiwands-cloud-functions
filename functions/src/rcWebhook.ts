import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {db, upsertEntitlementProduct} from "./entitlements.js";
import {COLLECTIONS} from "./types.js";

/**
 * RevenueCat Webhook (v2 simplified)
 * Auth via Bearer token; writes Firestore entitlements mirror
 * and archives event.
 */
export const rcWebhook = functions
  .https.onRequest(async (req, res) => {
    try {
      const cfg = functions.config();
      const expected = cfg?.rc?.webhook_secret;
      const auth = (req.headers.authorization || "").toString();
      const token = auth.split(" ")[1];
      if (!expected || !auth.startsWith("Bearer ") || token !== expected) {
        functions.logger.warn("Unauthorized webhook");
        res.status(401).send("unauthorized");
        return;
      }

      const body = req.body || {};
      const eventId = body.id || `${Date.now()}-${Math.random()}`;
      const event = body.event || {};
      const type: string = event.type || "UNKNOWN";
      const uid: string = event.app_user_id;
      const productId: string = event.product_id || "";
      const store: string = event.store || "app_store";
      const expiresMs: number | undefined = event.expiration_at_ms;

      if (!uid || !productId) {
        functions.logger.warn("Missing uid/productId", {uid, productId});
        res.status(200).send("ignored");
        return;
      }

      await db.doc(`${COLLECTIONS.PAYMENTS_RC}/${eventId}`).set({
        uid, productId, store, event: type,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      const endTs = expiresMs ?
        admin.firestore.Timestamp.fromMillis(expiresMs) : null;
      const nowMs = Date.now();
      const stillActive = endTs ? endTs.toMillis() > nowMs :
        !["EXPIRATION", "CANCELLATION", "REFUND"].includes(type);

      await upsertEntitlementProduct(
        uid,
        productId,
        {active: stillActive, end: endTs}
      );

      res.status(200).send("ok");
    } catch (e) {
      functions.logger.error(e);
      res.status(500).send("error");
    }
  });
