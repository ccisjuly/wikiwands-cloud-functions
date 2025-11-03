import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

export const onUserCreate = functions
  .auth.user().onCreate(async (user) => {
    const db = admin.firestore();
    const {uid, email, displayName, photoURL} = user;
    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.doc(`users/${uid}`).set({
      profile: {
        displayName: displayName || "",
        email: email || "",
        photoURL: photoURL || "",
      },
      roles: {super_admin: false},
      updatedAt: now,
    }, {merge: true});

    await db.doc(`entitlements/${uid}`).set({
      products: {},
      tags: [],
      updatedAt: now,
    }, {merge: true});
  });
