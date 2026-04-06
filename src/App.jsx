import { useState, useEffect, useRef, useCallback } from "react";

const ROUNDS = 10;
const TARGET_COUNT = 6;
const BASE_TIME = 3000;
const MIN_TIME = 1200;
const TIME_DECAY = 180; // ms less per round

const SHAPES = ["circle", "square", "triangle", "diamond", "star", "hexagon"];
const COLORS = [
  { name: "ROJO",     hex: "#ff3b5c" },
  { name: "AZUL",     hex: "#3b8bff" },
  { name: "VERDE",    hex: "#00e676" },
  { name: "AMARILLO", hex: "#ffe500" },
  { name: "MORADO",   hex: "#b94fff" },
  { name: "NARANJA",  hex: "#ff7c2a" },
];

const SHAPE_LABELS = {
  circle:   "CÍRCULO",
  square:   "CUADRADO",
  triangle: "TRIÁNGULO",
  diamond:  "ROMBO",
  star:     "ESTRELLA",
  hexagon:  "HEXÁGONO",
};

const STATES = { IDLE:"idle", COUNTDOWN:"countdown", PLAYING:"playing", RESULT:"result", GAMEOVER:"gameover" };

/* ── SVG shapes ── */
function ShapeIcon({ shape, color, size = 54, pulse = false }) {
  const p = { width: size, height: size, viewBox: "0 0 60 60" };
  const map = {
    circle:   <svg {...p}><circle cx="30" cy="30" r="26" fill={color}/></svg>,
    square:   <svg {...p}><rect x="6" y="6" width="48" height="48" rx="7" fill={color}/></svg>,
    triangle: <svg {...p}><polygon points="30,4 56,54 4,54" fill={color}/></svg>,
    diamond:  <svg {...p}><polygon points="30,4 56,30 30,56 4,30" fill={color}/></svg>,
    star:     <svg {...p}><polygon points="30,4 36,22 56,22 40,34 46,54 30,42 14,54 20,34 4,22 24,22" fill={color}/></svg>,
    hexagon:  <svg {...p}><polygon points="30,4 54,17 54,43 30,56 6,43 6,17" fill={color}/></svg>,
  };
  return (
    <div style={{ width:size, height:size, animation: pulse ? "pulse 0.8s ease-in-out infinite" : "none" }}>
      {map[shape]}
    </div>
  );
}

/* ── Generate targets ── */
function generateTargets(round) {
  const correctColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  const correctShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const correctIndex = Math.floor(Math.random() * TARGET_COUNT);

  // Speed increases with round: px/s
  const baseSpeed = 40 + round * 18;

  const targets = Array.from({ length: TARGET_COUNT }, (_, i) => {
    let color, shape;
    if (i === correctIndex) {
      color = correctColor; shape = correctShape;
    } else {
      do {
        color = COLORS[Math.floor(Math.random() * COLORS.length)];
        shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      } while (color.name === correctColor.name && shape === correctShape);
    }

    const angle = Math.random() * Math.PI * 2;
    const speed = baseSpeed * (0.7 + Math.random() * 0.6);
    return {
      id: i,
      color, shape,
      isCorrect: i === correctIndex,
      x: 10 + Math.random() * 80,   // % of container
      y: 10 + Math.random() * 80,
      vx: Math.cos(angle) * speed,  // px/s
      vy: Math.sin(angle) * speed,
    };
  });

  return { targets, correctColor, correctShape };
}

function getRating(avg) {
  if (avg < 350) return { label: "⚡ REFLEJOS DE ÉLITE",     color: "#00e676" };
  if (avg < 500) return { label: "🔥 MUY RÁPIDO",            color: "#ffe500" };
  if (avg < 700) return { label: "👍 BUEN TIEMPO",           color: "#3b8bff" };
  return           { label: "🐢 SIGUE PRACTICANDO",          color: "#ff7c2a" };
}

