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

export type CreditsDoc = {
  gift_credit: number;
  paid_credit: number;
  last_gift_reset?: FirebaseFirestore.Timestamp | null;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
};

export const COLLECTIONS = {
  USERS: "users",
  ENTITLEMENTS: "entitlements",
  PAYMENTS_RC: "payments/rc",
  CREDITS: "credits",
  TRANSACTIONS: "transactions",
  PRODUCTS: "products",
} as const;

export const RC_EVENT_FIELD = {
  ID: "id",
  EVENT: "event",
  UID: "uid",
  PRODUCT_ID: "productId",
} as const;

export const CREDIT_CONSTANTS = {
  MONTHLY_GIFT_CREDIT: 10,
  NON_SUBSCRIPTION_PURCHASE_CREDIT: 10,
  USE_CREDITS_AMOUNT: 5, // 每次使用点数的固定数量
} as const;
