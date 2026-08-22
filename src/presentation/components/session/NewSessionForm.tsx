"use client";

// Design Ref: §5.4 세션 생성 화면, §4.2 POST /api/sessions
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Brand } from "@/domain";
import { useToast } from "@/presentation/components/ui/toast";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewSessionForm({ hasOpenSession }: { hasOpenSession: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [visitDate, setVisitDate] = useState(todayDate());
  const [venue, setVenue] = useState("");
  const [brand, setBrand] = useState<Brand | "">("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brand) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitDate, venue, brand }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "세션 생성에 실패했어요");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "세션 생성에 실패했어요");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 py-6">
      {hasOpenSession && (
        <p className="rounded-lg bg-surface-raised px-3 py-2 text-sm text-accent">
          진행 중인 플리는 자동으로 마감됩니다.
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-text-dim">
        날짜
        <input
          type="date"
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
          required
          className="rounded-lg bg-surface px-3 py-2 text-text outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-text-dim">
        지점
        <input
          type="text"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          maxLength={100}
          required
          placeholder="수노래방 강남점"
          className="rounded-lg bg-surface px-3 py-2 text-text outline-none placeholder:text-text-dim"
        />
      </label>

      <fieldset className="flex flex-col gap-1 text-sm text-text-dim">
        <legend className="mb-1">브랜드</legend>
        <div className="flex gap-2">
          {(["TJ", "KY"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBrand(b)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                brand === b ? "bg-primary text-bg" : "bg-surface text-text"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={!brand || submitting}
        className="mt-2 rounded-full bg-primary px-6 py-2 text-sm font-medium text-bg disabled:opacity-50"
      >
        시작하기
      </button>
    </form>
  );
}
