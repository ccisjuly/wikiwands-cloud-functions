import * as admin from "firebase-admin";
import {onUserCreate} from "./onUserCreate.js";
import {getUserProfile} from "./getUserProfile.js";
import {refreshMonthlyCredits} from "./refreshMonthlyCredits.js";
import {onNonSubscriptionPurchase} from "./onNonSubscriptionPurchase.js";
import {onEntitlementActivated} from "./onEntitlementActivated.js";
import {useCredits} from "./useCredits.js";
import {refundCredits} from "./refundCredits.js";
import {generateVideo} from "./generateVideo.js";
import {getAvatars} from "./getAvatars.js";
import {getLocales} from "./getLocales.js";
import {getVoices} from "./getVoices.js";
import {getVideoStatus} from "./getVideoStatus.js";
import {uploadImage} from "./uploadImage.js";
import {getUserImages} from "./getUserImages.js";
import {getUserVideos} from "./getUserVideos.js";
import {getUserTransactions} from "./getUserTransactions.js";
import {scrapeProducts} from "./scrapeProducts.js";
import {importProduct} from "./importProduct.js";
import {getUserProducts} from "./getUserProducts.js";
import {updateProduct} from "./updateProduct.js";
import {uploadProductImage} from "./uploadProductImage.js";
import {deleteProduct} from "./deleteProduct.js";

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
  generateVideo,
  getAvatars,
  getLocales,
  getVoices,
  getVideoStatus,
  uploadImage,
  getUserImages,
  getUserVideos,
  getUserTransactions,
  scrapeProducts,
  importProduct,
  getUserProducts,
  updateProduct,
  uploadProductImage,
  deleteProduct,
};
