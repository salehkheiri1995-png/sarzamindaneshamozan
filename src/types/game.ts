import { BookId, DifficultyLevel, QuestionType, RealmId } from '../shared/curriculum';
import { StudentProfile } from '../context/AuthContext';

export interface MissionItem {
  id: number;
  gradeId: number;
  bookId: BookId;
  realmId: RealmId;
  chapterId: string;
  topicId: string;
  academicYear: string;
  difficulty: DifficultyLevel;
  learningObjective: string;
  storyIntro: string;
  hintText: string;
  questionType: QuestionType;
  promptText: string;
  imageDataUrl?: string | null;
  payload: {
    options?: string[];
    letters?: string[];
    items?: string[];
    sentence?: string;
    wrongWord?: string;
    pairs?: Array<{ left: string; right: string }>;
    sequence?: string[];
    choices?: string[];
    memoryPairs?: Array<{ a: string; b: string }>;
    buckets?: string[];
    sortItems?: Array<{ label: string; bucket: string }>;
    totalSlices?: number;
    targetSlices?: number;
    shapeLabel?: string;
  };
  correctAnswer: string;
  explanation: string;
  contentSource: string;
  reviewStatus: string;
  completed?: boolean;
}

export interface MissionAttemptItem {
  id: number;
  studentId: number;
  contentId: number | null;
  gradeId: number;
  bookId: string;
  topicId: string;
  questionType: string;
  isCorrect: boolean;
  scoreEarned: number;
  coinsEarned: number;
  durationSeconds: number;
  nextReviewAt: string | null;
  createdAt: string;
}

export interface HomeworkQuestion {
  promptText: string;
  options: string[];
  correctAnswer: string;
  hintText?: string;
  explanation?: string;
}

export interface HomeworkSubmissionItem {
  id: number;
  homeworkId: number;
  studentId: number;
  autoScore: number;
  teacherScore: number | null;
  teacherFeedback: string | null;
  status: 'submitted' | 'graded' | 'needs_revision';
  submittedAt: string;
}

export interface HomeworkItem {
  id: number;
  classroomId: number | null;
  creatorRole: string;
  gradeId: number;
  bookId: BookId;
  chapterId: string;
  topicId: string;
  title: string;
  description: string;
  dueDate: string;
  questions: HomeworkQuestion[];
  attachmentName: string | null;
  submission: HomeworkSubmissionItem | null;
}

export interface ExamQuestion {
  id: string;
  topicId: string;
  bookId: string;
  promptText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface ExamItem {
  id: number;
  classroomId: number | null;
  gradeId: number;
  bookId: BookId;
  examType: string;
  title: string;
  durationMinutes: number;
  maxScore: number;
  difficulty: string;
  questions: ExamQuestion[];
}

export interface ExamAttemptItem {
  id: number;
  examId: number;
  studentId: number;
  score: number;
  maxScore: number;
  correctCount: number;
  totalQuestions: number;
  durationSeconds: number;
  wrongTopicsJson: string;
  strengthsJson: string;
  answersJson: string;
  completedAt: string;
}

export interface TeacherVideoItem {
  id: number;
  classroomId: number | null;
  gradeId: number;
  bookId: BookId;
  chapterId: string;
  title: string;
  description: string;
  durationLabel: string;
  videoUrl: string;
  followUpQuestion: {
    promptText: string;
    options: string[];
    correctAnswer: string;
  };
}

export interface AnnouncementItem {
  id: number;
  classroomId: number | null;
  senderName: string;
  kind: string;
  message: string;
  scheduledDate: string | null;
  createdAt: string;
}

export interface EnrollmentItem {
  enrollmentId: number;
  classroomId: number;
  classroomName: string;
  gradeId: number;
  joinCode: string;
}

export interface StudentWorldData {
  student: StudentProfile;
  missions: MissionItem[];
  recommendedMissionId: number | null;
  attempts: MissionAttemptItem[];
  enrollments: EnrollmentItem[];
  homeworks: HomeworkItem[];
  exams: ExamItem[];
  examAttempts: ExamAttemptItem[];
  videos: TeacherVideoItem[];
  announcements: AnnouncementItem[];
  rewardedChestsToday: number;
}
