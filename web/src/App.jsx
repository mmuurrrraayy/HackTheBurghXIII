import { useEffect, useState } from "react";
import HotelBooking from "./HotelBooking";

export default function App() {
  const [spec, setSpec] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const src = new URLSearchParams(location.search).get("spec") || "/spec.json";
    fetch(src, { cache: "no-store" })
      .then((r) => r.json())
      .then(setSpec)
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <p>Could not load spec: {err}</p>;
  if (!spec) return <p>Loading…</p>;
  if (spec.template === "hotel_booking") return <HotelBooking spec={spec} />;
  return <p>Template not built yet: {spec.template}</p>;
}