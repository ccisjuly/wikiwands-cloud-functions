export type EntitlementProduct = {
  active: boolean;
  end?: FirebaseFirestore.Timestamp | null;
  source: "revenuecat";
  quotaRemaining?: number;
};

export type EntitlementsDoc = {
  products?: Record<string, EntitlementProduct>;
  tags?: string[];
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
};

export const COLLECTIONS = {
  USERS: "users",
  ENTITLEMENTS: "entitlements",
  PAYMENTS_RC: "payments/rc",
} as const;

export const RC_EVENT_FIELD = {
  ID: "id",
  EVENT: "event",
  UID: "uid",
  PRODUCT_ID: "productId",
} as const;
