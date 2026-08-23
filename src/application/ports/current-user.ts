// Design Ref: refine-auth-boundary §2.3 D-B — "현재 사용자가 누구인가"만 추상화한다.
// 리다이렉트 같은 전송 고유 실패 처리는 이 포트의 관심사가 아니다.
export interface CurrentUserProvider {
  /** 현재 요청의 인증 사용자 id. 미인증이면 null. */
  currentUserId(): Promise<string | null>;
}
