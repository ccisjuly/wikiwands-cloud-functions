/**
 * 在 Firestore 中生成对应的数据结构：写入各集合的占位文档，使集合在控制台可见。
 * 仅用于开发/初始化，生产环境请勿随意执行。
 *
 * 运行前需设置凭证（同 clearOldFirebaseData）。
 * 运行：npm run build && npm run seed-firestore-structure
 * 可选环境变量：SEED_USER_ID=某个测试uid（默认用 seed-user-demo）
 */

import * as admin from "firebase-admin";

const PROJECT_ID = "wikiwands";
const SEED_USER_ID = process.env.SEED_USER_ID ?? "seed-user-demo";

async function seed(): Promise<void> {
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
  const db = admin.firestore();
  const now = new Date().toISOString();

  const userRef = db.collection("users").doc(SEED_USER_ID);
  await userRef.set({
    userId: SEED_USER_ID,
    displayName: "Seed User",
    skills: [],
    openToWork: true,
    createdAt: now,
    updatedAt: now,
  });
  console.log("  users/%s", SEED_USER_ID);

  const resumeRef = userRef.collection("resumes").doc("seed-resume-1");
  await resumeRef.set({
    userId: SEED_USER_ID,
    fileStoragePath: "",
    fileContentType: "application/pdf",
    fileName: "placeholder.pdf",
    parseStatus: "pending",
    createdAt: now,
    updatedAt: now,
  });
  console.log("  users/%s/resumes/seed-resume-1", SEED_USER_ID);

  const analysisRef = userRef.collection("resumeAnalyses").doc("seed-resume-1");
  await analysisRef.set({
    resumeId: "seed-resume-1",
    userId: SEED_USER_ID,
    status: "pending",
    insights: { strengths: [], areasForImprovement: [], suggestedSkills: [] },
    createdAt: now,
  });
  console.log("  users/%s/resumeAnalyses/seed-resume-1", SEED_USER_ID);

  const suggestionRef = userRef.collection("resumeSuggestions").doc("seed-suggestion-1");
  await suggestionRef.set({
    id: "seed-suggestion-1",
    resumeId: "seed-resume-1",
    category: "ats",
    severity: "suggestion",
    title: "Placeholder suggestion",
    description: "Seed data",
    status: "pending",
    createdAt: now,
  });
  console.log("  users/%s/resumeSuggestions/seed-suggestion-1", SEED_USER_ID);

  const jobRef = db.collection("jobs").doc("seed-job-1");
  await jobRef.set({
    id: "seed-job-1",
    title: "Seed Job",
    company: "Seed Company",
    location: "Remote",
    jobType: "full_time",
    description: "Placeholder job for structure.",
    postedAt: now,
    source: "seed",
  });
  console.log("  jobs/seed-job-1");

  const applicationRef = userRef.collection("applications").doc("seed-application-1");
  await applicationRef.set({
    id: "seed-application-1",
    userId: SEED_USER_ID,
    jobId: "seed-job-1",
    jobTitle: "Seed Job",
    company: "Seed Company",
    status: "draft",
    statusHistory: [{ status: "draft", at: now }],
    createdAt: now,
    updatedAt: now,
  });
  console.log("  users/%s/applications/seed-application-1", SEED_USER_ID);

  const assetRef = userRef.collection("generatedAssets").doc("seed-asset-1");
  await assetRef.set({
    id: "seed-asset-1",
    userId: SEED_USER_ID,
    applicationId: "seed-application-1",
    jobId: "seed-job-1",
    type: "cover_letter",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
  console.log("  users/%s/generatedAssets/seed-asset-1", SEED_USER_ID);

  console.log("\nFirestore 数据结构已写入（占位文档）。可在控制台查看集合。");
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
