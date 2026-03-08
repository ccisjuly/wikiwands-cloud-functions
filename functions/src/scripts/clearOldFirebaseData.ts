/**
 * 清理 Firebase 里旧版 app 的 Firestore 集合和 Storage 路径（不用的数据与结构）。
 * 默认仅打印将要删除的内容，加 --execute 才真正执行删除。
 *
 * 运行（在 wikiwands-cloud-functions 根目录）:
 *   npm run clear-old-data [-- --execute]
 *
 * 需要应用默认凭证：GOOGLE_APPLICATION_CREDENTIALS 或 gcloud auth application-default login。
 */

import * as admin from "firebase-admin";

const PROJECT_ID = "wikiwands";
const DRY_RUN = !process.argv.includes("--execute");
const BATCH_SIZE = 500;

/** 要删除的 Firestore 顶层集合（旧版 wikiwands）。 */
const FIRESTORE_COLLECTIONS_TO_DELETE = [
  "products",
  "video_tasks",
  "user_images",
  "credits",
  "entitlements",
  "payments",
];

/** 要清空的 Storage 路径前缀。 */
const STORAGE_PREFIXES_TO_DELETE = ["video_generation/"];

/**
 * 递归删除集合内所有文档（先删子集合再删文档）。
 */
async function deleteCollectionRecursive(
  firestore: admin.firestore.Firestore,
  collectionRef: admin.firestore.CollectionReference
): Promise<number> {
  const snapshot = await collectionRef.limit(BATCH_SIZE).get();
  if (snapshot.empty) return 0;

  for (const doc of snapshot.docs) {
    const subcollections = await doc.ref.listCollections();
    for (const sub of subcollections) {
      await deleteCollectionRecursive(firestore, sub);
    }
    if (!DRY_RUN) {
      await doc.ref.delete();
    }
  }
  const count = snapshot.size;
  if (snapshot.size === BATCH_SIZE) {
    return count + await deleteCollectionRecursive(firestore, collectionRef);
  }
  return count;
}

async function runFirestoreCleanup(): Promise<void> {
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
  const db = admin.firestore();

  console.log(DRY_RUN ? "[dry-run] Firestore 将要删除的集合:" : "Firestore 正在删除:");
  for (const name of FIRESTORE_COLLECTIONS_TO_DELETE) {
    const ref = db.collection(name);
    const count = await deleteCollectionRecursive(db, ref);
    console.log(`  ${name}: ${count} 文档`);
  }
}

async function runStorageCleanup(): Promise<void> {
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
  const bucket = admin.storage().bucket(`${PROJECT_ID}.appspot.com`);

  console.log(DRY_RUN ? "[dry-run] Storage 将要删除的前缀:" : "Storage 正在删除:");
  for (const prefix of STORAGE_PREFIXES_TO_DELETE) {
    const [files] = await bucket.getFiles({ prefix });
    if (!DRY_RUN) {
      await Promise.all(files.map((f) => f.delete()));
    }
    console.log(`  ${prefix}: ${files.length} 个文件`);
  }
}

async function main(): Promise<void> {
  console.log(DRY_RUN ? "--- 仅预览，未执行删除。加 --execute 将真正删除。---\n" : "--- 执行删除 ---\n");
  await runFirestoreCleanup();
  console.log("");
  await runStorageCleanup();
  console.log(DRY_RUN ? "\n实际删除请运行: npm run clear-old-data -- --execute" : "\n清理完成。");
}

const CREDENTIALS_HINT = `
未检测到 Google 凭证，脚本无法访问 Firestore/Storage。请任选一种方式：

方式一（推荐）：使用服务账号密钥
  1. 打开 Firebase 控制台 → 项目设置 → 服务账号
  2. 生成新的私钥，下载 JSON 文件
  3. 在终端执行：
     export GOOGLE_APPLICATION_CREDENTIALS="/绝对路径/到/密钥文件.json"
  4. 在同一终端再执行：npm run clear-old-data

方式二：使用本机 gcloud 默认凭证
  1. 安装并登录 gcloud：https://cloud.google.com/sdk/docs/install
  2. 执行：gcloud auth application-default login
  3. 再执行：npm run clear-old-data
`;

main().catch((e: Error) => {
  const msg = e?.message ?? String(e);
  if (msg.includes("Could not load the default credentials") || msg.includes("getApplicationDefault")) {
    console.error(CREDENTIALS_HINT);
  } else {
    console.error(e);
  }
  process.exit(1);
});
