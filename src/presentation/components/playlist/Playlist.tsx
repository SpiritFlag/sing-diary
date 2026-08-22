"use client";

// Design Ref: §5.3, §5.4, §6.2 — entries 상태 소유 · dnd 컨텍스트 · 낙관적 갱신
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EntryWithSong } from "@/application/ports/entry-repo";
import type { Session } from "@/domain";
import { useToast } from "@/presentation/components/ui/toast";
import { AddByNumber } from "./AddByNumber";
import { EntryRow } from "./EntryRow";

interface ApiError {
  error?: { message?: string };
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body: ApiError | null = await res.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

export function Playlist({
  session,
  initialEntries,
}: {
  session: Session;
  initialEntries: EntryWithSong[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [entries, setEntries] = useState(initialEntries);
  const [newStubIds, setNewStubIds] = useState<Set<string>>(new Set());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function handleAdd(number: string) {
    const res = await fetch(`/api/sessions/${session.id}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number }),
    });
    if (!res.ok) {
      toast.show(await parseErrorMessage(res, "곡 추가에 실패했어요"));
      return;
    }
    const { data } = (await res.json()) as {
      data: EntryWithSong & { isNewStub: boolean };
    };
    setEntries((prev) => [...prev, data]);
    if (data.isNewStub) {
      setNewStubIds((prev) => new Set(prev).add(data.id));
    }
    router.refresh();
  }

  async function handleScoreChange(entryId: string, score: number | null) {
    const prevEntries = entries;
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, score: score === null ? null : score.toFixed(2) } : e)));
    const res = await fetch(`/api/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score }),
    });
    if (!res.ok) {
      setEntries(prevEntries);
      toast.show(await parseErrorMessage(res, "점수 저장에 실패했어요"));
      return;
    }
    router.refresh();
  }

  async function handleDelete(entryId: string) {
    const prevEntries = entries;
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    const res = await fetch(`/api/entries/${entryId}`, { method: "DELETE" });
    if (!res.ok) {
      setEntries(prevEntries);
      toast.show(await parseErrorMessage(res, "삭제에 실패했어요"));
      return;
    }
    router.refresh();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = entries.findIndex((e) => e.id === active.id);
    const newIndex = entries.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...entries];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    const prevEntries = entries;
    setEntries(reordered);

    const res = await fetch(`/api/sessions/${session.id}/entries/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryIds: reordered.map((e) => e.id) }),
    });
    if (!res.ok) {
      setEntries(prevEntries);
      toast.show(await parseErrorMessage(res, "순서 변경에 실패했어요"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      {entries.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 text-center text-text-dim">
          번호를 입력해 첫 곡을 추가하세요
        </p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={entries.map((e) => e.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
              {entries.map((entry, index) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  position={index + 1}
                  isNewStub={newStubIds.has(entry.id)}
                  onScoreChange={(score) => handleScoreChange(entry.id, score)}
                  onDelete={() => handleDelete(entry.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <AddByNumber onAdd={handleAdd} />
    </div>
  );
}
