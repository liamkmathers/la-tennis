const MYICLUB_BASE = "https://www.myiclubonline.com";
const MEMBERS_URL = `${MYICLUB_BASE}/iclub/members#activities/classes`;
const LOGIN_URL = `${MYICLUB_BASE}/iclub/performLogin`;
const CLASS_SCHEDULE_URL = `${MYICLUB_BASE}/iclub/scheduling/classSchedule.htm`;

const FACILITIES = [
  {
    id: "trifit-santa-monica",
    name: "TriFit Santa Monica",
    location: "Tennis Court WEST",
    clubNumber: "30075",
    address: "2425 Colorado Ave, Santa Monica, CA 90404",
    neighborhood: "Santa Monica",
    reserveUrl: MEMBERS_URL
  }
];

const getSetCookieHeaders = (headers) => {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const header = headers.get("set-cookie");
  return header ? [header] : [];
};

const storeCookies = (jar, headers) => {
  getSetCookieHeaders(headers).forEach((cookie) => {
    const [pair] = cookie.split(";");
    const [name, ...valueParts] = pair.split("=");
    if (name && valueParts.length) jar.set(name.trim(), valueParts.join("="));
  });
};

const cookieHeader = (jar) =>
  [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");

const formatMyiclubDate = (date) =>
  `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;

const dateToIso = (value) => {
  const [month, day, year] = value.split("/").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const timeToMinutes = (value) => {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3]?.toUpperCase();
  if (suffix === "PM" && hours !== 12) hours += 12;
  if (suffix === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const hasCapacity = (event) => Number(event.enrolled) < Number(event.maxEnrollment);

const isTennisCourt = (event, facility) =>
  String(event.eventName ?? "").toLowerCase() === "tennis" &&
  String(event.locationName ?? "").toLowerCase().includes(facility.location.toLowerCase());

function normalizeClassEvent(event, facility) {
  const startMinutes = timeToMinutes(event.eventStartTime);
  const endMinutes = timeToMinutes(event.eventEndTime);
  if (startMinutes === null || endMinutes === null) return null;

  return {
    id: `trifit-${facility.id}-${event.eventItemId ?? `${event.eventDate}-${event.eventStartTime}`}`,
    sourceId: "trifit-myi",
    venue: `${facility.name} ${event.locationName ?? "Tennis Court"}`,
    neighborhood: facility.neighborhood,
    address: facility.address,
    date: dateToIso(event.eventDate),
    startTime: minutesToTime(startMinutes),
    endTime: minutesToTime(endMinutes),
    courts: 1,
    price: "Member",
    surface: "Hard",
    lights: endMinutes > 18 * 60,
    indoor: false,
    bookingUrl: facility.reserveUrl,
    reservationUrl: facility.reserveUrl,
    facility: facility.location,
    classDescription: event.eventDescription ?? ""
  };
}

export function parseTriFitClasses(events, facility = FACILITIES[0]) {
  return events
    .filter((event) => isTennisCourt(event, facility) && hasCapacity(event))
    .map((event) => normalizeClassEvent(event, facility))
    .filter(Boolean);
}

async function requestWithCookies(url, { followRedirects = 0, jar, ...options } = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...(jar?.size ? { cookie: cookieHeader(jar) } : {}),
      ...(options.headers ?? {})
    },
    redirect: "manual",
    signal: AbortSignal.timeout(25000)
  });
  if (jar) storeCookies(jar, response.headers);

  if (followRedirects > 0 && response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      return requestWithCookies(new URL(location, url).toString(), {
        ...options,
        followRedirects: followRedirects - 1,
        jar,
        headers: {
          ...(options.headers ?? {}),
          referer: url
        }
      });
    }
  }

  return response;
}

async function signIn({ username, password }) {
  const jar = new Map();
  await requestWithCookies(MEMBERS_URL, { jar });

  const body = new URLSearchParams({
    username,
    password,
    "spring-security-redirect": "/iclub/members#activities/classes"
  });

  const response = await requestWithCookies(LOGIN_URL, {
    jar,
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: MYICLUB_BASE,
      referer: MEMBERS_URL
    },
    body
  });

  if (response.status >= 400) {
    throw new Error(`TriFit login returned ${response.status}`);
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      await requestWithCookies(new URL(location, MYICLUB_BASE).toString(), {
        followRedirects: 3,
        jar,
        headers: { referer: LOGIN_URL }
      });
    }
  }

  return jar;
}

async function fetchFacilityAvailability(facility, { date = new Date() } = {}) {
  const username = process.env.TRIFIT_USERNAME;
  const password = process.env.TRIFIT_PASSWORD;

  if (!username || !password) {
    throw new Error("TriFit credentials are not configured");
  }

  const jar = await signIn({ username, password });
  const params = new URLSearchParams({
    club: facility.clubNumber,
    lowDate: formatMyiclubDate(date),
    highDate: formatMyiclubDate(date)
  });

  const response = await requestWithCookies(`${CLASS_SCHEDULE_URL}?${params.toString()}`, {
    followRedirects: 3,
    jar,
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "x-requested-with": "XMLHttpRequest",
      referer: MEMBERS_URL
    }
  });

  if (!response.ok) {
    throw new Error(`TriFit schedule returned ${response.status}`);
  }

  const events = await response.json();
  return parseTriFitClasses(Array.isArray(events) ? events : [], facility);
}

const facilityMatchesArea = (facility, area) =>
  !area || area === "all" || facility.neighborhood === area || facility.id === area;

export async function fetchTriFitAvailability({ date, area } = {}) {
  const facilities = FACILITIES.filter((facility) => facilityMatchesArea(facility, area));
  if (!facilities.length) return { slots: [], errors: [] };

  const settled = await Promise.allSettled(
    facilities.map((facility) => fetchFacilityAvailability(facility, { date }))
  );
  const slots = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const errors = settled.flatMap((result, index) =>
    result.status === "rejected" ? [`${facilities[index].name}: ${result.reason.message}`] : []
  );

  return { slots, errors };
}

export { FACILITIES as triFitFacilities };
