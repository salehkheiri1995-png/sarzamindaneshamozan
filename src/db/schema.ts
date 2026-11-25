import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  username: text('username'),
  passwordHash: text('password_hash'),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().default('parent'), // 'parent' | 'teacher' | 'admin'
  teacherApproved: boolean('teacher_approved').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  schoolName: text('school_name'),
  teachingGrades: text('teaching_grades').notNull().default('[]'),
  teachingSubjects: text('teaching_subjects').notNull().default('[]'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const studentProfiles = pgTable('student_profiles', {
  id: serial('id').primaryKey(),
  parentUid: text('parent_uid').notNull(),
  nickname: text('nickname').notNull(),
  username: text('username'),
  passwordHash: text('password_hash'),
  gradeId: integer('grade_id').notNull(), // 1..6
  academicYear: text('academic_year').notNull().default('1404-1405'),
  age: integer('age'),
  heroClass: text('hero_class').notNull().default('explorer'), // explorer | scholar | inventor | guardian
  avatarColor: text('avatar_color').notNull().default('#D97706'),
  equippedOutfit: text('equipped_outfit').notNull().default('cloak_default'),
  equippedPet: text('equipped_pet').notNull().default('none'),
  castleDecor: text('castle_decor').notNull().default('["banner_star"]'),
  ownedItems: text('owned_items').notNull().default('["cloak_default","banner_star"]'),
  coins: integer('coins').notNull().default(120),
  xp: integer('xp').notNull().default(0),
  streakDays: integer('streak_days').notNull().default(1),
  currentStreak: integer('current_streak').notNull().default(1),
  longestStreak: integer('longest_streak').notNull().default(1),
  lastActiveDate: text('last_active_date'),
  dailyQuestProgress: text('daily_quest_progress').notNull().default('{}'),
  earnedBadges: text('earned_badges').notNull().default('[]'),
  dailyLimitMinutes: integer('daily_limit_minutes').notNull().default(45),
  minutesUsedToday: integer('minutes_used_today').notNull().default(0),
  allowOptionalAds: boolean('allow_optional_ads').notNull().default(true),
  allowClassJoin: boolean('allow_class_join').notNull().default(true),
  lastGameType: text('last_game_type'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const classrooms = pgTable('classrooms', {
  id: serial('id').primaryKey(),
  teacherUid: text('teacher_uid').notNull(),
  name: text('name').notNull(),
  gradeId: integer('grade_id').notNull(),
  academicYear: text('academic_year').notNull().default('1404-1405'),
  subjects: text('subjects').notNull().default('["math","persian","science"]'),
  joinCode: text('join_code').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const classroomEnrollments = pgTable('classroom_enrollments', {
  id: serial('id').primaryKey(),
  classroomId: integer('classroom_id')
    .references(() => classrooms.id, { onDelete: 'cascade' })
    .notNull(),
  studentId: integer('student_id')
    .references(() => studentProfiles.id, { onDelete: 'cascade' })
    .notNull(),
  parentApproved: boolean('parent_approved').notNull().default(true),
  joinedAt: timestamp('joined_at').defaultNow(),
});

export const educationalContent = pgTable('educational_content', {
  id: serial('id').primaryKey(),
  classroomId: integer('classroom_id').references(() => classrooms.id, { onDelete: 'set null' }),
  gradeId: integer('grade_id').notNull(),
  bookId: text('book_id').notNull(),
  realmId: text('realm_id').notNull(),
  chapterId: text('chapter_id').notNull(),
  topicId: text('topic_id').notNull(),
  academicYear: text('academic_year').notNull().default('1404-1405'),
  difficulty: text('difficulty').notNull().default('easy'), // easy | medium | hard | challenge
  learningObjective: text('learning_objective').notNull(),
  storyIntro: text('story_intro').notNull(),
  hintText: text('hint_text').notNull(),
  questionType: text('question_type').notNull(), // mcq | word_builder | order_numbers | spelling_fix | match_pairs | true_false | pattern_puzzle | fill_blank | memory_cards | category_sort | shape_lab
  promptText: text('prompt_text').notNull(),
  imageDataUrl: text('image_data_url'),
  payloadJson: text('payload_json').notNull(),
  correctAnswer: text('correct_answer').notNull(),
  explanation: text('explanation').notNull(),
  contentSource: text('content_source').notNull().default('official_curriculum'), // official_curriculum | teacher | ai_generated
  reviewStatus: text('review_status').notNull().default('approved'), // pending_review | approved | rejected
  rejectionReason: text('rejection_reason'),
  authorUid: text('author_uid'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const missionAttempts = pgTable('mission_attempts', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id')
    .references(() => studentProfiles.id, { onDelete: 'cascade' })
    .notNull(),
  contentId: integer('content_id').references(() => educationalContent.id, { onDelete: 'set null' }),
  homeworkId: integer('homework_id'),
  gradeId: integer('grade_id').notNull(),
  bookId: text('book_id').notNull(),
  topicId: text('topic_id').notNull(),
  questionType: text('question_type').notNull(),
  studentAnswer: text('student_answer'),
  isCorrect: boolean('is_correct').notNull(),
  scoreEarned: integer('score_earned').notNull().default(0),
  coinsEarned: integer('coins_earned').notNull().default(0),
  durationSeconds: integer('duration_seconds').notNull().default(0),
  nextReviewAt: timestamp('next_review_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const homeworks = pgTable('homeworks', {
  id: serial('id').primaryKey(),
  classroomId: integer('classroom_id').references(() => classrooms.id, { onDelete: 'set null' }),
  creatorUid: text('creator_uid').notNull(),
  creatorRole: text('creator_role').notNull().default('teacher'), // teacher | parent
  gradeId: integer('grade_id').notNull(),
  bookId: text('book_id').notNull(),
  chapterId: text('chapter_id').notNull(),
  topicId: text('topic_id').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  dueDate: text('due_date').notNull(),
  questionsJson: text('questions_json').notNull(),
  attachmentName: text('attachment_name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const homeworkSubmissions = pgTable('homework_submissions', {
  id: serial('id').primaryKey(),
  homeworkId: integer('homework_id')
    .references(() => homeworks.id, { onDelete: 'cascade' })
    .notNull(),
  studentId: integer('student_id')
    .references(() => studentProfiles.id, { onDelete: 'cascade' })
    .notNull(),
  answersJson: text('answers_json').notNull(),
  autoScore: integer('auto_score').notNull().default(0),
  teacherScore: integer('teacher_score'),
  teacherFeedback: text('teacher_feedback'),
  status: text('status').notNull().default('submitted'), // submitted | graded | needs_revision
  submittedAt: timestamp('submitted_at').defaultNow(),
});

export const exams = pgTable('exams', {
  id: serial('id').primaryKey(),
  classroomId: integer('classroom_id').references(() => classrooms.id, { onDelete: 'set null' }),
  creatorUid: text('creator_uid').notNull(),
  gradeId: integer('grade_id').notNull(),
  bookId: text('book_id').notNull(),
  examType: text('exam_type').notNull().default('chapter_end'),
  title: text('title').notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(15),
  maxScore: integer('max_score').notNull().default(20),
  difficulty: text('difficulty').notNull().default('medium'),
  questionsJson: text('questions_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const examAttempts = pgTable('exam_attempts', {
  id: serial('id').primaryKey(),
  examId: integer('exam_id')
    .references(() => exams.id, { onDelete: 'cascade' })
    .notNull(),
  studentId: integer('student_id')
    .references(() => studentProfiles.id, { onDelete: 'cascade' })
    .notNull(),
  score: integer('score').notNull(),
  maxScore: integer('max_score').notNull(),
  correctCount: integer('correct_count').notNull(),
  totalQuestions: integer('total_questions').notNull(),
  durationSeconds: integer('duration_seconds').notNull(),
  wrongTopicsJson: text('wrong_topics_json').notNull().default('[]'),
  strengthsJson: text('strengths_json').notNull().default('[]'),
  answersJson: text('answers_json').notNull().default('[]'),
  teacherScore: integer('teacher_score'),
  teacherFeedback: text('teacher_feedback'),
  completedAt: timestamp('completed_at').defaultNow(),
});

export const teacherVideos = pgTable('teacher_videos', {
  id: serial('id').primaryKey(),
  classroomId: integer('classroom_id').references(() => classrooms.id, { onDelete: 'set null' }),
  teacherUid: text('teacher_uid').notNull(),
  gradeId: integer('grade_id').notNull(),
  bookId: text('book_id').notNull(),
  chapterId: text('chapter_id').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  durationLabel: text('duration_label').notNull().default('04:30'),
  videoUrl: text('video_url').notNull(),
  followUpQuestionJson: text('follow_up_question_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const announcements = pgTable('announcements', {
  id: serial('id').primaryKey(),
  classroomId: integer('classroom_id').references(() => classrooms.id, { onDelete: 'cascade' }),
  senderUid: text('sender_uid').notNull(),
  senderName: text('sender_name').notNull(),
  targetAudience: text('target_audience').notNull().default('classroom'), // classroom | all | teachers | parents
  title: text('title'),
  kind: text('kind').notNull().default('encouragement'), // homework | exam | video | encouragement | schedule | global
  message: text('message').notNull(),
  scheduledDate: text('scheduled_date'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const adEvents = pgTable('ad_events', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').references(() => studentProfiles.id, { onDelete: 'set null' }),
  placement: text('placement').notNull(), // home_banner | shop_banner | rewarded_chest
  eventType: text('event_type').notNull(), // request | impression | reward_completed | skipped
  rewardCoins: integer('reward_coins').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  recipientUid: text('recipient_uid'),
  studentId: integer('student_id').references(() => studentProfiles.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('student'), // student | parent | teacher | admin
  title: text('title').notNull(),
  body: text('body').notNull(),
  type: text('type').notNull().default('announcement'), // homework | exam | feedback | approval | announcement | badge
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const aiReportCache = pgTable('ai_report_cache', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id')
    .references(() => studentProfiles.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  reportJson: text('report_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
});

// Relations
export const classroomsRelations = relations(classrooms, ({ many }) => ({
  enrollments: many(classroomEnrollments),
  homeworks: many(homeworks),
  exams: many(exams),
  videos: many(teacherVideos),
  announcements: many(announcements),
}));

export const studentProfilesRelations = relations(studentProfiles, ({ many }) => ({
  enrollments: many(classroomEnrollments),
  attempts: many(missionAttempts),
  homeworkSubmissions: many(homeworkSubmissions),
  examAttempts: many(examAttempts),
}));

export const enrollmentsRelations = relations(classroomEnrollments, ({ one }) => ({
  classroom: one(classrooms, {
    fields: [classroomEnrollments.classroomId],
    references: [classrooms.id],
  }),
  student: one(studentProfiles, {
    fields: [classroomEnrollments.studentId],
    references: [studentProfiles.id],
  }),
}));
