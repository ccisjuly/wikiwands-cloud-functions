/**
 * Request/response examples for API contracts.
 * Use for tests, docs, and client codegen.
 */

/* eslint-disable @typescript-eslint/naming-convention */

// ---------------------------------------------------------------------------
// 1) Resume upload and parsing
// ---------------------------------------------------------------------------

export const RESUME_UPLOAD_REQUEST = {
  fileName: "Jane_Doe_Resume.pdf",
  contentType: "application/pdf",
  sizeBytes: 245000,
  confirmUpload: true,
} as const;

export const RESUME_UPLOAD_RESPONSE = {
  data: {
    resumeId: "res_abc123",
    status: "pending",
    uploadUrl: "https://storage.googleapis.com/...",
    expiresAt: "2025-03-07T12:00:00.000Z",
  },
} as const;

export const RESUME_GET_RESPONSE = {
  data: {
    id: "res_abc123",
    userId: "uid_xyz",
    fileStoragePath: "users/uid_xyz/resumes/res_abc123/file.pdf",
    fileContentType: "application/pdf",
    fileName: "Jane_Doe_Resume.pdf",
    parseStatus: "completed",
    parsed: {
      sections: [
        {
          type: "experience",
          rawText: "Senior Engineer at Acme...",
          structured: [
            {
              title: "Senior Software Engineer",
              company: "Acme Inc",
              location: "San Francisco, CA",
              startDate: "2020-01",
              endDate: "2024-06",
              current: false,
              description: "Led backend services.",
            },
          ],
        },
        { type: "skills", rawText: "TypeScript, Node.js...", structured: ["TypeScript", "Node.js", "Firebase"] },
      ],
      rawFullText: "...",
      contact: {
        email: "jane@example.com",
        phone: "+1-555-0100",
        location: "San Francisco, CA",
        linkedIn: "https://linkedin.com/in/janedoe",
      },
      metadata: {
        fileName: "Jane_Doe_Resume.pdf",
        fileType: "application/pdf",
        parsedAt: "2025-03-07T10:00:00.000Z",
        parserVersion: "1.0.0",
      },
    },
    createdAt: "2025-03-07T09:00:00.000Z",
    updatedAt: "2025-03-07T10:05:00.000Z",
    isPrimary: true,
  },
} as const;

// ---------------------------------------------------------------------------
// 2) AI resume analysis
// ---------------------------------------------------------------------------

