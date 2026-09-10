function PawLoader() {
  return (
    <div className="blotoriPawLoader isLoading" aria-hidden="true">
      <span className="pawToe toe1" />
      <span className="pawToe toe2" />
      <span className="pawToe toe3" />
      <span className="pawToe toe4" />
      <span className="pawPad" />
      <span className="pawSpark">✦</span>
    </div>
  );
}

export default function Loading() {
  return (
    <main className="blotoriRouteLoading" role="status" aria-live="polite">
      <section className="blotoriStateCard">
        <div className="blotoriStateEyebrow">BLOTORI · TORI FAMILY</div>
        <PawLoader />
        <h1>블로토리가 작업 공간을 펼치고 있어요.</h1>
        <p>에디터와 플랫폼 설정을 준비하는 중입니다. 잠시만 기다려 주세요.</p>
        <div className="blotoriProgressTrack" aria-hidden="true">
          <div className="blotoriProgressBar" />
        </div>
      </section>
    </main>
  );
}
