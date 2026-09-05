import { useEffect, useState } from "react";

interface Props {
  onDone: () => void;
}

const steps = [
  "Initializing secure storage...",
  "Loading Chopcord engine...",
  "Checking connection...",
  "Ready.",
];

export default function SplashScreen({ onDone }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [logoVisible, setLogoVisible] = useState(false);
  const [textVisible, setTextVisible] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Stagger logo and text entrance
    const t1 = setTimeout(() => setLogoVisible(true), 100);
    const t2 = setTimeout(() => setTextVisible(true), 500);

    // Cycle through step text
    let i = 0;
    const stepInterval = setInterval(() => {
      i++;
      if (i < steps.length) {
        setStepIndex(i);
        setBarWidth(((i + 1) / steps.length) * 100);
      } else {
        clearInterval(stepInterval);
      }
    }, 520);

    setBarWidth(25);

    // Exit
    const t3 = setTimeout(() => {
      setExiting(true);
      setTimeout(onDone, 450);
    }, 2600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearInterval(stepInterval);
    };
  }, [onDone]);

  return (
    <>
      <style>{`
        @keyframes chop-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.7; transform: scale(0.96); }
        }
        @keyframes chop-spin {
          to { stroke-dashoffset: 0; }
        }
        @keyframes chop-fadein {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes chop-fadeout {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        @keyframes chop-bar {
          from { width: 0; }
        }
        @keyframes chop-float {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-6px); }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--color-background)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          animation: exiting ? "chop-fadeout 0.45s ease forwards" : undefined,
        }}
      >
        {/* Background grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `
              linear-gradient(rgba(88,101,242,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(88,101,242,0.03) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
            pointerEvents: "none",
          }}
        />

        {/* Glow */}
        <div
          style={{
            position: "absolute",
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(88,101,242,0.08) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Logo */}
        <div
          style={{
            opacity: logoVisible ? 1 : 0,
            transform: logoVisible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.9)",
            transition: "opacity 0.6s ease, transform 0.6s cubic-bezier(0.34,1.56,0.64,1)",
            marginBottom: 28,
            animation: logoVisible ? "chop-float 3s ease-in-out infinite" : undefined,
          }}
        >
          <LogoMark />
        </div>

        {/* App name */}
        <div
          style={{
            opacity: textVisible ? 1 : 0,
            transform: textVisible ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s",
            textAlign: "center",
            marginBottom: 40,
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: "var(--color-text)",
              letterSpacing: "-0.02em",
              lineHeight: 1,
              marginBottom: 6,
            }}
          >
            Chop<span style={{ color: "var(--color-primary)" }}>Cord</span>
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--color-text-muted)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
            }}
          >
            Privacy-first Discord client
          </div>
        </div>

        {/* Progress bar + step text */}
        <div
          style={{
            width: 240,
            opacity: textVisible ? 1 : 0,
            transition: "opacity 0.4s ease 0.3s",
          }}
        >
          {/* Track */}
          <div
            style={{
              height: 2,
              background: "var(--color-surface-3)",
              borderRadius: 2,
              overflow: "hidden",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${barWidth}%`,
                background: "linear-gradient(90deg, var(--color-primary), var(--color-accent))",
                borderRadius: 2,
                transition: "width 0.5s cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          </div>

          <div
            key={stepIndex}
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-muted)",
              textAlign: "center",
              animation: "chop-fadein 0.3s ease",
            }}
          >
            {steps[stepIndex]}
          </div>
        </div>

        {/* Version tag */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            right: 20,
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-subtle)",
          }}
        >
          v2.0.0 — by saeedmasoudie
        </div>
      </div>
    </>
  );
}

function LogoMark() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
      {/* Outer hex */}
      <path
        d="M40 6L70 22V58L40 74L10 58V22L40 6Z"
        stroke="rgba(88,101,242,0.2)"
        strokeWidth="1"
        fill="none"
      />
      {/* Inner hex */}
      <path
        d="M40 16L62 28V52L40 64L18 52V28L40 16Z"
        stroke="rgba(88,101,242,0.12)"
        strokeWidth="1"
        fill="rgba(88,101,242,0.04)"
      />
      {/* Main logo shape */}
      <path
        d="M40 24L56 33V51L40 60L24 51V33L40 24Z"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
        fill="rgba(88,101,242,0.08)"
        strokeLinejoin="round"
      />
      {/* Cross lines */}
      <path
        d="M40 24V60M24 33L56 51M56 33L24 51"
        stroke="var(--color-primary)"
        strokeWidth="1"
        opacity="0.4"
      />
      {/* Center dot */}
      <circle cx="40" cy="42" r="4" fill="var(--color-primary)" />
      {/* Accent dot */}
      <circle cx="40" cy="42" r="2" fill="var(--color-accent)" />

      {/* Spinning orbit ring */}
      <circle
        cx="40" cy="42" r="20"
        stroke="var(--color-primary)"
        strokeWidth="0.5"
        strokeDasharray="4 8"
        fill="none"
        opacity="0.3"
        style={{ animation: "chop-spin 8s linear infinite", transformOrigin: "40px 42px" }}
      />
    </svg>
  );
}
