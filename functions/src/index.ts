import * as admin from "firebase-admin";
import {rcWebhook} from "./rcWebhook.js";
import {onUserCreate} from "./onUserCreate.js";
import {getUserProfile} from "./getUserProfile.js";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export {rcWebhook, onUserCreate, getUserProfile};
