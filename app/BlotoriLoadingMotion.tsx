export default function BlotoriLoadingMotion({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`blotoriCharacterMotion ${compact ? "compact" : ""}`} aria-hidden="true">
      <span className="motionSpark sparkOne">✦</span>
      <span className="motionSpark sparkTwo">✧</span>
      <span className="motionNote noteOne" />
      <span className="motionNote noteTwo" />
      <img
        className="loadingMascot"
        src="/blotori-character-transparent.webp"
        alt=""
        draggable={false}
      />
    </div>
  );
}
