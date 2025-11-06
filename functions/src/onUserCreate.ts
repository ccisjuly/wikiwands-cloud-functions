import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {COLLECTIONS} from "./types.js";

export const onUserCreate = functions
  .auth.user().onCreate(async (user) => {
    const db = admin.firestore();
    const {uid, email, displayName, photoURL} = user;
    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.doc(`${COLLECTIONS.USERS}/${uid}`).set({
      profile: {
        displayName: displayName || "",
        email: email || "",
        photoURL: photoURL || "",
      },
      roles: {super_admin: false},
      updatedAt: now,
      // entitlements, subscriptions, non_subscriptions 等字段
      // 由 RevenueCat Extension 自动管理
    }, {merge: true});

    // 初始化点数文档
    await db.doc(`${COLLECTIONS.CREDITS}/${uid}`).set({
      gift_credit: 0,
      paid_credit: 0,
      updatedAt: now,
    }, {merge: true});
  });
