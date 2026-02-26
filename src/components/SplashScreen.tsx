import { useState, useEffect } from "react";

const splashStyles = `
  .va-splash-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #0a0a0a;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    animation: vaFadeIn 800ms ease-out forwards;
  }
  .va-splash-overlay.va-splash-exit {
    animation: vaSlideUp 500ms ease-in forwards;
  }
  .va-splash-title {
    font-size: 48px;
    font-weight: 700;
    background: linear-gradient(135deg, #06b6d4, #8b5cf6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.02em;
  }
  .va-splash-subtitle {
    margin-top: 12px;
    font-size: 14px;
    color: #6b7280;
    letter-spacing: 0.05em;
  }
  @keyframes vaFadeIn {
    from { opacity: 0; transform: scale(0.8); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes vaSlideUp {
    from { opacity: 1; transform: translateY(0); }
    to   { opacity: 0; transform: translateY(-100vh); }
  }
`;

export default function SplashScreen({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"show" | "exit" | "done">("show");

  useEffect(() => {
    const exitTimer = setTimeout(() => setPhase("exit"), 1800);
    const doneTimer = setTimeout(() => setPhase("done"), 2300);
    return () => { clearTimeout(exitTimer); clearTimeout(doneTimer); };
  }, []);

  if (phase === "done") return <>{children}</>;

  return (
    <>
      <style>{splashStyles}</style>
      <div className={`va-splash-overlay${phase === "exit" ? " va-splash-exit" : ""}`}>
        <div className="va-splash-title">Built with VA</div>
        <div className="va-splash-subtitle">Wished into existence by va-wish-engine</div>
      </div>
      <div style={{ visibility: "hidden" }}>{children}</div>
    </>
  );
}
