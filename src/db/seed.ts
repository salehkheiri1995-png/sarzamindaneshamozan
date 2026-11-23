import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { educationalContent, exams } from './schema.ts';
import { GRADES, OFFICIAL_SEED_MISSIONS } from '../shared/curriculum.ts';

let seededPromise: Promise<void> | null = null;

export async function ensureCurriculumSeeded(): Promise<void> {
  if (seededPromise) {
    return seededPromise;
  }

  seededPromise = (async () => {
    try {
      const existingOfficial = await db
        .select({
          gradeId: educationalContent.gradeId,
          topicId: educationalContent.topicId,
          questionType: educationalContent.questionType,
        })
        .from(educationalContent)
        .where(eq(educationalContent.contentSource, 'official_curriculum'));

      const existingKeys = new Set(
        existingOfficial.map((e) => `${e.gradeId}:${e.topicId}:${e.questionType}`)
      );

      const missingMissions = OFFICIAL_SEED_MISSIONS.filter(
        (m) => !existingKeys.has(`${m.gradeId}:${m.topicId}:${m.questionType}`)
      );

      if (missingMissions.length > 0) {
        await db.insert(educationalContent).values(
          missingMissions.map((m) => ({
            gradeId: m.gradeId,
            bookId: m.bookId,
            realmId: m.realmId,
            chapterId: m.chapterId,
            topicId: m.topicId,
            academicYear: '1404-1405',
            difficulty: m.difficulty,
            learningObjective: m.learningObjective,
            storyIntro: m.storyIntro,
            hintText: m.hintText,
            questionType: m.questionType,
            promptText: m.promptText,
            payloadJson: JSON.stringify(m.payload),
            correctAnswer: m.correctAnswer,
            explanation: m.explanation,
            contentSource: 'official_curriculum',
            reviewStatus: 'approved',
            authorUid: 'system_curriculum',
          }))
        );
      }

      const [{ examTotal }] = await db.select({ examTotal: count() }).from(exams);

      if (Number(examTotal) === 0) {
        const defaultExams = GRADES.map((grade) => {
          const gradeMissions = OFFICIAL_SEED_MISSIONS.filter(
            (m) =>
              m.gradeId === grade.id &&
              (m.questionType === 'mcq' ||
                m.questionType === 'true_false' ||
                m.questionType === 'fill_blank' ||
                m.questionType === 'pattern_puzzle')
          );

          const questions = gradeMissions.map((m, idx) => {
            const opts =
              (m.payload.options as string[] | undefined) ??
              (m.payload.choices as string[] | undefined) ??
              ['درست', 'نادرست'];
            return {
              id: `q_${grade.id}_${idx + 1}`,
              topicId: m.topicId,
              bookId: m.bookId,
              promptText: m.promptText,
              options: opts,
              correctAnswer: m.correctAnswer,
              explanation: m.explanation,
            };
          });

          return {
            classroomId: null,
            creatorUid: 'system_curriculum',
            gradeId: grade.id,
            bookId: 'math',
            examType: 'placement',
            title: `آزمون جامع تعیین سطح ${grade.title}`,
            durationMinutes: 10,
            maxScore: 20,
            difficulty: 'medium',
            questionsJson: JSON.stringify(questions),
          };
        });

        await db.insert(exams).values(defaultExams);
      }
    } catch (error) {
      seededPromise = null;
      console.error('Failed to seed official curriculum:', error);
      throw new Error('خطا در بارگذاری محتوای درسی پایه.', { cause: error });
    }
  })();

  return seededPromise;
}
