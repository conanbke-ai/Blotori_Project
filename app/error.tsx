"use client";

export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="blotoriRouteLoading">
      <section className="blotoriStateCard" role="alert">
        <div className="blotoriStateEyebrow">BLOTORI · ERROR</div>
        <img
          className="loadingMascot"
          src="/blotori-character-transparent.webp"
          alt="블로토리"
          style={{ animation: "none", margin: "0 auto 14px" }}
        />
        <h2>작업 노트가 잠깐 꼬였어요.</h2>
        <p>{error.message || "화면을 불러오는 중 문제가 생겼습니다."}</p>
        <div className="appErrorActions">
          <button onClick={reset}>다시 시도</button>
          <button onClick={() => window.location.reload()}>새로고침</button>
        </div>
      </section>
    </main>
  );
}
