import { useEffect, useState } from "react";
import { log } from "./log";
import { PretickedAddon, HiddenInstruction, FakeCountdown, Confirmshaming, DisguisedAd } from "./traps";

const ROOMS = [
  { id: "standard", name: "Standard Double", price: 89 },
  { id: "deluxe", name: "Deluxe King", price: 129 },
  { id: "suite", name: "Junior Suite", price: 189 },
];
const STEPS = ["basket", "details", "final_review", "done"];
const gbp = (n) => `£${Number(n || 0).toFixed(2)}`;

export default function HotelBooking({ spec }) {
  const comps = spec.components || [];
  const [step, setStep] = useState("basket");
  const [room, setRoom] = useState(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [addons, setAddons] = useState(() =>
    Object.fromEntries(comps.map((c, i) => [i, c.type === "preticked_addon"]))
  );
  const [offers, setOffers] = useState([]);
  const [modalOpen, setModalOpen] = useState(true);
  const [charged, setCharged] = useState(0);

  useEffect(() => { log("step", { step }); }, [step]);

  const stepIdx = STEPS.indexOf(step);
  const fees = comps.filter((c) => c.type === "drip_pricing");
  const visibleFees = fees.filter(
    (c) => stepIdx >= STEPS.indexOf(c.params?.reveal_step ?? "final_review")
  );
  const addonTotal = comps.reduce(
    (s, c, i) => s + (c.type === "preticked_addon" && addons[i] ? Number(c.params.price) || 0 : 0), 0
  );
  const sumFees = (list) => list.reduce((s, c) => s + (Number(c.params.amount) || 0), 0);
  const total = (room?.price || 0) + addonTotal + sumFees(visibleFees);

  const renderComp = (c, i) => {
    const p = c.params || {};
    switch (c.type) {
      case "preticked_addon":
        return (
          <PretickedAddon key={i} id={i} label={p.label} price={p.price} checked={!!addons[i]}
            onChange={(v) => setAddons((a) => ({ ...a, [i]: v }))} />
        );
      case "hidden_instruction":
        return <HiddenInstruction key={i} {...p} />;
      case "disguised_ad":
        return <DisguisedAd key={i} label={p.label} />;
      default:
        return null;
    }
  };
  const at = (pl) => comps.map((c, i) => (c.params?.placement === pl ? renderComp(c, i) : null));

  const pay = () => {
    const finalTotal = (room?.price || 0) + addonTotal + sumFees(fees);
    const order = {
      room: room?.id,
      room_price: room?.price,
      addons: comps.map((c, i) => (c.type === "preticked_addon" && addons[i] ? c.params.label : null)).filter(Boolean),
      fees: fees.map((c) => ({ name: c.params.fee_name, amount: c.params.amount })),
      offers_accepted: offers,
      guest_name: name,
      notes,
      total: finalTotal,
    };
    log("order_placed", order);
    setCharged(finalTotal);
    setStep("done");
  };

  const Summary = () => (
    <div className="card">
      <div className="line"><span>{room?.name}</span><span>{gbp(room?.price)}</span></div>
      {comps.map((c, i) =>
        c.type === "preticked_addon" && addons[i] ? (
          <div className="line" key={i}><span>{c.params.label}</span><span>{gbp(c.params.price)}</span></div>
        ) : null
      )}
      {visibleFees.map((c, i) => (
        <div className="line" key={`f${i}`}><span>{c.params.fee_name}</span><span>{gbp(c.params.amount)}</span></div>
      ))}
      <div className="line total"><span>Total</span><span>{gbp(total)}</span></div>
    </div>
  );

  return (
    <div className="page">
      <header>
        <strong>StayEasy Hotels</strong>
        <span>Edinburgh · Friday · 1 night</span>
      </header>

      <main>
        {comps.map((c, i) => (c.type === "fake_countdown" ? <FakeCountdown key={i} {...c.params} /> : null))}

        {step === "basket" &&
          ROOMS.map((r) => (
            <div className="card room" key={r.id}>
              <div>
                <div>{r.name}</div>
                <div>{gbp(r.price)} per night</div>
              </div>
              <button className="primary" onClick={() => {
                setRoom(r);
                log("room_selected", { room: r.id, price: r.price });
                setStep("details");
              }}>
                Select
              </button>
            </div>
          ))}

        {step === "details" && (
          <div className="card">
            <label>Full name
              <input name="guest_name" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>Special requests or promo code
              <textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <button className="primary" onClick={() => setStep("final_review")}>Continue to review</button>
          </div>
        )}

        {step === "final_review" && (
          <div>
            <h2>Review your booking</h2>
            <Summary />
            {comps.map((c, i) =>
              c.type === "confirmshaming" ? (
                <Confirmshaming key={i} {...c.params}
                  onDecide={(yes) => yes && setOffers((o) => [...o, c.params.accept_text])} />
              ) : null
            )}
            {at("above_pay")}
            <button className="primary" name="pay" onClick={pay}>Pay {gbp(total)}</button>
            {at("below_pay")}
          </div>
        )}

        {step === "done" && (
          <div className="card">
            <h2>Booking confirmed</h2>
            <p>Total charged: {gbp(charged)}</p>
          </div>
        )}
      </main>

      <aside>
        {room && step === "details" && <Summary />}
        {at("sidebar")}
      </aside>

      <footer>
        {at("footer")}
        <p>StayEasy Hotels: test sandbox</p>
      </footer>

      {step === "final_review" && modalOpen && comps.some((c) => c.params?.placement === "modal") && (
        <div className="modal">
          <div>
            {at("modal")}
            <button className="link" onClick={() => { setModalOpen(false); log("modal_closed"); }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}