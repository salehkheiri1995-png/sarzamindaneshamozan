import { GoogleGenAI, Type } from '@google/genai';

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('کلید سرویس هوش مصنوعی (GEMINI_API_KEY) در تنظیمات سرور یافت نشد.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function explainMistakeWithAI(params: {
  gradeId: number;
  bookTitle: string;
  promptText: string;
  studentAnswer: string;
  correctAnswer: string;
}) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `دانش‌آموز پایه ${params.gradeId} ابتدایی در درس ${params.bookTitle} به این سؤال پاسخ داده است:
سؤال: ${params.promptText}
پاسخ دانش‌آموز: ${params.studentAnswer}
پاسخ صحیح: ${params.correctAnswer}

لطفاً با لحنی بسیار مهربان، تشویق‌کننده، ساده و مناسب سن دانش‌آموز پایه ${params.gradeId} ابتدایی ایران، در حداکثر ۳ جمله کوتاه توضیح بده چرا پاسخ صحیح این است و یک نکته طلایی یادگیری بده. از سرزنش خودداری کن.`,
    config: {
      systemInstruction:
        'تو یک معلم ابتدایی مهربان و صبور ایرانی در بازی آموزشی «سرزمین دانش‌آموزان قهرمان» هستی. همیشه به فارسی روان، کودک‌فهم، دقیق و علمی پاسخ بده.',
    },
  });

  return (response.text ?? '').trim();
}

function safeParseAiJson<T>(raw: string, fallbackError: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(fallbackError);
  }
}

export async function generateTeacherQuestionWithAI(params: {
  gradeId: number;
  bookId: string;
  bookTitle: string;
  chapterId: string;
  topicId: string;
  difficulty: string;
  questionType: 'mcq' | 'true_false' | 'fill_blank' | 'pattern_puzzle';
}) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `یک سؤال آموزشی دقیق، استاندارد و هماهنگ با کتاب درسی رسمی پایه ${params.gradeId} ابتدایی ایران تولید کن.
درس: ${params.bookTitle}
فصل: ${params.chapterId}
مبحث: ${params.topicId}
سطح دشواری: ${params.difficulty}
نوع سؤال: ${params.questionType}

قوانین مهم:
- حتماً متناسب با سن و پایه ${params.gradeId} باشد.
- اگر questionType برابر mcq است دقیقاً ۴ گزینه در options بده.
- اگر questionType برابر true_false است دقیقاً گزینه‌های ["درست", "نادرست"] بده.
- اگر questionType برابر fill_blank است ۳ گزینه کوتاه در options بده و در promptText جای خالی را با ______ نشان بده.
- اگر questionType برابر pattern_puzzle است یک دنباله عددی ۴ عددی با یک علامت «؟» در sequence و ۴ گزینه در options بده.
- correctAnswer باید دقیقاً یکی از مقادیر داخل options باشد.`,
    config: {
      systemInstruction:
        'تو دستیار آموزشی معلم ابتدایی ایران هستی. خروجی را دقیقاً مطابق اسکیمای JSON برگردان و صحت علمی را کامل رعایت کن.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          learningObjective: { type: Type.STRING },
          storyIntro: { type: Type.STRING },
          hintText: { type: Type.STRING },
          promptText: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          sequence: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          correctAnswer: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
        required: [
          'learningObjective',
          'storyIntro',
          'hintText',
          'promptText',
          'options',
          'correctAnswer',
          'explanation',
        ],
      },
    },
  });

  const raw = (response.text ?? '{}').trim();
  return safeParseAiJson<{
    learningObjective: string;
    storyIntro: string;
    hintText: string;
    promptText: string;
    options: string[];
    sequence?: string[];
    correctAnswer: string;
    explanation: string;
  }>(raw, 'پاسخ هوش مصنوعی ساختار معتبری نداشت. لطفاً دوباره تلاش کنید.');
}

export async function convertHomeworkWithAI(params: {
  gradeId: number;
  bookTitle: string;
  rawText: string;
  imageBase64?: string;
  imageMimeType?: string;
}) {
  const ai = getClient();
  const promptText = `این تکلیف مدرسه مربوط به پایه ${params.gradeId} ابتدایی و درس ${params.bookTitle} است.
متن یا توضیحات تکلیف: ${params.rawText || 'از تصویر پیوست شده استخراج کن'}

لطفاً این تکلیف را به ۳ مأموریت بازی تعاملی چهارگزینه‌ای استاندارد و کودک‌پسند تبدیل کن تا دانش‌آموز در قالب بازی آن را انجام دهد. هر مأموریت دارای promptText، ۴ گزینه در options، پاسخ دقیق correctAnswer (دقیقاً یکی از گزینه‌ها)، یک hintText ساده و یک explanation کوتاه باشد. همچنین یک فیلد ocrConfidenceNote بنویس که اگر بخشی از تصویر یا متن نیاز به بازبینی معلم/والدین دارد یادآوری کند.`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (params.imageBase64 && params.imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: params.imageMimeType,
        data: params.imageBase64,
      },
    });
  }
  parts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      systemInstruction:
        'تو موتور تبدیل تکلیف مدرسه به مأموریت بازی آموزشی برای دوره ابتدایی ایران هستی. محتوای دقیق، سالم و هماهنگ با پایه تولید کن.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ocrConfidenceNote: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                promptText: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswer: { type: Type.STRING },
                hintText: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ['promptText', 'options', 'correctAnswer', 'hintText', 'explanation'],
            },
          },
        },
        required: ['ocrConfidenceNote', 'questions'],
      },
    },
  });

  const raw = (response.text ?? '{}').trim();
  return safeParseAiJson<{
    ocrConfidenceNote: string;
    questions: Array<{
      promptText: string;
      options: string[];
      correctAnswer: string;
      hintText: string;
      explanation: string;
    }>;
  }>(raw, 'تبدیل تکلیف توسط هوش مصنوعی خروجی معتبری برنگرداند. لطفاً دوباره امتحان کنید.');
}

export async function analyzePerformanceWithAI(params: {
  studentName: string;
  gradeId: number;
  summaryText: string;
}) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `خلاصه عملکرد آموزشی دانش‌آموز «${params.studentName}» در پایه ${params.gradeId} ابتدایی:
${params.summaryText}

لطفاً یک تحلیل آموزشی کوتاه و کاربردی شامل ۳ بخش ارائه بده:
۱. نقاط قوت اصلی
۲. مباحث نیازمند مرور فاصله‌دار
۳. پیشنهاد عملی برای والدین و معلم در هفته آینده`,
    config: {
      systemInstruction:
        'تو مشاور آموزشی هوشمند دوره ابتدایی هستی. پاسخ را به فارسی روشن، ساختاری و کوتاه بنویس.',
    },
  });

  return (response.text ?? '').trim();
}