export const RESUME_ANALYZE_RESPONSE = {
  data: {
    resumeId: "res_abc123",
    userId: "uid_xyz",
    status: "completed",
    completedAt: "2025-03-07T10:06:00.000Z",
    insights: {
      strengths: ["Strong backend experience", "Relevant tech stack"],
      areasForImprovement: ["Add metrics to experience bullets"],
      suggestedSkills: ["GraphQL", "Kubernetes"],
      experienceSummary: "5+ years in software engineering.",
      educationSummary: "BS Computer Science, State University",
      atsScore: 78,
      readabilityScore: 85,
      keywordGaps: ["distributed systems", "microservices"],
    },
    suggestedProfileUpdates: {
      headline: "Senior Software Engineer | Backend & APIs",
      skills: ["TypeScript", "Node.js", "Firebase", "GraphQL"],
      yearsOfExperience: 5,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// 3) Candidate profile
// ---------------------------------------------------------------------------

export const PROFILE_GET_RESPONSE = {
  data: {
    userId: "uid_xyz",
    displayName: "Jane Doe",
    email: "jane@example.com",
    headline: "Senior Software Engineer",
    summary: "Backend engineer with 5+ years experience.",
    yearsOfExperience: 5,
    skills: ["TypeScript", "Node.js", "Firebase", "PostgreSQL"],
    jobTypes: ["full_time", "contract"],
    openToWork: true,
    profileCompletenessScore: 85,
    createdAt: "2025-03-01T00:00:00.000Z",
    updatedAt: "2025-03-07T10:00:00.000Z",
  },
} as const;

export const PROFILE_UPDATE_REQUEST = {
  displayName: "Jane Doe",
  headline: "Senior Software Engineer | Backend",
  openToWork: true,
  preferredLocations: ["San Francisco", "Remote"],
} as const;

// ---------------------------------------------------------------------------
// 4) Job recommendations
// ---------------------------------------------------------------------------

export const JOB_RECOMMENDATIONS_RESPONSE = {
  data: {
    items: [
      {
        job: {
          id: "job_1",
          title: "Senior Backend Engineer",
          company: "Tech Co",
          location: "San Francisco, CA",
          isRemote: true,
          jobType: "full_time",
          postedAt: "2025-03-05T00:00:00.000Z",
          source: "greenhouse",
          applyUrl: "https://boards.greenhouse.io/...",
        },
        score: 92,
        matchReasons: ["Skills match", "Experience level", "Remote"],
        keywordMatches: ["TypeScript", "Node.js", "APIs"],
      },
    ],
    nextCursor: "job_2",
    hasMore: true,
  },
} as const;

// ---------------------------------------------------------------------------
// 5) Application tracker
// ---------------------------------------------------------------------------

export const APPLICATION_CREATE_REQUEST = {
  jobId: "job_1",
  jobTitle: "Senior Backend Engineer",
  company: "Tech Co",
  companyLogoUrl: "https://...",
  resumeId: "res_abc123",
  source: "app",
  notes: "Referred by John",
} as const;

export const APPLICATION_GET_RESPONSE = {
  data: {
    id: "app_xyz",
    userId: "uid_xyz",
    jobId: "job_1",
    jobTitle: "Senior Backend Engineer",
    company: "Tech Co",
    status: "submitted",
    appliedAt: "2025-03-07T11:00:00.000Z",
    resumeId: "res_abc123",
    coverLetterId: "ast_cl_1",
    statusHistory: [
      { status: "draft", at: "2025-03-07T10:30:00.000Z" },
      { status: "submitted", at: "2025-03-07T11:00:00.000Z" },
    ],
    createdAt: "2025-03-07T10:30:00.000Z",
    updatedAt: "2025-03-07T11:00:00.000Z",
  },
} as const;

export const APPLICATION_LIST_RESPONSE = {
  data: {
    items: [
      {
        id: "app_xyz",
        jobId: "job_1",
        jobTitle: "Senior Backend Engineer",
        company: "Tech Co",
        status: "submitted",
        appliedAt: "2025-03-07T11:00:00.000Z",
        updatedAt: "2025-03-07T11:00:00.000Z",
      },
    ],
    nextCursor: null,
    hasMore: false,
  },
} as const;

// ---------------------------------------------------------------------------
// 6) Application asset generation
// ---------------------------------------------------------------------------

export const GENERATE_ASSET_REQUEST = {
  type: "cover_letter",
  resumeId: "res_abc123",
  options: {
    tone: "professional",
    length: "medium",
    customInstructions: "Emphasize backend and API experience.",
  },
} as const;

export const GENERATE_ASSET_RESPONSE = {
  data: {
    id: "ast_cl_1",
    userId: "uid_xyz",
    applicationId: "app_xyz",
    jobId: "job_1",
    type: "cover_letter",
    status: "completed",
    resumeId: "res_abc123",
    output: {
      content: "Dear Hiring Manager,\n\nI am writing to apply...",
      contentType: "text/plain",
    },
    createdAt: "2025-03-07T10:45:00.000Z",
    updatedAt: "2025-03-07T10:46:00.000Z",
    completedAt: "2025-03-07T10:46:00.000Z",
  },
} as const;

// ---------------------------------------------------------------------------
// 7) Resume improvement suggestions
// ---------------------------------------------------------------------------

export const RESUME_SUGGESTIONS_LIST_RESPONSE = {
  data: [
    {
      id: "sug_1",
      resumeId: "res_abc123",
      category: "ats",
      severity: "suggestion",
      title: "Add measurable outcomes",
      description: "Include metrics (e.g. 'reduced latency by 40%') in experience bullets.",
      currentSnippet: "Improved system performance.",
      suggestedSnippet: "Improved system performance, reducing p99 latency by 40%.",
      sectionRef: "experience.0",
      status: "pending",
      createdAt: "2025-03-07T10:10:00.000Z",
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const API_ERROR_RESPONSE = {
  error: {
    code: "RESUME_PARSE_FAILED",
    message: "Resume parsing failed.",
    details: { resumeId: "res_abc123", reason: "Unsupported layout" },
  },
} as const;
