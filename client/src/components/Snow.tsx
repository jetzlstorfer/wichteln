import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../lib/hooks';

interface Flake {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  phase: number;
  alpha: number;
}

/** Gentle snowfall behind the content. Pauses in background tabs, off for reduced motion. */
export function Snow({ density = 1 }: { density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduced) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let frame = 0;
    let last = performance.now();

    const makeFlake = (anywhere: boolean): Flake => ({
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -10,
      r: 0.8 + Math.random() * 2.4,
      speed: 18 + Math.random() * 40,
      drift: 8 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.35 + Math.random() * 0.55,
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.round(Math.min(110, (width * height) / 9000) * density);
      while (flakes.length < target) flakes.push(makeFlake(true));
      flakes.length = target;
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);
      for (const f of flakes) {
        f.phase += dt * 0.8;
        f.y += f.speed * dt;
        f.x += Math.sin(f.phase) * f.drift * dt;
        if (f.y > height + 10) Object.assign(f, makeFlake(false));
        if (f.x < -10) f.x = width + 10;
        if (f.x > width + 10) f.x = -10;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 250, 240, ${f.alpha})`;
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState === 'visible') {
        last = performance.now();
        frame = requestAnimationFrame(draw);
      }
    };

    resize();
    frame = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced, density]);

  if (reduced) return null;
  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />;
}