/* ── Main component ── */
export default function App() {
  const [gameState,   setGameState]   = useState(STATES.IDLE);
  const [positions,   setPositions]   = useState([]);   // live {x,y} per target
  const [targetDefs,  setTargetDefs]  = useState([]);   // static shape/color/velocity
  const [correctColor,setCorrectColor]= useState(null);
  const [correctShape,setCorrectShape]= useState(null);
  const [round,       setRound]       = useState(0);
  const [score,       setScore]       = useState(0);
  const [times,       setTimes]       = useState([]);
  const [lastResult,  setLastResult]  = useState(null);
  const [countdown,   setCountdown]   = useState(3);
  const [flashWrong,  setFlashWrong]  = useState(false);
  const [timeLeft,    setTimeLeft]    = useState(100);
  const [streak,      setStreak]      = useState(0);
  const [bestStreak,  setBestStreak]  = useState(0);
  const [timeLimit,   setTimeLimit]   = useState(BASE_TIME);

  const startRef    = useRef(null);
  const timerRef    = useRef(null);
  const countRef    = useRef(null);
  const animRef     = useRef(null);
  const lastFrameRef= useRef(null);
  const roundRef    = useRef(0);
  const posRef      = useRef([]);      // mutable copy for rAF
  const velRef      = useRef([]);
  const containerRef= useRef(null);
  const TARGET_SIZE = 70; // px

  const cleanup = () => {
    clearTimeout(timerRef.current);
    clearInterval(countRef.current);
    cancelAnimationFrame(animRef.current);
  };

  /* ── Animation loop ── */
  const startAnimation = useCallback(() => {
    lastFrameRef.current = null;

    const loop = (ts) => {
      if (!lastFrameRef.current) lastFrameRef.current = ts;
      const dt = Math.min((ts - lastFrameRef.current) / 1000, 0.05); // seconds, capped
      lastFrameRef.current = ts;

      const W = containerRef.current?.clientWidth  || 360;
      const H = containerRef.current?.clientHeight || 480;
      const maxX = W  - TARGET_SIZE;
      const maxY = H  - TARGET_SIZE;

      posRef.current = posRef.current.map((p, i) => {
        let { x, y } = p;
        let { vx, vy } = velRef.current[i];

        x += vx * dt;
        y += vy * dt;

        if (x <= 0)    { x = 0;    vx = Math.abs(vx); }
        if (x >= maxX) { x = maxX; vx = -Math.abs(vx); }
        if (y <= 0)    { y = 0;    vy = Math.abs(vy); }
        if (y >= maxY) { y = maxY; vy = -Math.abs(vy); }

        velRef.current[i] = { vx, vy };
        return { x, y };
      });

      setPositions([...posRef.current]);
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
  }, []);

  /* ── Answer handler ── */
  const handleAnswer = useCallback((correct, elapsed, currentRound, currentTimeLimit) => {
    cleanup();

    setLastResult({ correct, time: elapsed });

    if (correct) {
      setTimes(prev => [...prev, elapsed]);
      setScore(s => s + Math.max(50, Math.round(2000 - elapsed + (10 - currentRound) * 30)));
      setStreak(s => { const ns = s + 1; setBestStreak(b => Math.max(b, ns)); return ns; });
    } else {
      setFlashWrong(true);
      setTimeout(() => setFlashWrong(false), 350);
      setStreak(0);
    }

    setGameState(STATES.RESULT);

    setTimeout(() => {
      const next = currentRound + 1;
      if (next > ROUNDS) {
        setGameState(STATES.GAMEOVER);
      } else {
        roundRef.current = next;
        setRound(next);
        const nextLimit = Math.max(MIN_TIME, BASE_TIME - TIME_DECAY * (next - 1));
        setTimeLimit(nextLimit);
        launchRound(next, nextLimit);
      }
    }, 800);
  }, []);

  /* ── Launch a round ── */
  const launchRound = useCallback((roundNum, tLimit) => {
    cleanup();
    const { targets, correctColor: cc, correctShape: cs } = generateTargets(roundNum);
    setTargetDefs(targets);
    setCorrectColor(cc);
    setCorrectShape(cs);
    setLastResult(null);
    setTimeLeft(100);

    // init positions from % to px lazily (use % stored in targets)
    const W = containerRef.current?.clientWidth  || 360;
    const H = containerRef.current?.clientHeight || 480;
    posRef.current = targets.map(t => ({
      x: (t.x / 100) * (W - TARGET_SIZE),
      y: (t.y / 100) * (H - TARGET_SIZE),
    }));
    velRef.current = targets.map(t => ({ vx: t.vx, vy: t.vy }));
    setPositions([...posRef.current]);

    setGameState(STATES.COUNTDOWN);
    let c = 3;
    setCountdown(c);

    countRef.current = setInterval(() => {
      c--;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(countRef.current);
        setGameState(STATES.PLAYING);
        startRef.current = Date.now();
        startAnimation();

        // time bar
        const barInterval = setInterval(() => {
          const pct = Math.max(0, 100 - ((Date.now() - startRef.current) / tLimit) * 100);
          setTimeLeft(pct);
          if (pct <= 0) clearInterval(barInterval);
        }, 30);

        timerRef.current = setTimeout(() => {
          clearInterval(barInterval);
          handleAnswer(false, tLimit, roundNum, tLimit);
        }, tLimit);
      }
    }, 650);
  }, [startAnimation, handleAnswer]);

  const startGame = () => {
    cleanup();
    setScore(0); setTimes([]); setStreak(0); setBestStreak(0);
    roundRef.current = 1; setRound(1);
    const tl = BASE_TIME;
    setTimeLimit(tl);
    launchRound(1, tl);
  };

  const handleTargetClick = (idx) => {
    if (gameState !== STATES.PLAYING) return;
    const elapsed = Date.now() - startRef.current;
    handleAnswer(targetDefs[idx]?.isCorrect, elapsed, roundRef.current, timeLimit);
  };

  useEffect(() => () => cleanup(), []);

  const avg = times.length > 0
    ? Math.round(times.reduce((a,b) => a+b, 0) / times.length) : null;
  const accuracy = round > 1
    ? Math.round((times.length / (round - 1)) * 100) : 0;
  const roundTimeLimit = Math.max(MIN_TIME, BASE_TIME - TIME_DECAY * (round - 1));

  return (
    <div style={{
      minHeight: "100vh",
      background: flashWrong
        ? "#ff1744"
        : "linear-gradient(135deg,#080810 0%,#0d0d20 100%)",
      display: "flex", flexDirection: "column", alignItems: "center",
      fontFamily: "'Courier New', monospace",
      transition: "background 0.08s",
      userSelect: "none",
    }}>
      <style>{`
        @keyframes pulse     { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }
        @keyframes pop-in    { 0%{transform:scale(0.3) rotate(-12deg);opacity:0} 65%{transform:scale(1.1) rotate(2deg)} 100%{transform:scale(1) rotate(0);opacity:1} }
        @keyframes fade-up   { 0%{transform:translateY(28px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes cd-pop    { 0%{transform:scale(2.2);opacity:0} 55%{transform:scale(.88);opacity:1} 100%{transform:scale(1)} }
        @keyframes shake     { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-10px)} 75%{transform:translateX(10px)} }
        @keyframes float-in  { 0%{opacity:0;transform:scale(0.5)} 100%{opacity:1;transform:scale(1)} }
        .tgt { position:absolute; width:70px; height:70px; display:flex; align-items:center;
                justify-content:center; cursor:pointer; border-radius:50%;
                transition:filter 0.12s; will-change:transform; }
        .tgt:hover  { filter: brightness(1.35) drop-shadow(0 0 10px #fff6); }
        .tgt:active { filter: brightness(0.7); }
      `}</style>

      {/* ── Top HUD ── */}
      <div style={{ width:"100%", maxWidth:520, display:"flex", justifyContent:"space-between",
                    alignItems:"center", padding:"14px 20px 0", flexShrink:0 }}>
        <div>
          <div style={{ color:"#ffffff33", fontSize:9, letterSpacing:"0.35em" }}>RONDA</div>
          <div style={{ color:"#fff", fontSize:20, fontWeight:900 }}>
            {gameState===STATES.IDLE||gameState===STATES.GAMEOVER ? "—" : `${round}/${ROUNDS}`}
          </div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ color:"#ffffff33", fontSize:9, letterSpacing:"0.35em" }}>PUNTOS</div>
          <div style={{ color:"#ffe500", fontSize:20, fontWeight:900 }}>{score}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ color:"#ffffff33", fontSize:9, letterSpacing:"0.35em" }}>TIEMPO</div>
          <div style={{ color: roundTimeLimit < 1800 ? "#ff3b5c" : roundTimeLimit < 2400 ? "#ffe500" : "#00e676",
                        fontSize:20, fontWeight:900 }}>
            {(roundTimeLimit/1000).toFixed(1)}s
          </div>
        </div>
      </div>

      {/* ── Time bar ── */}
      <div style={{ width:"100%", maxWidth:520, height:5, background:"#ffffff0f",
                    margin:"10px 0 0", borderRadius:3, overflow:"hidden", flexShrink:0 }}>
        <div style={{
          height:"100%", width:`${timeLeft}%`,
          background: timeLeft>60 ? "#00e676" : timeLeft>30 ? "#ffe500" : "#ff3b5c",
          transition:"width 0.03s linear, background 0.3s", borderRadius:3,
        }}/>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
                    justifyContent:"center", width:"100%", maxWidth:520,
                    padding:"0 16px 16px", gap:14 }}>

        {/* IDLE */}
        {gameState === STATES.IDLE && (
          <div style={{ textAlign:"center", animation:"fade-up 0.5s ease-out" }}>
            <div style={{ fontSize:62, marginBottom:6 }}>🎯</div>
            <h1 style={{ color:"#fff", fontSize:"clamp(22px,7vw,36px)", fontWeight:900,
                         letterSpacing:"0.1em", margin:"0 0 10px" }}>REFLEX TARGET</h1>
            <p style={{ color:"#ffffff44", fontSize:11, letterSpacing:"0.18em", lineHeight:2.1,
                        maxWidth:300, margin:"0 auto 10px" }}>
              {TARGET_COUNT} figuras en movimiento · toca la correcta<br/>
              El tiempo se reduce cada ronda · {ROUNDS} rondas
            </p>

            {/* speed preview */}
            <div style={{ color:"#ffffff22", fontSize:10, letterSpacing:"0.3em", marginBottom:28 }}>
              {Array.from({length:ROUNDS},(_,i)=>{
                const t = Math.max(MIN_TIME, BASE_TIME - TIME_DECAY*i)/1000;
                return (
                  <span key={i} style={{
                    color: t<=1.5?"#ff3b5c":t<=2?"#ffe500":"#00e676",
                    marginRight:4
                  }}>{t.toFixed(1)}</span>
                );
              })}
              <span style={{opacity:.4}}> seg/ronda</span>
            </div>

            <div style={{ display:"flex", gap:10, justifyContent:"center", marginBottom:28 }}>
              {SHAPES.map((s,i) => <ShapeIcon key={s} shape={s} color={COLORS[i].hex} size={34}/>)}
            </div>

            <button onClick={startGame} style={{
              background:"linear-gradient(135deg,#3b8bff,#b94fff)",
              border:"none", borderRadius:12, color:"#fff", fontSize:14,
              fontWeight:900, letterSpacing:"0.3em", padding:"14px 44px",
              cursor:"pointer", fontFamily:"'Courier New',monospace",
            }}>JUGAR</button>
          </div>
        )}

        {/* COUNTDOWN */}
        {gameState === STATES.COUNTDOWN && (
          <div style={{ textAlign:"center" }}>
            <div key={countdown} style={{
              fontSize:110, fontWeight:900, lineHeight:1,
              color: countdown > 0 ? "#fff" : "#00e676",
              animation:"cd-pop 0.55s ease-out",
            }}>
              {countdown === 0 ? "¡YA!" : countdown}
            </div>
            <p style={{ color:"#ffffff33", fontSize:9, letterSpacing:"0.45em", marginTop:14 }}>
              TIEMPO: {(roundTimeLimit/1000).toFixed(1)}s
            </p>
          </div>
        )}

        {/* PLAYING / RESULT */}
        {(gameState === STATES.PLAYING || gameState === STATES.RESULT) && (
          <>
            {/* Instruction */}
            <div style={{ textAlign:"center", background:"#ffffff08",
                          border:"1px solid #ffffff14", borderRadius:14,
                          padding:"10px 20px", width:"100%", flexShrink:0 }}>
              <p style={{ color:"#ffffff33", fontSize:9, letterSpacing:"0.35em", margin:"0 0 6px" }}>
                TOCA EL
              </p>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                <ShapeIcon shape={correctShape} color={correctColor?.hex} size={30}
                           pulse={gameState===STATES.PLAYING}/>
                <span style={{ color:correctColor?.hex,
                               fontSize:"clamp(13px,4vw,19px)", fontWeight:900, letterSpacing:"0.15em" }}>
                  {correctColor?.name}
                </span>
                <span style={{ color:"#ffffff22" }}>·</span>
                <span style={{ color:"#fff", fontSize:"clamp(13px,4vw,19px)",
                               fontWeight:900, letterSpacing:"0.1em" }}>
                  {SHAPE_LABELS[correctShape]}
                </span>
              </div>
            </div>

            {/* Result flash */}
            {gameState === STATES.RESULT && lastResult && (
              <div style={{ textAlign:"center", animation:"pop-in 0.28s ease-out", minHeight:32 }}>
                {lastResult.correct ? (
                  <span style={{ color:"#00e676", fontSize:20, fontWeight:900, letterSpacing:"0.1em" }}>
                    ✓ {lastResult.time}ms
                    {streak > 1 && <span style={{ color:"#ffe500", fontSize:13, marginLeft:8 }}>🔥×{streak}</span>}
                  </span>
                ) : (
                  <span style={{ color:"#ff3b5c", fontSize:18, fontWeight:900, letterSpacing:"0.1em",
                                 display:"inline-block", animation:"shake 0.3s ease-out" }}>
                    ✗ {lastResult.time >= timeLimit ? "¡TIEMPO!" : "INCORRECTO"}
                  </span>
                )}
              </div>
            )}

            {/* Moving targets arena */}
            <div ref={containerRef} style={{
              position:"relative", width:"100%",
              height: "clamp(260px, 50vw, 380px)",
              background:"#ffffff05", borderRadius:16,
              border:"1px solid #ffffff0e", overflow:"hidden", flexShrink:0,
            }}>
              {targetDefs.map((t, idx) => (
                <div
                  key={t.id}
                  className="tgt"
                  onClick={() => handleTargetClick(idx)}
                  style={{
                    left: positions[idx]?.x ?? 0,
                    top:  positions[idx]?.y ?? 0,
                    animation: `float-in 0.25s ease-out`,
                    pointerEvents: gameState === STATES.RESULT ? "none" : "auto",
                    opacity: gameState === STATES.RESULT ? 0.35 : 1,
                  }}
                >
                  <ShapeIcon shape={t.shape} color={t.color.hex} size={54}/>
                </div>
              ))}
            </div>
          </>
        )}

        {/* GAMEOVER */}
        {gameState === STATES.GAMEOVER && (
          <div style={{ textAlign:"center", animation:"fade-up 0.5s ease-out", width:"100%" }}>
            <div style={{ fontSize:52, marginBottom:6 }}>🏆</div>
            <h2 style={{ color:"#fff", fontSize:"clamp(20px,6vw,32px)", fontWeight:900,
                         letterSpacing:"0.1em", margin:"0 0 18px" }}>FIN DEL JUEGO</h2>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10,
                          width:"100%", marginBottom:18 }}>
              {[
                { label:"PUNTOS",       value: score,                       color:"#ffe500" },
                { label:"PRECISIÓN",    value: `${accuracy}%`,              color:"#3b8bff" },
                { label:"PROMEDIO",     value: avg ? `${avg}ms` : "—",      color:"#00e676" },
                { label:"MEJOR RACHA",  value: `🔥 ${bestStreak}`,          color:"#ff7c2a" },
              ].map(stat => (
                <div key={stat.label} style={{
                  background:"#ffffff08", border:"1px solid #ffffff14",
                  borderRadius:12, padding:"13px 10px",
                }}>
                  <div style={{ color:"#ffffff33", fontSize:9, letterSpacing:"0.25em", marginBottom:4 }}>
                    {stat.label}
                  </div>
                  <div style={{ color:stat.color, fontSize:"clamp(18px,5vw,26px)", fontWeight:900 }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {avg && (
              <p style={{ color:getRating(avg).color, fontSize:15, fontWeight:900,
                          letterSpacing:"0.2em", marginBottom:22 }}>
                {getRating(avg).label}
              </p>
            )}

            <button onClick={startGame} style={{
              background:"linear-gradient(135deg,#3b8bff,#b94fff)",
              border:"none", borderRadius:12, color:"#fff", fontSize:13,
              fontWeight:900, letterSpacing:"0.3em", padding:"13px 40px",
              cursor:"pointer", fontFamily:"'Courier New',monospace",
            }}>JUGAR DE NUEVO</button>
          </div>
        )}
      </div>
    </div>
  );
}