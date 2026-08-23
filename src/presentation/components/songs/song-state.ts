// Design Ref: §3.5, §10.1 C-6 — UI 상태 판정은 컴포넌트 밖 순수 함수에 둔다.
// 두 상태 머신이 이 한 파일에 산다: ① 번호 편집의 확정 판정(NumberCell), ② §5.2 브랜드 변환
// 3분기 판정(AddSongFlow). 둘 다 "번호 3-state"라는 같은 계약 위에서 돌기 때문에 같이 둔다.
// 여기의 함수는 React·fetch·DOM을 모른다 — vitest로 전 분기가 고정된다(Plan FR-01·FR-02).
import type { Brand } from "@/domain";
import type { NumberView } from "@/application/ports/song-query";

// ① NumberCell의 확정 판정 — Check 단계 G-1 수정(touched 기반)을 그대로 이관한다.
//
// UNSUPPORTED와 "행 없음"은 입력칸이 똑같이 "" 비어 보이므로 문자열 비교(draft === initial)로는
// 두 상태를 구분할 수 없다. 처음 구현은 이 때문에 UNSUPPORTED에서 "지우고 확정"이 영원히 발동
// 못 하는 사각지대가 있었다(값이 이미 ""이라 "변경 없음"으로 오판). 그래서 "값이 무엇인가"가
// 아니라 "사용자가 실제로 타이핑했는가"(touched)로 판정한다 — 아무것도 안 건드리고 나가면
// 상태 그대로, 건드린 뒤 비워서 나가면(중간에 다시 지워도 포함) 진짜 "지우고 확정"이다.
export type CommitDecision =
  | { kind: "noop" } // 안 건드림 — 조용히 편집만 닫는다
  | { kind: "clear" } // 지우고 확정 → 행 삭제(행 없음)
  | { kind: "available"; number: string }; // 번호 확정 → AVAILABLE

export function commitDecision(draft: string, touched: boolean): CommitDecision {
  if (!touched) return { kind: "noop" };
  const trimmed = draft.trim();
  if (trimmed === "") return { kind: "clear" };
  return { kind: "available", number: trimmed };
}

// ② ARCHITECT §5.2 브랜드 변환 3분기 판정 — 오늘 세션의 브랜드 기준으로만 판정한다(Design D-N:
// 표시는 그날 기록대로, 판정은 오늘 기준). 세 분기 모두 "번호 입력 제안"과 "건너뛰고 추가"를
// 갖추므로, 여기서 하는 일은 어떤 안내를 띄울지 고르는 것뿐이다.
export type AddDecision =
  | { kind: "available"; number: string } // 즉시 추가 (탭 1회)
  | { kind: "unsupported" } // 이 기기에선 미지원 — 안내 + 번호 제안 + 건너뛰기
  | { kind: "missing" }; // 번호가 아직 없음 — 안내 + 번호 제안 + 건너뛰기

export function addDecision(
  numbers: Record<Brand, NumberView>,
  todayBrand: Brand,
): AddDecision {
  const view = numbers[todayBrand];
  if (!view) return { kind: "missing" };
  if (view.status === "UNSUPPORTED") return { kind: "unsupported" };
  // song_numbers의 CHECK(status <> 'AVAILABLE' OR number IS NOT NULL)가 non-null을 보장한다.
  // 그래도 DB 밖(직렬화 사고 등)에서 깨져 들어오면 "번호 없음"으로 떨어뜨린다 — 빈 번호를
  // 그대로 POST해 엉뚱한 곡을 만드는 것보다 안내를 띄우는 편이 안전하다.
  if (view.number === null || view.number === "") return { kind: "missing" };
  return { kind: "available", number: view.number };
}
