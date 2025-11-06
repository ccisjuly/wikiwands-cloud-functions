import * as admin from "firebase-admin";
import {onUserCreate} from "./onUserCreate.js";
import {getUserProfile} from "./getUserProfile.js";
import {refreshMonthlyCredits} from "./refreshMonthlyCredits.js";
import {onNonSubscriptionPurchase} from "./onNonSubscriptionPurchase.js";
import {onEntitlementActivated} from "./onEntitlementActivated.js";
import {useCredits} from "./useCredits.js";
import {refundCredits} from "./refundCredits.js";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export {
  onUserCreate,
  getUserProfile,
  refreshMonthlyCredits,
  onNonSubscriptionPurchase,
  onEntitlementActivated,
  useCredits,
  refundCredits,
};
