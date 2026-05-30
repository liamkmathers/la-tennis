const ACTIVE_BASE = "https://anc.apm.activecommunities.com";
const SITE_PATH = "/santamonicarecreation";
const SOURCE_ID = "santamonica-activenet";
const EVENT_TYPE_ID = 62;

const FACILITIES = [
  {
    id: "reed-park",
    name: "Reed Park",
    location: "Reed Park Tennis Courts",
    neighborhood: "Reed Park",
    address: "7th St. & Wilshire Blvd., Santa Monica, CA 90403",
    resources: [
      { id: 342, name: "Court 1" },
      { id: 343, name: "Court 2" },
      { id: 364, name: "Court 3" },
      { id: 365, name: "Court 4" },
      { id: 366, name: "Court 5" },
      { id: 367, name: "Court 6" }
    ]
  },
  {
    id: "ocean-view-park",
    name: "Ocean View Park",
    location: "Ocean View Park Tennis Courts",
    neighborhood: "Ocean View Park",
    address: "Ocean Park Blvd. & Barnard Way, Santa Monica, CA 90405",
    resources: [
      { id: 368, name: "Court 1" },
      { id: 352, name: "Court 2" },
      { id: 353, name: "Court 3" },
      { id: 354, name: "Court 4" },
      { id: 355, name: "Court 5" },
      { id: 356, name: "Court 6" }
    ]
  }
].map((facility) => ({
  ...facility,
  reserveUrl: `${ACTIVE_BASE}${SITE_PATH}/reservation/landing/search`
}));

const AVAILABLE_STATUSES = new Set([0, 1]);

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeApiTime = (value) => {
  if (!value) return null;
  const time = String(value).trim();
  const match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3]?.toUpperCase();
  if (suffix === "PM" && hours !== 12) hours += 12;
  if (suffix === "AM" && hours === 12) hours = 0;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const timeToMinutes = (value) => {
  const normalized = normalizeApiTime(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const bookingUrlFor = (resourceId) =>
  `${ACTIVE_BASE}${SITE_PATH}/reservation/landing/search/detail/${resourceId}`;

const extractTimeValue = (time, names) => {
  for (const name of names) {
    if (time?.[name]) return time[name];
  }
  return null;
};

function normalizeTimeSlot({ dailyDetail, facility, resource, time, index }) {
  const rawStart = extractTimeValue(time, [
    "start_time",
    "startTime",
    "from_time",
    "fromTime",
    "start_event_time",
    "startEventTime",
    "start_event_datetime",
    "startEventDatetime"
  ]);
  const rawEnd = extractTimeValue(time, [
    "end_time",
    "endTime",
    "to_time",
    "toTime",
    "end_event_time",
    "endEventTime",
    "end_event_datetime",
    "endEventDatetime"
  ]);
  const startTime = normalizeApiTime(rawStart);
  let endTime = normalizeApiTime(rawEnd);

  if (!endTime && startTime) {
    const duration = Number(time.duration ?? time.length ?? time.reservation_unit ?? 60);
    const startMinutes = timeToMinutes(startTime);
    if (startMinutes !== null) endTime = minutesToTime(startMinutes + duration);
  }

  if (!startTime || !endTime) return null;

  const bookingUrl = bookingUrlFor(resource.id);
  return {
    id: `santamonica-${facility.id}-${resource.id}-${dailyDetail.date}-${startTime}-${index}`,
    sourceId: SOURCE_ID,
    venue: `${facility.name} ${resource.name}`,
    neighborhood: facility.neighborhood,
    address: facility.address,
    date: dailyDetail.date,
    startTime,
    endTime,
    courts: 1,
    price: "City rate",
    surface: "Hard",
    lights: timeToMinutes(endTime) > 18 * 60,
    indoor: false,
    bookingUrl,
    reservationUrl: bookingUrl,
    facility: facility.location,
    rawStatus: dailyDetail.status
  };
}

export function parseActiveNetAvailability(payload, facility, resource) {
  const dailyDetails = payload?.body?.details?.daily_details ?? [];
  return dailyDetails.flatMap((dailyDetail) => {
    if (!AVAILABLE_STATUSES.has(Number(dailyDetail.status))) return [];
    return (dailyDetail.times ?? [])
      .map((time, index) => normalizeTimeSlot({ dailyDetail, facility, resource, time, index }))
      .filter(Boolean);
  });
}

async function fetchResourceAvailability(facility, resource, { date = new Date() } = {}) {
  const searchDate = formatDate(date);
  const params = new URLSearchParams({
    start_date: searchDate,
    end_date: searchDate,
    customer_id: "",
    company_id: "",
    event_type_id: String(EVENT_TYPE_ID),
    attendee: "1",
    no_cache: "true"
  });
  const response = await fetch(
    `${ACTIVE_BASE}${SITE_PATH}/rest/reservation/resource/availability/daily/${resource.id}?${params.toString()}`,
    {
      headers: {
        accept: "application/json, text/plain, */*",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        referer: bookingUrlFor(resource.id)
      },
      signal: AbortSignal.timeout(25000)
    }
  );

  if (!response.ok) {
    throw new Error(`ActiveNet availability returned ${response.status}`);
  }

  const payload = await response.json();
  const responseCode = payload?.headers?.response_code;
  if (responseCode && responseCode !== "0000") {
    throw new Error(payload?.headers?.response_message ?? `ActiveNet response ${responseCode}`);
  }

  return parseActiveNetAvailability(payload, facility, resource);
}

const facilityMatchesArea = (facility, area) =>
  !area || area === "all" || facility.neighborhood === area || facility.id === area;

export async function fetchSantaMonicaActiveNetAvailability({ date, area } = {}) {
  const facilities = FACILITIES.filter((facility) => facilityMatchesArea(facility, area));
  if (!facilities.length) return { slots: [], errors: [] };

  const jobs = facilities.flatMap((facility) =>
    facility.resources.map((resource) => ({ facility, resource }))
  );
  const settled = await Promise.allSettled(
    jobs.map(({ facility, resource }) => fetchResourceAvailability(facility, resource, { date }))
  );
  const slots = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const errors = settled.flatMap((result, index) =>
    result.status === "rejected"
      ? [`${jobs[index].facility.name} ${jobs[index].resource.name}: ${result.reason.message}`]
      : []
  );

  return { slots, errors };
}

export { FACILITIES as santaMonicaFacilities, SOURCE_ID as santaMonicaSourceId };
