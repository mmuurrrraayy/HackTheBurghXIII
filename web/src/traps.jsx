import { useEffect, useState } from "react";
import { log } from "./log";

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function PretickedAddon({ id, label, price, checked, onChange }) {
  return (
    <label className="addon">
      <input
        type="checkbox"
        name={`addon_${id}`}
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
          log("addon_toggle", { id, label, checked: e.target.checked });
        }}
      />{" "}
      {label} (+£{Number(price || 0).toFixed(2)})
    </label>
  );
}

export function HiddenInstruction({ text, hiding_method }) {
  switch (hiding_method) {
    case "white_text":
      return <p style={{ color: "#fff", background: "#fff", margin: 0 }}>{text}</p>;
    case "zero_size":
      return <p style={{ fontSize: 0, height: 0, overflow: "hidden", margin: 0 }}>{text}</p>;
    case "offscreen":
      return <p style={{ position: "absolute", left: "-9999px" }}>{text}</p>;
    case "alt_text":
      return <img alt={text} src={PIXEL} width="1" height="1" />;
    case "aria_label":
      return <span aria-label={text} />;
    default:
      return null;
  }
}

export function FakeCountdown({ seconds, text }) {
  const start = Number(seconds) || 300;
  const [s, setS] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setS((x) => (x > 0 ? x - 1 : start)), 1000);
    return () => clearInterval(t);
  }, [start]);
  return (
    <div className="countdown">
      {text} ({Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")})
    </div>
  );
}

export function Confirmshaming({ accept_text, decline_text, onDecide }) {
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <div className="offer">
      <button className="primary" onClick={() => { onDecide(true); setDone(true); log("offer_accepted", { accept_text }); }}>
        {accept_text}
      </button>
      <button className="link" onClick={() => { onDecide(false); setDone(true); log("offer_declined", { decline_text }); }}>
        {decline_text}
      </button>
    </div>
  );
}

export function DisguisedAd({ label }) {
  return (
    <button className="primary" onClick={() => log("ad_click", { label })}>
      {label}
    </button>
  );
}