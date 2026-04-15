"use client";
import * as React from "react";


export function FadeTransition({ show, children, duration = 300 }: {
  show: boolean;
  children: React.ReactNode;
  duration?: number;
}) {
  const [shouldRender, setShouldRender] = React.useState(show);
  const [visible, setVisible] = React.useState(show);
  const nodeRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (show) {
      setShouldRender(true);
      setVisible(false);
      // Гарантируем, что opacity: 1 применяется после рендера (двойной rAF + setTimeout)
      requestAnimationFrame(() => {
        setTimeout(() => setVisible(true), 10);
      });
    } else if (nodeRef.current) {
      setVisible(false);
      const timeout = setTimeout(() => setShouldRender(false), duration);
      return () => clearTimeout(timeout);
    }
  }, [show, duration]);

  return shouldRender ? (
    <div
      ref={nodeRef}
      style={{
        transition: `opacity ${duration}ms, transform ${duration}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  ) : null;
}
