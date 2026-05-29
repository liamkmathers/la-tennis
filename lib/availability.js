const today = new Date();
const isoDate = (offsetDays) => {
  const date = new Date(today);
  date.setDate(today.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

import { fetchLacityWebtracAvailability, lacityFacilities } from "./providers/lacityWebtrac";
import { fetchTriFitAvailability, triFitFacilities } from "./providers/trifitMyiclub";

const liveSource = {
  id: "lacity-webtrac",
  name: "LA Parks WebTrac",
  status: "live",
  lastChecked: null
};

const triFitSource = {
  id: "trifit-myi",
  name: "TriFit MyiClub",
  status: "live",
  lastChecked: null
};

const sampleSources = [
  {
    id: "laparks",
    name: "LA Parks",
    status: "sample",
    lastChecked: new Date().toISOString()
  },
  {
    id: "playbypoint",
    name: "PlayByPoint",
    status: "sample",
    lastChecked: new Date(Date.now() - 1000 * 60 * 11).toISOString()
  },
  {
    id: "courtreserve",
    name: "CourtReserve",
    status: "sample",
    lastChecked: new Date(Date.now() - 1000 * 60 * 18).toISOString()
  }
];

const sampleSlots = [
  {
    id: "griffith-1",
    sourceId: "laparks",
    venue: "Griffith Park Riverside Courts",
    neighborhood: "Los Feliz",
    address: "3401 Riverside Dr, Los Angeles, CA",
    date: isoDate(0),
    startTime: "17:00",
    endTime: "18:00",
    courts: 2,
    price: "$12",
    surface: "Hard",
    lights: true,
    indoor: false,
    bookingUrl: "https://www.laparks.org/sports/tennis"
  },
  {
    id: "griffith-2",
    sourceId: "laparks",
    venue: "Griffith Park Riverside Courts",
    neighborhood: "Los Feliz",
    address: "3401 Riverside Dr, Los Angeles, CA",
    date: isoDate(1),
    startTime: "19:00",
    endTime: "20:30",
    courts: 1,
    price: "$18",
    surface: "Hard",
    lights: true,
    indoor: false,
    bookingUrl: "https://www.laparks.org/sports/tennis"
  },
  {
    id: "cheviot-1",
    sourceId: "laparks",
    venue: "Cheviot Hills Tennis Courts",
    neighborhood: "Cheviot Hills",
    address: "2551 Motor Ave, Los Angeles, CA",
    date: isoDate(0),
    startTime: "20:00",
    endTime: "21:00",
    courts: 1,
    price: "$12",
    surface: "Hard",
    lights: true,
    indoor: false,
    bookingUrl: "https://www.laparks.org/sports/tennis"
  },
  {
    id: "echo-1",
    sourceId: "playbypoint",
    venue: "Echo Park Tennis",
    neighborhood: "Echo Park",
    address: "Glendale Blvd, Los Angeles, CA",
    date: isoDate(2),
    startTime: "08:00",
    endTime: "09:30",
    courts: 3,
    price: "$16",
    surface: "Hard",
    lights: false,
    indoor: false,
    bookingUrl: "https://app.playbypoint.com/"
  },
  {
    id: "silverlake-1",
    sourceId: "playbypoint",
    venue: "Silver Lake Tennis Club",
    neighborhood: "Silver Lake",
    address: "Silver Lake Blvd, Los Angeles, CA",
    date: isoDate(1),
    startTime: "06:30",
    endTime: "08:00",
    courts: 1,
    price: "$22",
    surface: "Hard",
    lights: false,
    indoor: false,
    bookingUrl: "https://app.playbypoint.com/"
  },
  {
    id: "hollywood-1",
    sourceId: "courtreserve",
    venue: "Hollywood Recreation Tennis",
    neighborhood: "Hollywood",
    address: "1122 Cole Ave, Los Angeles, CA",
    date: isoDate(0),
    startTime: "18:30",
    endTime: "20:00",
    courts: 1,
    price: "$24",
    surface: "Hard",
    lights: true,
    indoor: false,
    bookingUrl: "https://courtreserve.com/"
  }
];

export function getSampleSources() {
  return sampleSources;
}

function normalizeSlots(slots, sources) {
  return slots
    .map((slot) => ({
      ...slot,
      source: sources.find((source) => source.id === slot.sourceId)?.name ?? "Unknown"
    }))
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
}

export function getSampleAvailability() {
  return normalizeSlots(sampleSlots, sampleSources);
}

const dateFromIso = (date) => {
  if (!date) return undefined;
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export function getFacilityOptions() {
  return [...lacityFacilities, ...triFitFacilities].map(({ id, name, location, neighborhood }) => ({
    id,
    name,
    location,
    neighborhood
  }));
}

export async function getAvailability({ date, area } = {}) {
  try {
    const searchDate = dateFromIso(date);
    const [lacitySettled, triFitSettled] = await Promise.allSettled([
      fetchLacityWebtracAvailability({ date: searchDate, area }),
      fetchTriFitAvailability({ date: searchDate, area })
    ]);
    const lacityResult =
      lacitySettled.status === "fulfilled"
        ? lacitySettled.value
        : { slots: [], errors: [`LA Parks WebTrac: ${lacitySettled.reason.message}`] };
    const triFitResult =
      triFitSettled.status === "fulfilled"
        ? triFitSettled.value
        : { slots: [], errors: [`TriFit MyiClub: ${triFitSettled.reason.message}`] };
    const checkedAt = new Date().toISOString();
    const liveSources = [
      { ...liveSource, lastChecked: checkedAt },
      { ...triFitSource, lastChecked: checkedAt }
    ];
    return {
      mode: "live",
      searchDate: date,
      searchArea: area,
      facilities: getFacilityOptions(),
      warnings: [...lacityResult.errors, ...triFitResult.errors],
      sources: liveSources,
      slots: normalizeSlots([...lacityResult.slots, ...triFitResult.slots], liveSources)
    };
  } catch (error) {
    return {
      mode: "sample-fallback",
      searchDate: date,
      error: error.message,
      sources: sampleSources,
      slots: getSampleAvailability()
    };
  }
}
