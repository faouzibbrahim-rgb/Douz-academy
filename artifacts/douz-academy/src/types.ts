export type EducationStage = "primary" | "preparatory" | "secondary";

export interface EducationalFile {
  id: string;
  title: string;
  fileName: string;
  fileSize: string;
  level: string;
  stage: EducationStage;
  subject: string;
  description: string;
  category: "lesson" | "exercise" | "exam_prep" | "summary";
  isPremium: boolean;
  downloads: number;
  uploadedAt: string;
}

export interface StudentSubscription {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface ClassroomMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  isAdmin: boolean;
}

export interface PlatformConfig {
  siteName: string;
  teacherName: string;
  welcomeMessage: string;
  d17Phone: string;
  ccpAccount: string;
  yearlyPriceTnd: number;
  contactPhone: string;
  svtSpecialtyText: string;
  megaLink?: string;
  googleDriveLink?: string;
  apkLink?: string;
}

export interface SessionRecording {
  id: string;
  title: string;
  subjectId: string;
  level: string;
  stage: EducationStage;
  duration: string;
  fileSize: string;
  url?: string;
  recordedAt: string;
}

export interface LiveRoom {
  id: string;
  subjectId: string;
  subjectName: string;
  level: string;
  stage: EducationStage;
  roomCode: string;
}
