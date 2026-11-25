import { DbUser } from '../../../context/AuthContext';
import { BookId, DifficultyLevel } from '../../../shared/curriculum';

export interface TeacherQuestionRow {
  id: number;
  gradeId: number;
  bookId: BookId;
  chapterId: string;
  topicId: string;
  difficulty: DifficultyLevel;
  questionType: string;
  promptText: string;
  hintText: string;
  explanation: string;
  imageDataUrl?: string | null;
  payload?: Record<string, unknown>;
  correctAnswer: string;
  contentSource: string;
  reviewStatus: string;
  rejectionReason?: string | null;
  classroomId?: number | null;
  classroomName?: string | null;
}

export interface TeacherQuestionResponseRow {
  id: number;
  contentId: number | null;
  studentId: number;
  studentName: string;
  studentAnswer: string | null;
  isCorrect: boolean;
  durationSeconds: number;
  createdAt: string;
}

export interface HomeworkQuestionItem {
  promptText: string;
  options: string[];
  correctAnswer: string;
  hintText?: string;
  explanation?: string;
}

export interface ExamQuestionItem {
  id: string;
  topicId: string;
  bookId: string;
  promptText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface TeacherClassroomRow {
  id: number;
  name: string;
  gradeId: number;
  joinCode: string;
  isActive: boolean;
  academicYear: string;
}

export interface TeacherEnrollmentRow {
  classroomId: number;
  studentId: number;
  nickname: string;
  gradeId: number;
  heroClass?: string;
  xp: number;
  coins: number;
  currentStreak?: number;
  minutesUsedToday?: number;
  dailyLimitMinutes?: number;
}

export interface TeacherStudentStatRow {
  classroomId: number;
  studentId: number;
  nickname: string;
  gradeId: number;
  xp: number;
  coins: number;
  currentStreak?: number;
  minutesUsedToday?: number;
  dailyLimitMinutes?: number;
  solvedMissionsCount: number;
  totalAttempts: number;
  correctRate: number;
  submittedHomeworksCount: number;
  totalClassHomeworks: number;
  examCount: number;
  avgExamScorePct: number | null;
  weakTopics: string[];
}

export interface TeacherHomeworkRow {
  id: number;
  classroomId: number | null;
  gradeId: number;
  bookId: BookId | string;
  chapterId?: string;
  topicId?: string;
  title: string;
  description: string;
  dueDate: string;
  questions?: HomeworkQuestionItem[];
}

export interface TeacherSubmissionRow {
  id: number;
  homeworkId: number;
  studentId: number;
  studentName: string;
  autoScore: number;
  teacherScore: number | null;
  teacherFeedback: string | null;
  status: string;
  submittedAt?: string | null;
  answers?: Array<{
    promptText: string;
    studentAnswer: string;
    isCorrect: boolean;
  }>;
}

export interface TeacherExamRow {
  id: number;
  classroomId: number | null;
  title: string;
  gradeId: number;
  bookId: string;
  examType: string;
  difficulty?: string;
  durationMinutes: number;
  maxScore: number;
  questions?: ExamQuestionItem[];
}

export interface TeacherExamAttemptRow {
  id: number;
  examId: number;
  examTitle: string;
  classroomId: number | null;
  studentId: number;
  studentName: string;
  score: number;
  maxScore: number;
  correctCount: number;
  totalQuestions: number;
  durationSeconds?: number;
  wrongTopics?: string[];
  strengths?: string[];
  gradedAnswers?: Array<{
    id: string;
    promptText: string;
    selected: string;
    correctAnswer: string;
    topicId: string;
    isCorrect: boolean;
  }>;
  teacherScore: number | null;
  teacherFeedback: string | null;
  completedAt: string;
}

export interface TeacherVideoRow {
  id: number;
  classroomId: number | null;
  title: string;
  gradeId: number;
  bookId: string;
  chapterId: string;
  durationLabel: string;
  videoUrl: string;
}

export interface TeacherAnnouncementRow {
  id: number;
  classroomId: number | null;
  title?: string | null;
  message: string;
  kind: string;
  scheduledDate: string | null;
}

export interface TeacherClassKpi {
  classroomId: number;
  classroomName: string;
  memberCount: number;
  avgExamScorePct: number | null;
  homeworkDeliveryPct: number | null;
  needsAttentionCount: number;
}

export interface TeacherDashboardData {
  user: DbUser;
  classrooms: TeacherClassroomRow[];
  enrollments: TeacherEnrollmentRow[];
  classStudentStats?: TeacherStudentStatRow[];
  questions: TeacherQuestionRow[];
  questionResponses?: TeacherQuestionResponseRow[];
  homeworks: TeacherHomeworkRow[];
  submissions: TeacherSubmissionRow[];
  exams: TeacherExamRow[];
  examAttempts?: TeacherExamAttemptRow[];
  videos: TeacherVideoRow[];
  announcements: TeacherAnnouncementRow[];
  globalAnnouncements?: Array<{
    id: number;
    title?: string | null;
    senderName: string;
    targetAudience: string;
    message: string;
    scheduledDate: string | null;
  }>;
  classKpis?: TeacherClassKpi[];
}

export type TeacherDeleteTarget =
  | { kind: 'question'; id: number; label: string }
  | { kind: 'video'; id: number; label: string }
  | { kind: 'homework'; id: number; label: string }
  | { kind: 'exam'; id: number; label: string }
  | { kind: 'announcement'; id: number; label: string }
  | { kind: 'member'; classroomId: number; studentId: number; label: string };
