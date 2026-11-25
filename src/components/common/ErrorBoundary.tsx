import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Uncaught UI error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="flex min-h-screen items-center justify-center bg-[#FBF7EF] px-4 text-stone-900"
        >
          <div className="w-full max-w-md rounded-3xl border border-[#E5DAC5] bg-white p-6 text-center shadow-lg">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl text-stone-900">
              یک خطای غیرمنتظره در نمایش صفحه رخ داد
            </h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              اطلاعات شما در سرور محفوظ است. با زدن دکمه زیر صفحه را مجدداً بارگذاری کنید.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-teal-800"
            >
              <RotateCcw className="h-4 w-4" />
              بارگذاری مجدد صفحه
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
