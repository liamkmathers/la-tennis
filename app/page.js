"use client";

import { useEffect, useMemo, useState } from "react";

const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const displayTime = (time) => {
  const [rawHours, minutes] = time.split(":").map(Number);
  const suffix = rawHours >= 12 ? "PM" : "AM";
  const hours = rawHours % 12 || 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

const displayDate = (date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(`${date}T12:00:00`));

const isoDateFromOffset = (offsetDays) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const getBookableDates = () => Array.from({ length: 9 }, (_, index) => isoDateFromOffset(index));

export default function HomePage() {
  const [availability, setAvailability] = useState({ sources: [], slots: [], generatedAt: null, loading: true });
  const [bookableDates, setBookableDates] = useState([]);
  const [facilityOptions, setFacilityOptions] = useState([]);
  const [draftFilters, setDraftFilters] = useState({
    date: "",
    neighborhood: "all",
    after: "all",
    lights: false
  });
  const [appliedFilters, setAppliedFilters] = useState({
    date: "",
    neighborhood: "all",
    after: "all",
    lights: false
  });

  useEffect(() => {
    const dates = getBookableDates();
    setBookableDates(dates);
    setDraftFilters((current) => ({ ...current, date: current.date || dates[0] }));
    setAppliedFilters((current) => ({ ...current, date: current.date || dates[0] }));
  }, []);

  useEffect(() => {
    fetch("/api/facilities")
      .then((response) => response.json())
      .then((data) => setFacilityOptions(data.facilities ?? []))
      .catch(() => setFacilityOptions([]));
  }, []);

  useEffect(() => {
    if (!appliedFilters.date) return;

    const controller = new AbortController();
    setAvailability((current) => ({ ...current, loading: true }));

    const params = new URLSearchParams({
      date: appliedFilters.date,
      area: appliedFilters.neighborhood
    });

    fetch(`/api/availability?${params.toString()}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setAvailability({ ...data, loading: false }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setAvailability({ sources: [], slots: [], generatedAt: null, loading: false, error: true });
        }
      });

    return () => controller.abort();
  }, [appliedFilters.date, appliedFilters.neighborhood]);

  const neighborhoods = useMemo(() => {
    const known = facilityOptions.map((facility) => facility.neighborhood);
    const loaded = availability.slots.map((slot) => slot.neighborhood);
    return [...new Set([...known, ...loaded])].sort();
  }, [availability.slots, facilityOptions]);

  const filteredSlots = useMemo(() => {
    return availability.slots.filter((slot) => {
      if (appliedFilters.after !== "all" && timeToMinutes(slot.startTime) < Number(appliedFilters.after)) return false;
      if (appliedFilters.lights && !slot.lights) return false;
      return true;
    });
  }, [availability.slots, appliedFilters]);

  const nextSlot = filteredSlots[0];
  const hasPendingChanges = JSON.stringify(draftFilters) !== JSON.stringify(appliedFilters);
  const applyFilters = () => setAppliedFilters(draftFilters);

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">LA tennis availability</p>
          <h1>Court openings, pulled into one place.</h1>
        </div>
        <div className="status-strip">
          <span>{availability.sources.length} sources</span>
          <span>{filteredSlots.length} openings</span>
          <span>{availability.loading ? "Loading" : "Updated just now"}</span>
        </div>
      </section>

      <section className="workspace">
        <aside className="filters" aria-label="Availability filters">
          <label>
            Date
            <select
              value={draftFilters.date}
              onChange={(event) => setDraftFilters((current) => ({ ...current, date: event.target.value }))}
            >
              {bookableDates.map((date) => (
                <option key={date} value={date}>
                  {displayDate(date)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Area
            <select
              value={draftFilters.neighborhood}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, neighborhood: event.target.value }))
              }
            >
              <option value="all">All areas</option>
              {neighborhoods.map((neighborhood) => (
                <option key={neighborhood} value={neighborhood}>
                  {neighborhood}
                </option>
              ))}
            </select>
          </label>

          <label>
            Starts after
            <select
              value={draftFilters.after}
              onChange={(event) => setDraftFilters((current) => ({ ...current, after: event.target.value }))}
            >
              <option value="all">Any time</option>
              <option value="360">6:00 AM</option>
              <option value="720">12:00 PM</option>
              <option value="1020">5:00 PM</option>
              <option value="1140">7:00 PM</option>
            </select>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draftFilters.lights}
              onChange={(event) => setDraftFilters((current) => ({ ...current, lights: event.target.checked }))}
            />
            Lights available
          </label>

          <button className="search-button" type="button" onClick={applyFilters} disabled={availability.loading}>
            {availability.loading ? "Searching" : hasPendingChanges ? "Search" : "Refresh"}
          </button>
        </aside>

        <section className="results" aria-live="polite">
          <div className="summary-panel">
            <div>
              <p className="eyebrow">Best next option</p>
              <h2>{availability.loading ? "Checking WebTrac" : nextSlot ? nextSlot.venue : "No matching courts"}</h2>
            </div>
            {nextSlot && !availability.loading ? (
              <a className="primary-action" href={nextSlot.bookingUrl} target="_blank" rel="noreferrer">
                Book manually
              </a>
            ) : null}
          </div>

          <div className="slot-list">
            {!availability.loading &&
              filteredSlots.map((slot) => (
              <article className="slot-card" key={slot.id}>
                <div className="slot-time">
                  <strong>{displayDate(slot.date)}</strong>
                  <span>
                    {displayTime(slot.startTime)} - {displayTime(slot.endTime)}
                  </span>
                </div>
                <div className="slot-main">
                  <h3>{slot.venue}</h3>
                  <p>
                    {slot.neighborhood} · {slot.address}
                  </p>
                  <div className="tags">
                    <span>{slot.courts} court{slot.courts > 1 ? "s" : ""}</span>
                    <span>{slot.price}</span>
                    <span>{slot.surface}</span>
                    <span>{slot.lights ? "Lights" : "Daylight"}</span>
                    <span>{slot.source}</span>
                  </div>
                </div>
                <a className="secondary-action" href={slot.bookingUrl} target="_blank" rel="noreferrer">
                  Open
                </a>
              </article>
            ))}
            {availability.loading ? (
              <div className="empty-state">
                Checking LA Parks WebTrac for {appliedFilters.date ? displayDate(appliedFilters.date) : "the selected date"}.
              </div>
            ) : null}
            {!availability.loading && !filteredSlots.length ? (
              <div className="empty-state">
                No courts match those filters. Try widening the time or area.
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
